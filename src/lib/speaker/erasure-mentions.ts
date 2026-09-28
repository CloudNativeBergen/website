/**
 * Erasure's post-variant branch (#1232, `docs/MARKETING_TAGGING_SPEC.md`).
 *
 * A `socialPostVariant` records who it tags in `mentions[]`: a weak speaker
 * reference, the handle, the DID it was checked against and the speaker's
 * NAME. After an erasure those copies are the erased person's real name and
 * accounts, and the editor shows them to organizers. So every variant, in any
 * version, loses every record of the subject — found by its reference, and by
 * a handle or DID one of their records carries (the same account recorded
 * under another reference is still their account).
 *
 * A body NOT YET POSTED is scrubbed too: each `@handle` of theirs and each
 * whole-word copy of their name becomes the neutral words #1229 posts for a
 * gone speaker ({@link GONE_SPEAKER_TEXT}), and so does a per-variant alt
 * text naming them. That covers a name typed by hand, which no record links
 * to them (the owner's comment on #1232).
 *
 * STATUS DECIDES THE BODY:
 *  - posted (`published`, `submitted`): the body is what went out and is on
 *    the platform already — out of scope. Only its records are scrubbed.
 *  - `publishing`: the cron holds a claim and will write the variant with a
 *    compare-and-set. Any write here would lose that race for one of the two,
 *    so the erasure is REFUSED while such a variant still holds the subject;
 *    the operator re-runs once the tick has settled it.
 *  - everything else (`draft`, `scheduled`, `awaiting-manual`, `failed`, and
 *    an unknown status — fail toward scrubbing): scrubbed.
 *
 * SCOPE. Records and tags are found GLOBALLY, like every reference-borne read
 * in `./erasure.ts`: the right is the person's, not a tenant's. A plain name
 * has nothing to follow, and matching a name across every tenant would scrub
 * strangers who share it, so the name is looked for in the open variants of
 * every conference of the speaker's organizations (`speaker.organizations`,
 * which erasure keeps) and of every conference they have a talk at. A
 * namesake inside that scope is scrubbed too — see the runbook.
 *
 * Pure planner, an independent residual check, and one read function — split
 * from `./erasure.ts` like `./erasure-assets.ts`.
 */
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { GONE_SPEAKER_TEXT } from '@/lib/marketing/tagging/body'
import { mentionTokens } from '@/lib/marketing/tagging/checks'
import { normaliseHandle } from '@/lib/social/provider/bluesky-syntax'
import type { ErasureDocumentPatch } from './erasure'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** Statuses whose body has gone out: only their records are scrubbed. */
const POSTED_VARIANT_STATUSES = ['published', 'submitted'] as const
/** The cron's claim: the erasure refuses rather than race it. */
const IN_FLIGHT_STATUS = 'publishing'

/** Sanity `_key`s are safe to interpolate only if they look like this. */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/

/**
 * Who to scrub: the subject's name, and every name, handle and DID a record
 * of theirs carries. Threaded into the verification as it was BEFORE the
 * erasure, which destroys the name and every record that holds the rest.
 */
export interface MentionIdentity {
  /** Their name and the spellings their records stored; empty once erased. */
  names: string[]
  handles: string[]
  dids: string[]
}

/** What {@link planSpeakerMentionErasure} needs. */
export interface SpeakerMentionInputs {
  variants: Doc[]
  identity: MentionIdentity
}

export interface SpeakerMentionPlan {
  patches: ErasureDocumentPatch[]
  refusals: string[]
}

interface MentionEntry {
  _key?: unknown
  name?: unknown
  handle?: unknown
  did?: unknown
  speaker?: { _ref?: unknown }
}

interface AttachmentEntry {
  _key?: unknown
  altOverride?: unknown
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value.filter((e) => typeof e === 'object' && e !== null) as T[])
    : []
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** A record of the subject: by reference, or by a handle or DID of theirs. */
function isSubjectRecord(
  m: MentionEntry,
  speakerId: string,
  identity: MentionIdentity,
): boolean {
  const handle = str(m.handle)
  const did = str(m.did)
  return (
    m.speaker?._ref === speakerId ||
    (handle !== null && identity.handles.includes(normaliseHandle(handle))) ||
    (did !== null && identity.dids.includes(did))
  )
}

/** Every name, handle and DID the subject's records carry, plus `name`. */
function mentionIdentity(
  speakerId: string,
  variants: readonly Doc[],
  name: string | null,
  prior: Partial<MentionIdentity> = {},
): MentionIdentity {
  const names = new Set([...(name ? [name] : []), ...(prior.names ?? [])])
  const handles = new Set(prior.handles ?? [])
  const dids = new Set(prior.dids ?? [])
  for (const v of variants)
    for (const m of list<MentionEntry>(v.mentions)) {
      if (m.speaker?._ref !== speakerId) continue
      const [stored, handle, did] = [str(m.name), str(m.handle), str(m.did)]
      if (stored) names.add(stored)
      if (handle) handles.add(normaliseHandle(handle))
      if (did) dids.add(did)
    }
  return {
    // The neutral text is no name of theirs (the caller drops the erased
    // placeholder, which is the only name an erased document has).
    names: [...names].filter((n) => n.trim() && n !== GONE_SPEAKER_TEXT),
    handles: [...handles],
    dids: [...dids],
  }
}

/**
 * Any of the names as whole words, any case, across any run of whitespace —
 * longest first. Not inside a longer word, and not part of a handle, a
 * domain or a URL ("Ada" is not in "@ada-l.dev" or "x.dev/Ada"), so another
 * person's tag is never broken. Null when there is no name to look for.
 */
function namePattern(names: readonly string[]): RegExp | null {
  if (names.length === 0) return null
  const alternatives = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) =>
      n
        .trim()
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+'),
    )
  return new RegExp(
    `(?<![\\p{L}\\p{N}_@./-])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_]|[.@/-][\\p{L}\\p{N}_])`,
    'giu',
  )
}

/** The text with every tag and whole-word name of the subject neutralised. */
function scrubText(text: string, identity: MentionIdentity): string {
  let out = text
  for (const t of mentionTokens(out).reverse())
    if (identity.handles.includes(t.handle))
      out = `${out.slice(0, t.start)}${GONE_SPEAKER_TEXT}${out.slice(t.end)}`
  const pattern = namePattern(identity.names)
  return pattern ? out.replace(pattern, GONE_SPEAKER_TEXT) : out
}

const isPosted = (status: unknown) =>
  (POSTED_VARIANT_STATUSES as readonly unknown[]).includes(status)

/**
 * One patch per variant still holding the subject; a variant mid-publish, or
 * one whose entry cannot be safely selected, is REFUSED (fail closed).
 */
export function planSpeakerMentionErasure(
  speakerId: string,
  inputs: SpeakerMentionInputs,
): SpeakerMentionPlan {
  const { identity } = inputs
  const patches: ErasureDocumentPatch[] = []
  const refusals: string[] = []
  const seen = new Set<string>()

  for (const v of inputs.variants) {
    if (seen.has(v._id)) continue
    seen.add(v._id)
    const set: Record<string, unknown> = {}
    const unset: string[] = []
    const unaddressable: string[] = []

    for (const m of list<MentionEntry>(v.mentions)) {
      if (!isSubjectRecord(m, speakerId, identity)) continue
      const key = str(m._key)
      if (key && SAFE_KEY.test(key)) unset.push(`mentions[_key=="${key}"]`)
      else unaddressable.push('mentions')
    }

    if (!isPosted(v.status)) {
      const body = str(v.body)
      if (body !== null) {
        const scrubbed = scrubText(body, identity)
        if (scrubbed !== body) set.body = scrubbed
      }
      for (const a of list<AttachmentEntry>(v.attachments)) {
        const alt = str(a.altOverride)
        if (alt === null) continue
        const scrubbed = scrubText(alt, identity)
        if (scrubbed === alt) continue
        const key = str(a._key)
        if (key && SAFE_KEY.test(key))
          set[`attachments[_key=="${key}"].altOverride`] = scrubbed
        else unaddressable.push('attachments')
      }
    }

    if (
      unset.length === 0 &&
      Object.keys(set).length === 0 &&
      unaddressable.length === 0
    )
      continue
    if (v.status === IN_FLIGHT_STATUS) {
      refusals.push(
        `Post variant ${v._id} names the subject and is being published right ` +
          'now; re-run the erasure once the publish tick has settled it',
      )
      continue
    }
    if (unaddressable.length > 0) {
      refusals.push(
        `Post variant ${v._id} has ${[...new Set(unaddressable)].join(' and ')} ` +
          'entries naming the subject that cannot be safely selected; clear them by hand',
      )
      continue
    }
    patches.push({
      id: v._id,
      type: 'socialPostVariant',
      rev: str(v._rev) ?? undefined,
      ...(Object.keys(set).length > 0 ? { set } : {}),
      ...(unset.length > 0 ? { unset } : {}),
      reason: [
        unset.length > 0 ? 'recorded mentions of the subject' : null,
        set.body !== undefined ? 'unposted body naming the subject' : null,
        Object.keys(set).some((k) => k.startsWith('attachments'))
          ? 'alt text naming the subject'
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    })
  }
  return { patches, refusals }
}

/**
 * The variants a STORED check finds still holding the subject: any record
 * carrying their reference, handle or DID, or an unposted body or alt text
 * carrying their tag or name. Judged over the stored values, apart from the
 * planner's patches, so a planner that stops scrubbing something is caught
 * rather than agreed with. It shares the planner's reads and its name and
 * handle MATCHERS, though — a spelling those miss, both miss.
 */
export function residualMentionVariants(
  speakerId: string,
  variants: readonly Doc[],
  identity: MentionIdentity,
): string[] {
  const holds = (text: unknown) => {
    const t = str(text)
    if (t === null) return false
    if (mentionTokens(t).some((m) => identity.handles.includes(m.handle)))
      return true
    return namePattern(identity.names)?.test(t) ?? false
  }
  const ids = new Set<string>()
  for (const v of variants) {
    const records = list<MentionEntry>(v.mentions)
    const recorded = records.some((m) => {
      const [handle, did] = [str(m.handle), str(m.did)]
      return (
        m.speaker?._ref === speakerId ||
        (handle !== null &&
          identity.handles.includes(normaliseHandle(handle))) ||
        (did !== null && identity.dids.includes(did))
      )
    })
    const inText =
      !isPosted(v.status) &&
      (holds(v.body) ||
        list<AttachmentEntry>(v.attachments).some((a) => holds(a.altOverride)))
    if (recorded || inText) ids.add(v._id)
  }
  return [...ids]
}

const VARIANT_FIELDS = groq`{ _id, _type, _rev, status, body, mentions, attachments, conference }`

/**
 * The reads: variants recording the subject by reference, then (knowing
 * their handles and DIDs) variants recording those, and the unposted
 * variants of every conference in scope for the plain name.
 *
 * `raw` at {@link COUNT_API_VERSION}, like `./erasure-assets.ts`: a Studio
 * draft or a Content Release copy of a variant holds the same copies.
 *
 * @param prior The identity as read BEFORE an erasure — only the
 *   verification supplies it, because the erasure it checks destroyed the
 *   name and every record carrying the handles and DIDs.
 */
export async function fetchSpeakerMentionInputs(
  speakerId: string,
  organizations: unknown,
  currentName: string | null,
  prior: Partial<MentionIdentity> = {},
): Promise<SpeakerMentionInputs> {
  const client = clientReadUncached.withConfig({
    apiVersion: COUNT_API_VERSION,
  })
  const opts = { cache: 'no-store', perspective: 'raw' } as const

  const byRef =
    (await client.fetch<Doc[]>(
      // groq-global: erasure is a GLOBAL operation on a cross-org person (see
      // `./erasure.ts`); a variant recording them is found in every tenant.
      groq`*[_type == "socialPostVariant" && references($speakerId)]${VARIANT_FIELDS}`,
      { speakerId },
      opts,
    )) ?? []
  const identity = mentionIdentity(speakerId, byRef, currentName, prior)

  const orgIds = list<{ _ref?: unknown }>(organizations)
    .map((r) => str(r._ref))
    .filter((id): id is string => id !== null)
  const [orgConferences, talkConferences] = await Promise.all([
    client.fetch<string[]>(
      // groq-global: the conferences whose unposted variants may name the
      // subject in plain text — every edition of their organizations.
      groq`*[_type == "conference" && organization._ref in $orgIds]._id`,
      { orgIds },
      opts,
    ),
    client.fetch<string[]>(
      // groq-global: and every conference they have a talk at, whatever
      // tenant owns it.
      groq`*[_type == "talk" && $speakerId in speakers[]._ref].conference._ref`,
      { speakerId },
      opts,
    ),
  ])
  const conferenceIds = [
    ...new Set([...(orgConferences ?? []), ...(talkConferences ?? [])]),
  ].filter((id) => typeof id === 'string')

  const byAccountOrScope =
    (await client.fetch<Doc[]>(
      // groq-global: the same account recorded under another reference is
      // found in every tenant, like the reference read above; the plain-name
      // candidates are only the unposted variants of the conferences above.
      groq`*[_type == "socialPostVariant" && !references($speakerId) && (
          count(mentions[lower(handle) in $handles || did in $dids]) > 0 ||
          (conference._ref in $conferenceIds && !(status in $posted))
        )]${VARIANT_FIELDS}`,
      {
        speakerId,
        // Stored handles are normalised; one kept with its `@` still counts.
        handles: identity.handles.flatMap((h) => [h, `@${h}`]),
        dids: identity.dids,
        conferenceIds,
        posted: [...POSTED_VARIANT_STATUSES],
      },
      opts,
    )) ?? []

  return { variants: [...byRef, ...byAccountOrScope], identity }
}
