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
import { shortLinkTag } from '@/lib/cache/tags'
import { clientReadCached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
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
  // PATH AND QUERY, never the host.
  return `${url.pathname}${url.search}`
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
    clientReadCached,
    { conferenceId },
    `*[_type in ["socialPostVariant", "marketingTask"] && shortCode == $code && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      _type,
      link,
      kind,
      targetPage,
      "taskKey": key,
      "campaignKey": campaign->key
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
