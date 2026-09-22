/**
 * THE `/go/<code>` LOOKUP (short-links spec §2.4, §2.5).
 *
 * `(conferenceId, code) → path and query | null`. The route resolves the
 * conference from the Host and calls in here; everything this module returns
 * is a RELATIVE target, so the redirect can only ever land on the host that
 * was asked. A stored `link` with a foreign host — hand-edited in Studio, or
 * minted on a domain the conference has since demoted — contributes its path
 * and query and nothing else. That is the whole open-redirect defence: there
 * is no host check because no host survives.
 *
 * Caching is the point of the slice. Every click would otherwise be a Sanity
 * read, and the project has a 250k request/month ceiling. `'use cache: remote'`
 * rather than plain `'use cache'`: the plain form is in-memory and does not
 * survive a serverless invocation, so on Vercel it would cache almost nothing.
 * `cacheComponents: true` in `next.config.ts` enables it.
 */

import { cacheLife, cacheTag } from 'next/cache'
import { shortLinkIndexTag, shortLinkTag } from '@/lib/cache/tags'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { normalizeShortCode } from './short-code'
import { taggedUrl } from './link'
import { isOutreach } from './outreach'
import type { TaskKind } from './types'

/** The projection the lookup reads, for BOTH document types in one root. */
export interface ShortLinkRow {
  _id: string
  _type: 'socialPostVariant' | 'marketingTask'
  /** `socialPostVariant` only: the stored tagged link. */
  link: string | null
  /** `marketingTask` only. */
  kind: TaskKind | null
  targetPage: string | null
  taskKey: string | null
  campaignKey: string | null
}

/**
 * The origin an outreach target is derived against. Only the PATH AND QUERY of
 * the result is ever used, and the redirect is issued on the host that was
 * asked, so the origin here is a placeholder — deliberately NOT the
 * conference's own base URL, which would add a third component to the cache key
 * for no behavioural difference. `taggedUrl`'s off-origin guard (a `targetPage`
 * of `//evil.example`) works identically against it.
 */
const DERIVATION_ORIGIN = 'https://short-link.invalid'

/**
 * A hit lives a day: §2.5's "steady state is one read per code per day,
 * whatever the click count". A Studio edit that nothing revalidates is seen
 * within that day.
 */
export const SHORT_LINK_HIT_LIFE = {
  stale: 60 * 5,
  revalidate: 60 * 60 * 24,
  expire: 60 * 60 * 24,
} as const

/**
 * A miss lives minutes. It is cached at all so a dead code in a popular post
 * cannot drain the quota, and only briefly because it carries no document tag
 * — there is no document to revalidate it from when the code is later minted.
 */
export const SHORT_LINK_MISS_LIFE = {
  stale: 60,
  revalidate: 60 * 5,
  expire: 60 * 10,
} as const

/**
 * The relative target a row resolves to, or `null` when it resolves to
 * nothing — an unknown code, a stored `link` that does not parse, or an
 * outreach target that no longer derives. The route sends `null` to the
 * conference home page with no UTMs.
 */
export function shortLinkTargetFor(row: ShortLinkRow | null): string | null {
  if (!row) return null
  const absolute =
    row._type === 'socialPostVariant' ? row.link : outreachLink(row)
  if (!absolute) return null
  let url: URL
  try {
    url = new URL(absolute)
  } catch {
    return null
  }
  // PATH AND QUERY, never the host — and the leading slashes are COLLAPSED.
  // `new URL('https://ours.dev//evil.example/x').pathname` is
  // `//evil.example/x`, and resolving that against our origin is a
  // network-path reference, i.e. an open redirect to evil.example. One
  // leading slash makes it an ordinary path on our own host, which simply
  // 404s — §2.4: the redirect does not second-guess the link.
  return `${url.pathname.replace(/^\/+/, '/')}${url.search}`
}

/** An outreach Task's target, derived exactly as the message's `{url}` is. */
function outreachLink(row: ShortLinkRow): string | null {
  // A code on any other Kind is data that should not exist: a publishing
  // Task's code lives on its variant, and no other Kind has a link to shorten.
  if (!row.kind || !isOutreach(row.kind)) return null
  if (!row.targetPage || !row.taskKey || !row.campaignKey) return null
  try {
    return taggedUrl({
      baseUrl: DERIVATION_ORIGIN,
      targetPage: row.targetPage,
      channel: 'outreach',
      campaignKey: row.campaignKey,
      taskKey: row.taskKey,
    })
  } catch {
    // `taggedUrl` throws on a `targetPage` that is not a site path or that
    // leaves our origin. §2.4: that is the home page, not a 500.
    return null
  }
}

/**
 * How long the code INDEX may go without re-reading Sanity.
 *
 * An hour, not minutes, because freshness does NOT rest on this: every write
 * that creates, backfills or deletes a code expires
 * `shortLinkIndexTag(conferenceId)`, so a newly minted code is resolvable on
 * the very next request. The life is the self-healing backstop for anything
 * that changes a code without going through those paths — a hand-edit in the
 * dataset, say — and the ceiling on what a scanner can cost.
 *
 * WORST CASE UNDER CONSTANT ATTACK: one read per hour per conference, i.e.
 * 24 * 30 = 720 reads a month per conference however many codes are walked.
 * Before the index, each distinct well-formed code cost its own read, so
 * ~250 000 requests could drain the monthly quota on their own.
 */
export const SHORT_LINK_INDEX_LIFE = {
  stale: 60,
  revalidate: 60 * 60,
  expire: 60 * 60 * 2,
} as const

/**
 * How many codes the index will hold before it stops claiming to be complete.
 * A conference's plan carries a few hundred; this is a safety valve, not a
 * design limit. Past it the route degrades to the per-code read — correctness
 * over quota — rather than start answering "unknown" for codes that exist.
 */
export const SHORT_LINK_INDEX_CAP = 20_000

/** `null` means "too many to index" — the caller must not treat it as empty. */
export type ShortCodeIndex = ReadonlySet<string> | null

/**
 * Every code THIS conference holds, cached per conference (spec §2.4, "A
 * scanner costs nothing").
 *
 * NOT the same query as `conferenceShortCodes` in `short-code-sanity.ts`,
 * and the difference is deliberate: the MINT must avoid drawing a code a
 * draft already holds, so it includes drafts; this one must agree with the
 * resolver, which excludes them, or a draft's code would pass the gate and
 * buy a read — or worse, look resolvable. Both exclusions are spelled out
 * here for the same reason they are in the lookup.
 */
export async function conferenceShortCodeIndex(
  conferenceId: string,
): Promise<ShortCodeIndex> {
  'use cache: remote'
  cacheLife(SHORT_LINK_INDEX_LIFE)
  cacheTag(shortLinkIndexTag(conferenceId))
  const codes = await scopedFetch<unknown>(
    clientReadUncached,
    { conferenceId },
    // SLICED to the cap + 1. Without the slice the over-cap branch below
    // still transfers every code before discarding the lot — paying the full
    // cost of an index it then refuses to build. One extra row is enough to
    // tell "at the cap" from "over it".
    `*[_type in ["socialPostVariant", "marketingTask"] && defined(shortCode) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0...$cap].shortCode`,
    { cap: SHORT_LINK_INDEX_CAP + 1 },
  )
  // A shape we do not recognise must not be read as "this conference holds no
  // codes" — that would send every real short link to the home page. Fail
  // OPEN to the per-code read, which is the pre-index behaviour.
  if (!Array.isArray(codes)) return null
  if (codes.length > SHORT_LINK_INDEX_CAP) return null
  // NORMALIZED, because the route normalizes before it asks. A stored code is
  // not guaranteed lowercase — `shortCodeForMutation` normalizes on write and
  // `createShortCodeMinter` normalizes when checking what is taken, so the
  // rest of the system already tolerates `ABC987`. An index holding the raw
  // value would answer `index.has('abc987')` with false and send a REAL short
  // link to the home page.
  const index = new Set<string>()
  for (const value of codes) {
    const code = normalizeShortCode(value)
    if (code) index.add(code)
  }
  return index
}

/**
 * THE cached lookup. `conferenceId` is resolved from the Host by the caller
 * and is part of the cache key, so a code that belongs to another conference
 * is simply a miss here — indistinguishable from an unknown one, which is the
 * point.
 */
export async function resolveShortLink(
  conferenceId: string,
  code: string,
): Promise<string | null> {
  'use cache: remote'
  // ONE root filter over both types: `scopedFetch` splices the tenant
  // predicate into the FIRST root only, so a second root would read every
  // tenant. Drafts and versions are excluded explicitly — the server clients
  // carry a token and see them, and a Studio draft's `link` must never win
  // over the published one. The literal stays INLINE here so the tenancy lint
  // rule can see which callee scopes it.
  const row = await scopedFetch<ShortLinkRow | null>(
    // The UNCACHED client, deliberately. Sanity's CDN has a cache of its own
    // that `revalidateTag` cannot reach, so a refill landing just after a
    // repair or a delete could read the OLD target from the CDN and pin it
    // here for a day — the exact staleness §2.5 requires the expiry to end.
    // It costs nothing: `'use cache: remote'` already holds a hit for a day,
    // so this runs about once per code per day whatever the click count, and
    // that one read is the one the request log is expected to show.
    //
    // `campaignKey` is SCOPED with the same `select(...)` every other Task
    // projection uses (`sanity.ts`): a Studio edit can point a Task at
    // ANOTHER conference's Campaign, and an unrestricted dereference would
    // put that tenant's key into this conference's `utm_campaign`. Out of
    // scope reads as no key, which `outreachLink` already treats as "does
    // not derive" — the home page, not a cross-tenant attribution.
    clientReadUncached,
    { conferenceId },
    `*[_type in ["socialPostVariant", "marketingTask"] && shortCode == $code && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      _type,
      link,
      kind,
      targetPage,
      "taskKey": key,
      "campaignKey": select(campaign->conference._ref == conference._ref => campaign->key)
    }`,
    { code },
  )
  // A found document is tagged even when its target is unusable, so repairing
  // or deleting it expires this entry rather than waiting the entry out.
  if (row?._id) cacheTag(shortLinkTag(row._id))
  const target = shortLinkTargetFor(row)
  // Exactly one `cacheLife` runs per invocation (Next 16 requires that).
  cacheLife(target ? SHORT_LINK_HIT_LIFE : SHORT_LINK_MISS_LIFE)
  return target
}
