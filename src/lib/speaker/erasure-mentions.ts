/**
 * Erasure's post-variant branch (#1232, `docs/MARKETING_TAGGING_SPEC.md`).
 *
 * A `socialPostVariant` records who it tags in `mentions[]`: a weak speaker
 * reference, the handle, the DID it was checked against and the speaker's
 * NAME. After an erasure those copies are the erased person's real name and
 * accounts, and the editor shows them to organizers. So every variant, in any
 * version, loses every record of the subject — found by its reference, and by
 * a handle or DID one of their records carries (the same account recorded
 * under another reference is still their account), followed to a fixed
 * point. A record of ANOTHER speaker who is still here is never theirs, even
 * on a team account the two share.
 *
 * A body NOT YET POSTED is scrubbed too: their handle wherever it stands (a
 * tag's occurrence of a SHARED account only where it is bound to them) and
 * each whole-word copy of their name, NFC-matched and outside a link, becomes
 * the neutral words #1229 posts for a gone speaker ({@link GONE_SPEAKER_TEXT}),
 * and so does a per-variant alt text naming them. That covers a name typed by
 * hand, which no record links to them (the owner's comment on #1232). The name
 * is looked for only in scope (below) or where a record of theirs is.
 *
 * STATUS DECIDES THE BODY — of the LIVE document. A Studio draft or a Content
 * Release copy was never sent anywhere, whatever status it copied, so it is
 * always scrubbed and never waited on.
 *  - posted (`published`): the body is what went out and is on the
 *    platform already — out of scope. Only its records are scrubbed.
 *  - in flight (`publishing`, `submitted`): the cron or the confirm sweep
 *    will settle it with a compare-and-set, and a write here would lose that
 *    race for one of the two. The erasure is REFUSED while such a variant
 *    still holds the subject; the operator re-runs once it has settled.
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
 * Pure planner, a residual check over stored values, and one read function — split
 * from `./erasure.ts` like `./erasure-assets.ts`.
 */
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { GONE_SPEAKER_TEXT } from '@/lib/marketing/tagging/body'
import { mentionTokens, occurrenceOwners } from '@/lib/marketing/tagging/checks'
import { blueskyHandlesFromLinks } from '@/lib/marketing/tagging/handle'
import { getPublishedId } from '@sanity/client/csm'
import { normaliseHandle } from '@/lib/social/provider/bluesky-syntax'
import type { ErasureDocumentPatch } from './erasure'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** Statuses whose body has gone out: only their records are scrubbed. */
// Not `submitted`: that one is still in flight (below), so its text is read
// and a variant naming them refuses the erasure.
const POSTED_VARIANT_STATUSES = ['published'] as const
/**
 * The publisher's claims — the cron's (`publishing`) and an asynchronous
 * publisher's awaiting confirmation (`submitted`). Each is settled by a
 * revision-guarded write, so the erasure refuses rather than race it.
 */
const IN_FLIGHT_STATUSES = ['publishing', 'submitted'] as const

/** How many rounds of account discovery before the read refuses. */
const MAX_ACCOUNT_ROUNDS = 20

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
  /**
   * The conferences whose variants are searched for the plain name. Outside
   * them, only a variant holding a record of the subject is — a variant
   * found through a team account another speaker shares is theirs.
   */
  nameScope: string[]
  /**
   * Handles someone ELSE holds too — on a live speaker's or a sponsor's
   * record in any variant read, or in a live speaker's profile links. Such a
   * handle is hers only where a tag is bound to her record: never in text
   * that records nobody (a team account in another tenant's post).
   */
  sharedHandles: string[]
  /**
   * Of those, the ones shared ONLY because another live speaker's profile
   * LISTS them — no record anywhere says whose they are. Maybe a real team
   * account, maybe a co-speaker linking to her, maybe her own duplicate
   * speaker document: the scrub cannot tell, so it leaves the text and the
   * verification REPORTS it (never clean) for the operator to decide.
   */
  linkOnlyShared: { handle: string; listedBy: string[] }[]
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
  status?: unknown
  speaker?: { _ref?: unknown }
  /**
   * Read with the variant: the record is ANOTHER speaker's, and they are
   * still here. A team account two speakers share is theirs too, so such a
   * record is never the subject's, whatever handle or DID it carries.
   */
  otherLive?: unknown
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

/**
 * A record of the subject: by reference, or by a handle or DID of theirs on
 * a record that points at a speaker who is gone (a dangling or erased
 * reference). Never another live speaker's, and never a record with NO
 * speaker reference: that is a sponsor's (#1154 writes them, marked
 * `sponsor: true`; none exist on main yet), and a company account shared
 * with the subject is still the company's.
 */
const isOthers = (m: MentionEntry) =>
  m.otherLive === true || typeof m.speaker?._ref !== 'string'

function isSubjectRecord(
  m: MentionEntry,
  speakerId: string,
  identity: MentionIdentity,
): boolean {
  if (m.speaker?._ref === speakerId) return true
  if (isOthers(m)) return false
  const handle = str(m.handle)
  const did = str(m.did)
  return (
    (handle !== null && identity.handles.includes(normaliseHandle(handle))) ||
    (did !== null && identity.dids.includes(did))
  )
}

/** The handles someone else's record in these variants carries. */
function othersHandles(variants: readonly Doc[]): string[] {
  return variants.flatMap((v) =>
    list<MentionEntry>(v.mentions)
      .filter(isOthers)
      .map((m) => str(m.handle))
      .filter((h): h is string => h !== null)
      .map(normaliseHandle),
  )
}

/** This variant's shared handles, and every one known to be shared. */
function sharedHandles(v: Doc, global: ReadonlySet<string>): Set<string> {
  return new Set([...global, ...othersHandles([v])])
}

/**
 * The identity grown by every record of the subject among `variants` — by
 * reference, or by an account already known to be theirs.
 */
function mentionIdentity(
  speakerId: string,
  variants: readonly Doc[],
  base: MentionIdentity,
): MentionIdentity {
  const names = new Set(base.names)
  const handles = new Set(base.handles)
  const dids = new Set(base.dids)
  for (const v of variants)
    for (const m of list<MentionEntry>(v.mentions)) {
      if (!isSubjectRecord(m, speakerId, base)) continue
      const [stored, handle, did] = [str(m.name), str(m.handle), str(m.did)]
      if (stored) names.add(stored)
      if (handle && isHandle(normaliseHandle(handle)))
        handles.add(normaliseHandle(handle))
      if (did) dids.add(did)
    }
  return {
    // The neutral text is no name of theirs (the caller drops the erased
    // placeholder, which is the only name an erased document has).
    names: [...new Set([...names].map((n) => n.normalize('NFC')))].filter(
      (n) => n.trim() && n !== GONE_SPEAKER_TEXT,
    ),
    handles: [...handles],
    dids: [...dids],
  }
}

/**
 * The atproto handle syntax. A stored handle has no schema validation, and a
 * malformed one ("@", say, normalised to "") would build a matcher that hits
 * every boundary: it is never taken into the identity.
 */
const HANDLE =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/
const isHandle = (h: string) => h.length <= 253 && HANDLE.test(h)

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Any of the names as whole words, any case, across any run of whitespace —
 * longest first. Not inside a longer word, and not part of a handle or a
 * domain ("Ada" is not in "@ada-l.dev"); a URL is excluded whole by
 * {@link nameSpans}, so other punctuation ("Speaker:Ada") is a boundary.
 * Null when there is no name.
 */
function namePattern(names: readonly string[]): RegExp | null {
  if (names.length === 0) return null
  const alternatives = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.trim().split(/\s+/).map(escape).join('\\s+'))
  return new RegExp(
    `(?<![\\p{L}\\p{N}_@./-])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}\\p{M}_]|[.@/-][\\p{L}\\p{N}_])`,
    'giu',
  )
}

/**
 * Any of the handles as written ANYWHERE, with or without its `@` — after a
 * quote or a colon, or in a profile URL, where the publisher would not make
 * it a tag but it still names the account. Not inside a longer handle.
 */
function handlePattern(handles: readonly string[]): RegExp | null {
  if (handles.length === 0) return null
  const alternatives = [...handles]
    .sort((a, b) => b.length - a.length)
    .map(escape)
  return new RegExp(
    `(?<![\\p{L}\\p{N}_.-])@?(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_-]|\\.[\\p{L}\\p{N}_])`,
    'giu',
  )
}

/** Where a link stands: a URL is left whole, a name inside it untouched. */
const LINK = /(?:https?:\/\/|www\.)[^\s)\]}>"']+/gi

/**
 * Each link's span, ending at the URL: never a closing bracket or quote, so
 * a name right after a link ("(https://x.test)Ada") is not swallowed into it.
 */
const linkSpans = (text: string): Span[] => spansOf(text, LINK)

type Span = [number, number]
const spansOf = (text: string, pattern: RegExp): Span[] =>
  [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length])
const overlaps = ([a, b]: Span, spans: readonly Span[]) =>
  spans.some(([s, e]) => a < e && b > s)

/** Each match of the name outside a link and outside a placeholder. */
function nameSpans(text: string, names: readonly string[]): Span[] {
  const pattern = namePattern(names)
  if (!pattern) return []
  // An earlier run's placeholder is not their name, either — or a speaker
  // named "Speaker" would be scrubbed again on every run.
  const links = linkSpans(text)
  // A whole phrase only: "Data Speaker" holds no placeholder. A match INSIDE
  // one is exempt; a longer name containing one ("A Speaker Jr") is not.
  const placeholders = spansOf(
    text,
    new RegExp(
      `(?<![\\p{L}\\p{N}_])${GONE_SPEAKER_TEXT}(?![\\p{L}\\p{N}_])`,
      'giu',
    ),
  )
  const within = ([a, b]: Span) =>
    placeholders.some(([s, e]) => s <= a && b <= e)
  return spansOf(text, pattern).filter(
    (span) => !overlaps(span, links) && !within(span),
  )
}

/**
 * Each occurrence of one of their handles, as a tag or not, except a handle
 * another live speaker's record in this variant carries (a team account):
 * that one's TAGS are bound per occurrence by {@link subjectTags}.
 */
function handleSpans(
  text: string,
  handles: readonly string[],
  shared: ReadonlySet<string>,
): Span[] {
  const pattern = handlePattern(handles.filter((h) => !shared.has(h)))
  return pattern ? spansOf(text, pattern) : []
}

/**
 * The `@handle` tags of a team account that stand for the subject, as the
 * publisher binds occurrences to records (`occurrenceOwners`, the same
 * binding #1229's publish-time swap uses).
 */
function subjectTags(
  text: string,
  v: Doc,
  speakerId: string,
  identity: MentionIdentity,
  global: ReadonlySet<string>,
): Span[] {
  const shared = sharedHandles(v, global)
  const records = list<MentionEntry>(v.mentions)
    .filter((m) => m.status === 'tagged' && str(m.handle) !== null)
    .map((m, i) => ({
      handle: str(m.handle) as string,
      speakerId: String(i),
      status: 'tagged' as const,
      // NFC like the text it is bound against.
      name: (str(m.name) ?? '').normalize('NFC'),
      subject: isSubjectRecord(m, speakerId, identity),
    }))
  const owners = occurrenceOwners(text, records)
  const seen = new Map<string, number>()
  return mentionTokens(text).flatMap((t): Span[] => {
    if (!shared.has(t.handle)) return []
    const mine = records.filter((r) => normaliseHandle(r.handle) === t.handle)
    const k = seen.get(t.handle) ?? 0
    seen.set(t.handle, k + 1)
    // More occurrences than owners: the extras are the last record's.
    const id = owners.get(t.handle)?.[k]
    const r = id !== undefined ? records[Number(id)] : mine[mine.length - 1]
    return r?.subject ? [[t.start, t.end]] : []
  })
}

/**
 * Every span of the text that names the subject: their tags and handles, and
 * — when `byName` — their name. Matched on the NFC form, so a decomposed
 * "Å" is their name too.
 */
function subjectSpans(
  text: string,
  v: Doc,
  speakerId: string,
  identity: MentionIdentity,
  byName: boolean,
  global: ReadonlySet<string>,
): Span[] {
  const handles = [
    ...handleSpans(text, identity.handles, sharedHandles(v, global)),
    ...subjectTags(text, v, speakerId, identity, global),
  ]
  const names = byName
    ? nameSpans(text, identity.names).filter((span) => !overlaps(span, handles))
    : []
  return [...handles, ...names].sort((a, b) => a[0] - b[0])
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * The text's NFC form, and where each of its offsets falls in the ORIGINAL:
 * built grapheme by grapheme (a cluster normalises on its own), so a span
 * found in the NFC form can be replaced in the original and nothing else in
 * it — a link with a decomposed "é", say — changes by a byte.
 */
function nfcWithMap(text: string): { nfc: string; toOriginal: number[] } {
  let nfc = ''
  const toOriginal: number[] = []
  for (const { segment, index } of graphemes.segment(text)) {
    const n = segment.normalize('NFC')
    for (let i = 0; i < n.length; i++) toOriginal.push(index)
    nfc += n
  }
  toOriginal.push(text.length)
  return { nfc, toOriginal }
}

/**
 * The text with every span naming the subject replaced by the neutral words,
 * or the text as it was when nothing names them.
 */
function scrubText(
  text: string,
  v: Doc,
  speakerId: string,
  identity: MentionIdentity,
  byName: boolean,
  global: ReadonlySet<string>,
): string {
  const { nfc, toOriginal } = nfcWithMap(text)
  const spans = subjectSpans(nfc, v, speakerId, identity, byName, global)
  if (spans.length === 0) return text
  let out = text
  let end = Infinity
  for (const [a, b] of spans.reverse()) {
    if (b > end) continue // overlapping: the earlier span already covers it
    const [from, to] = [toOriginal[a], toOriginal[b]]
    out = `${out.slice(0, from)}${GONE_SPEAKER_TEXT}${out.slice(to)}`
    end = a
  }
  return out
}

/**
 * Per variant attachment, the alt text it publishes: its own override, else
 * the post attachment's own alt (`resolvePublishMedia`).
 */
function effectiveAlts(v: Doc) {
  const sourceAlts = new Map(
    list<{ _key?: unknown; alt?: unknown }>(v.sourceAlts).map((a) => [
      a._key,
      str(a.alt),
    ]),
  )
  return list<AttachmentEntry & { source?: unknown }>(v.attachments).map(
    (a) => {
      const own = str(a.altOverride)
      return {
        key: str(a._key),
        alt: own ?? sourceAlts.get(a.source) ?? null,
      }
    },
  )
}

/** A variant searched for the plain name: in scope, or holding their record. */
function byName(v: Doc, speakerId: string, inputs: SpeakerMentionInputs) {
  const conference = (v.conference as { _ref?: unknown } | undefined)?._ref
  return (
    (typeof conference === 'string' && inputs.nameScope.includes(conference)) ||
    list<MentionEntry>(v.mentions).some((m) =>
      isSubjectRecord(m, speakerId, inputs.identity),
    )
  )
}

/** A Studio draft or a Content Release copy was never sent anywhere. */
const isLive = (v: Doc) =>
  !v._id.startsWith('drafts.') && !v._id.startsWith('versions.')
const isPosted = (v: Doc) =>
  isLive(v) &&
  (POSTED_VARIANT_STATUSES as readonly unknown[]).includes(v.status)
const isInFlight = (v: Doc) =>
  isLive(v) && (IN_FLIGHT_STATUSES as readonly unknown[]).includes(v.status)

/**
 * One patch per variant still holding the subject; a variant mid-publish, or
 * one whose entry cannot be safely selected, is REFUSED (fail closed).
 */
export function planSpeakerMentionErasure(
  speakerId: string,
  inputs: SpeakerMentionInputs,
): SpeakerMentionPlan {
  const { identity } = inputs
  const shared = new Set(inputs.sharedHandles)
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

    if (!isPosted(v)) {
      const named = byName(v, speakerId, inputs)
      const body = str(v.body)
      if (body !== null) {
        const scrubbed = scrubText(body, v, speakerId, identity, named, shared)
        if (scrubbed !== body) set.body = scrubbed
      }
      // The override is set even where only the POST's alt names them: that
      // is what this variant would publish, and the post is not scanned.
      for (const { key, alt } of effectiveAlts(v)) {
        if (alt === null) continue
        const scrubbed = scrubText(alt, v, speakerId, identity, named, shared)
        if (scrubbed === alt) continue
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
    if (isInFlight(v)) {
      refusals.push(
        `Post variant ${v._id} names the subject and is being published right ` +
          `now (${String(v.status)}); re-run the erasure once the publisher ` +
          'has settled it',
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
  inputs: SpeakerMentionInputs,
): string[] {
  const { identity } = inputs
  const shared = new Set(inputs.sharedHandles)
  const ids = new Set<string>()
  for (const v of inputs.variants) {
    const named = byName(v, speakerId, inputs)
    const holds = (text: unknown) => {
      const t = str(text)
      return (
        t !== null &&
        subjectSpans(t.normalize('NFC'), v, speakerId, identity, named, shared)
          .length > 0
      )
    }
    const recorded = list<MentionEntry>(v.mentions).some((m) => {
      if (m.speaker?._ref === speakerId) return true
      const [handle, did] = [str(m.handle), str(m.did)]
      return (
        !isOthers(m) &&
        ((handle !== null &&
          identity.handles.includes(normaliseHandle(handle))) ||
          (did !== null && identity.dids.includes(did)))
      )
    })
    const inText =
      !isPosted(v) &&
      (holds(v.body) || effectiveAlts(v).some((a) => holds(a.alt)))
    if (recorded || inText) ids.add(v._id)
  }
  return [...ids]
}

/**
 * Per handle shared only through another speaker's links, the unposted
 * variants whose text STILL carries it once the scrub is done (a tag bound
 * to her record is scrubbed; anything else is left) — wherever it stands.
 * The same answer before the commit (the dry run) and after it.
 */
export function linkOnlySharedResidual(
  speakerId: string,
  inputs: SpeakerMentionInputs,
): { handle: string; variantIds: string[]; listedBy: string[] }[] {
  const shared = new Set(inputs.sharedHandles)
  return inputs.linkOnlyShared.flatMap(({ handle, listedBy }) => {
    const pattern = handlePattern([handle])
    if (!pattern) return []
    const leftIn = (v: Doc) => (text: unknown) => {
      const t = str(text)
      if (t === null) return false
      const after = scrubText(
        t,
        v,
        speakerId,
        inputs.identity,
        byName(v, speakerId, inputs),
        shared,
      )
      return spansOf(after.normalize('NFC'), pattern).length > 0
    }
    const variantIds = [
      ...new Set(
        inputs.variants
          .filter(
            (v) =>
              !isPosted(v) &&
              (leftIn(v)(v.body) ||
                effectiveAlts(v).some((a) => leftIn(v)(a.alt))),
          )
          .map((v) => v._id),
      ),
    ].sort()
    return variantIds.length > 0 ? [{ handle, variantIds, listedBy }] : []
  })
}

// `otherLive`: see `MentionEntry`. Every read below passes `$speakerId`.
const VARIANT_FIELDS = groq`{ _id, _type, _rev, status, body, attachments, conference, "sourceAlts": post->attachments[]{ _key, alt }, "mentions": mentions[]{ ..., "otherLive": defined(speaker._ref) && speaker._ref != $speakerId && defined(speaker->_id) && !defined(speaker->erasedAt) } }`

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
  /** The speaker's profile links: their Bluesky handles, record or none. */
  links: unknown,
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
  // To a fixed point over this batch too: a record here may carry an alias
  // only another record here — found by that alias — ties to them, and the
  // account read below never returns these variants again.
  let identity: MentionIdentity = {
    names: [...(currentName ? [currentName] : []), ...(prior.names ?? [])],
    handles: [
      ...blueskyHandlesFromLinks(
        Array.isArray(links) ? links.filter((l) => typeof l === 'string') : [],
      ),
      ...(prior.handles ?? []),
    ].filter(isHandle),
    dids: prior.dids ?? [],
  }
  for (;;) {
    const grown = mentionIdentity(speakerId, byRef, identity)
    const growing =
      grown.handles.length > identity.handles.length ||
      grown.dids.length > identity.dids.length
    identity = grown
    if (!growing) break
  }

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
    ...new Set(
      // A conference that exists only as a draft or a release copy is
      // referenced by its published id.
      [...(orgConferences ?? []), ...(talkConferences ?? [])]
        .filter((id) => typeof id === 'string')
        .map(getPublishedId),
    ),
  ]

  const readByAccountOrScope = async (known: MentionIdentity) => {
    // One `match` per handle, OR-ed (an array on the right of `match` means
    // ALL of it): a COARSE full-text prefilter for a handle typed with no
    // record — the planner decides on the exact text. Parameters only.
    const typed = known.handles.map((_, i) => `$h${i}`)
    const typedFilter =
      typed.length === 0
        ? 'false'
        : typed
            .map(
              (h) =>
                `body match ${h} || attachments[].altOverride match ${h} || post->attachments[].alt match ${h}`,
            )
            .join(' || ')
    return (
      (await client.fetch<Doc[]>(
        // groq-global: the same account recorded under another reference —
        // or typed with no record — is found in every tenant, like the
        // reference read above; the plain-name candidates are only the
        // unposted variants of the conferences above.
        groq`*[_type == "socialPostVariant" && !references($speakerId) && (
          count(mentions[lower(handle) in $handles || did in $dids]) > 0 ||
          ((!(status in $posted) ||
            _id in path("drafts.**") || _id in path("versions.**")) && (
            conference._ref in $conferenceIds || ${typedFilter}
          ))
        )]${VARIANT_FIELDS}`,
        {
          speakerId,
          // Stored handles are normalised; one kept with its `@` still counts.
          handles: known.handles.flatMap((h) => [h, `@${h}`]),
          dids: known.dids,
          conferenceIds,
          posted: [...POSTED_VARIANT_STATUSES],
          ...Object.fromEntries(known.handles.map((h, i) => [`h${i}`, h])),
        },
        opts,
      )) ?? []
    )
  }

  // A record found by their account may carry another handle or DID of
  // theirs, which finds more: read to a FIXED POINT. Each round must grow
  // the identity; one that is still growing at the limit is refused rather
  // than returned partial (fail closed — a person has few accounts).
  // Every round's batch is KEPT, first read first: a variant that stops
  // matching between rounds (retagged meanwhile) is still patched under
  // the revision it was read at, so a concurrent edit aborts the commit.
  const found = new Map<string, Doc>()
  const keep = (batch: Doc[]) => {
    for (const d of batch) if (!found.has(d._id)) found.set(d._id, d)
    return [...found.values()]
  }
  let byAccountOrScope = keep(await readByAccountOrScope(identity))
  for (let round = 0; ; round++) {
    const grown = mentionIdentity(speakerId, byAccountOrScope, identity)
    const growing =
      grown.handles.length > identity.handles.length ||
      grown.dids.length > identity.dids.length
    identity = grown
    if (!growing) break
    if (round === MAX_ACCOUNT_ROUNDS) {
      throw new Error(
        `Speaker ${speakerId}'s Bluesky accounts are still being discovered ` +
          `after ${MAX_ACCOUNT_ROUNDS} rounds; nothing was written — check ` +
          'the mentions recorded for them by hand',
      )
    }
    byAccountOrScope = keep(await readByAccountOrScope(identity))
  }

  // A live speaker who LISTS one of her handles shares it, record or none.
  // A COARSE `match` per handle, OR-ed: the links are then parsed exactly
  // (`blueskyHandlesFromLinks`), so any form it accepts — `@handle`, a
  // trailing space, an encoded segment — counts. Parameters only.
  const listedFilter = identity.handles
    .map((_, i) => `links[] match $l${i}`)
    .join(' || ')
  const othersLinks =
    identity.handles.length === 0
      ? []
      : ((await client.fetch<{ _id: string; links?: unknown }[]>(
          // groq-global: other live speakers listing one of her handles, in
          // every tenant — the same account is theirs as well.
          groq`*[_type == "speaker" && _id != $speakerId && !defined(erasedAt) && (${listedFilter})]{ _id, links }`,
          {
            speakerId,
            ...Object.fromEntries(identity.handles.map((h, i) => [`l${i}`, h])),
          },
          opts,
        )) ?? [])
  // Per handle of hers, the other speakers LISTING it.
  const listedBy = new Map<string, string[]>()
  for (const other of othersLinks) {
    const links = Array.isArray(other.links)
      ? other.links.filter((l): l is string => typeof l === 'string')
      : []
    for (const h of blueskyHandlesFromLinks(links))
      if (identity.handles.includes(h))
        listedBy.set(h, [...(listedBy.get(h) ?? []), other._id])
  }
  const variants = [...byRef, ...byAccountOrScope]
  const byRecord = new Set(
    othersHandles(variants).filter((h) => identity.handles.includes(h)),
  )
  return {
    variants,
    identity,
    nameScope: conferenceIds,
    sharedHandles: [...new Set([...byRecord, ...listedBy.keys()])],
    linkOnlyShared: [...listedBy]
      .filter(([h]) => !byRecord.has(h))
      .map(([handle, ids]) => ({ handle, listedBy: ids.sort() })),
  }
}
