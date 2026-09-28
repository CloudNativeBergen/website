/**
 * The save and approval checks on a Bluesky body's tags (tagging spec §4.3,
 * §4.4 Save and Approval), and the text edits the tag button and the
 * one-click fix make. PURE: no network, no Sanity. The server gathers the
 * conference's people and the handle resolutions and hands them in, so the
 * publish check (#1152) and sponsor tags (#1154) reuse the same functions,
 * and the editor runs the text edits in the browser.
 */

import { normaliseHandle } from '@/lib/social/provider/bluesky-syntax'
import { storedKey } from '../recipes'
import {
  BLUESKY_MAX_BYTES,
  BLUESKY_MAX_GRAPHEMES,
  countGraphemes,
  GONE_SPEAKER_TEXT,
  type MentionRecord,
} from './body'
import type { HandleResolution } from './resolve'

/**
 * `@atproto/api`'s `MENTION_REGEX` (what the adapter's facet detection runs),
 * WITHOUT its TLD filter: a superset, so every handle the adapter could turn
 * into a mention facet is one these checks have seen.
 */
const MENTION = /(^|\s|\()@([a-zA-Z0-9.-]+)(\b)/g

export interface MentionToken {
  /** Normalised: lower-case, no `@`. */
  handle: string
  /** Index of the `@`. */
  start: number
  /** Index just past the handle. */
  end: number
}

export function mentionTokens(body: string): MentionToken[] {
  return [...body.matchAll(MENTION)].map((m) => {
    const start = m.index + m[1].length
    return {
      handle: normaliseHandle(m[2]),
      start,
      end: start + 1 + m[2].length,
    }
  })
}

/**
 * Someone a body may tag: a speaker of this conference, or — with `sponsor`
 * — a company sponsoring it (spec §3.3), whose id `speakerId` then holds.
 * `handle` is null without a Bluesky link — and for an opted-out speaker in
 * anything sent to the browser, so their links never leave the server; the
 * server-side checks get the real handle. A sponsor never opts out.
 */
export interface TaggablePerson {
  speakerId: string
  sponsor?: true
  name: string
  handle: string | null
  /**
   * Every Bluesky handle their links name (`handle` is the first). What a
   * body's `@handle` is matched against, so an opt-out covers them all.
   * Absent: just `handle`.
   */
  handles?: string[]
  optedOut: boolean
  /** Browser payload only: their link is the conference's own account. */
  ownAccount?: true
}

export type TagIssueCode =
  | 'opted-out'
  | 'not-a-speaker'
  /** A sponsor company's tag, and it no longer sponsors this conference. */
  | 'not-a-sponsor'
  | 'not-found'
  | 'did-changed'
  | 'unchecked'
  | 'own-account'
  | 'plain-too-long'

/**
 * Why a save or an approval is refused, structured so the editor can offer
 * the one-click fix ("use the plain name") on each `MentionIssue`.
 */
export type TagIssue = MentionIssue | PlainTooLongIssue

/** An issue about one tag: the one-click fix swaps `@handle` for `name`. */
export interface MentionIssue {
  code: Exclude<TagIssueCode, 'plain-too-long'>
  mentionKey: string
  handle: string
  name: string
  message: string
  /** The tag is of a speaker gone since (#1232): `name` is the neutral words. */
  gone?: true
}

/** About the whole body: no one tag to fix. */
export interface PlainTooLongIssue {
  code: 'plain-too-long'
  mentionKey: null
  handle: null
  name: null
  message: string
}

/** Bluesky could not be asked: the tag is kept, and the organizer told. */
export interface TagWarning {
  code: 'unverified'
  mentionKey: string
  handle: string
  message: string
}

export interface TagCheck {
  issues: TagIssue[]
  warnings: TagWarning[]
}

/**
 * The tag button, name → handle: the FIRST occurrence of the person's name
 * becomes `@handle`. Null when the name is not in the body (the organizer
 * rewrote it) — the button then has nothing to swap.
 */
export function tagName(
  body: string,
  person: { name: string; handle: string | null },
): string | null {
  if (!person.handle) return null
  const at = nameIndex(body, person.name, person.handle)
  if (at < 0) return null
  return swapAt(body, at, person.name, person.handle)
}

const swapAt = (body: string, at: number, name: string, handle: string) =>
  `${body.slice(0, at)}@${handle}${body.slice(at + name.length)}`

/**
 * Where the name stands as a whole word the adapter would detect a tag at,
 * or -1: not inside a longer word, a handle or a URL ("Ann" is not in
 * "Annika" or "x.dev/Ann"), and not after a quote or a dash, where
 * `@handle` would stay plain text.
 */
export function nameIndex(
  body: string,
  name: string,
  handle: string | null = null,
): number {
  if (!name) return -1
  for (let at = body.indexOf(name); at >= 0; at = body.indexOf(name, at + 1)) {
    const before = body[at - 1]
    const after = body[at + name.length]
    // Only where a tag would be detected: after a space, a "(" or at the start.
    const startsTag = before === undefined || /[\s(]/.test(before)
    const endsWord = after === undefined || !/[\p{L}\p{N}_]/u.test(after)
    if (!startsTag || !endsWord) continue
    // With the handle known: only where the swap reads back as exactly that
    // tag ("Alice-led" would become "@alice.dev-led", another handle).
    if (handle) {
      const wanted = normaliseHandle(handle)
      const swapped = swapAt(body, at, name, handle)
      const ok = mentionTokens(swapped).some(
        (t) => t.start === at && t.handle === wanted,
      )
      if (!ok) continue
    }
    return at
  }
  return -1
}

/**
 * The tag button, handle → name, and the one-click fix: every tag of the
 * handle (as the adapter would detect it, any case) becomes the plain name.
 */
export function untagHandle(
  body: string,
  handle: string,
  name: string,
): string {
  const wanted = normaliseHandle(handle)
  let out = body
  for (const t of mentionTokens(body).reverse()) {
    if (t.handle === wanted)
      out = `${out.slice(0, t.start)}${name}${out.slice(t.end)}`
  }
  return out
}

/**
 * Which tag in the body is whose. `occurrence` null: every occurrence of the
 * handle is this person's. A number: only that occurrence (0-based) — the
 * handle is shared, and the others stand for someone else.
 */
export interface TagOwnership {
  handle: string
  occurrence: number | null
}

/**
 * Per speaker, the tag in the body that stands for them (the editor's tag
 * buttons, spec §2). A handle recorded for people keeps those people, in
 * record order; a handle one person lists is theirs; a handle SEVERAL list
 * (a team account) belongs, beyond the recorded ones, to those whose plain
 * name is gone from the body — the ones the button swapped.
 */
export function tagOwners(
  body: string,
  people: readonly TaggablePerson[],
  mentions: readonly Pick<
    MentionRecord,
    'handle' | 'speakerId' | 'status' | 'name' | 'gone'
  >[],
): Map<string, TagOwnership> {
  const ids = new Set(people.map((p) => p.speakerId))
  const out = new Map<string, TagOwnership>()
  for (const [handle, owners] of bindTags(body, people, mentions)) {
    const shared = owners.length > 1
    owners.forEach((id, k) => {
      if (ids.has(id) && !out.has(id))
        out.set(id, { handle, occurrence: shared ? k : null })
    })
  }
  return out
}

/**
 * THE binding of each `@handle` occurrence to a person, shared by the save
 * (what `mentions[]` records), the editor's tag buttons and the plain form,
 * so all three agree on whose tag each occurrence is. Per handle, the
 * owners in occurrence order, at most one per occurrence:
 * 1. the people it is recorded for, in record order (they may have left
 *    the roster: the save refuses those);
 * 2. with nothing recorded, a handle only one person lists is theirs;
 * 3. a handle SEVERAL list (a team account): the sharers whose plain name
 *    is gone from the body — the ones the button swapped — in roster order;
 * 4. any occurrence still unbound goes to the remaining sharers in roster
 *    order, so no known handle escapes the checks.
 * The chosen owners are then put in roster order, occurrence by occurrence.
 * A handle nobody lists and nobody recorded is a stranger's: not bound.
 */
function bindTags(
  body: string,
  people: readonly TaggablePerson[],
  mentions: readonly Pick<
    MentionRecord,
    'handle' | 'speakerId' | 'status' | 'name' | 'gone'
  >[],
): Map<string, string[]> {
  const known = byHandle(people)
  const counts = new Map<string, number>()
  for (const t of mentionTokens(body))
    counts.set(t.handle, (counts.get(t.handle) ?? 0) + 1)
  const out = new Map<string, string[]>()
  for (const [handle, n] of counts) {
    const owners: string[] = []
    const add = (id: string) => {
      if (owners.length < n && !owners.includes(id)) owners.push(id)
    }
    // Recorded people first — those whose plain name is gone from the body
    // before those still named, so an occurrence removed in Studio drops the
    // person whose name took its place.
    const recorded = mentions.filter(
      (m) => m.status === 'tagged' && normaliseHandle(m.handle) === handle,
    )
    // A gone speaker's record reads as the neutral words (#1232): whether
    // their name is in the body is unknowable, so it earns no priority.
    for (const m of recorded)
      if (!m.gone && nameIndex(body, m.name) < 0) add(m.speakerId)
    // Then a gone speaker, before anyone still named in the body.
    for (const m of recorded) if (m.gone) add(m.speakerId)
    for (const m of recorded) add(m.speakerId)
    const sharers = known.get(handle) ?? []
    if (owners.length === 0 && sharers.length === 1) add(sharers[0].speakerId)
    for (const p of sharers) if (nameIndex(body, p.name) < 0) add(p.speakerId)
    for (const p of sharers) add(p.speakerId)
    // Occurrence order is roster (talk) order — the order generation names
    // people in — so the k-th occurrence is the k-th of them, whichever
    // rule chose them. A recorded person no longer on the roster keeps the
    // place their record had among the others (records are saved in
    // occurrence order).
    const roster = (id: string) => people.findIndex((p) => p.speakerId === id)
    const ranks = new Map<string, number>()
    let last = -1
    for (const m of recorded) {
      const r = roster(m.speakerId)
      if (r >= 0) last = r
      if (!ranks.has(m.speakerId))
        ranks.set(m.speakerId, r >= 0 ? r : last + 0.5)
    }
    const rank = (id: string) => ranks.get(id) ?? roster(id)
    owners.sort((x, y) => rank(x) - rank(y))
    if (owners.length > 0) out.set(handle, owners)
  }
  return out
}

/**
 * The text with the `@` dropped from every handle the adapter or Bluesky's
 * composer would detect as a mention: a replacement name that itself holds a
 * handle ("Alice (@alice.dev)") must not put the tag back.
 */
export function withoutTags(text: string): string {
  let out = text
  for (const t of mentionTokens(text).reverse())
    out = `${out.slice(0, t.start)}${out.slice(t.start + 1)}`
  return out
}

/**
 * THE text that stands in for a withheld tag — at publish and in the manual
 * view alike, so the two can never drift: a speaker who is gone gets the
 * neutral word (never the stored name, GDPR); anyone else their name, with
 * any handle inside it kept as text, not a tag (review rounds 2–3).
 */
export function replacementText(p: { name: string; gone?: boolean }): string {
  return p.gone ? GONE_SPEAKER_TEXT : withoutTags(p.name)
}

/**
 * {@link bindTags} with the roster: per handle, the speaker ids owning its
 * occurrences, in occurrence order (extra occurrences: the last owner's).
 */
export function occurrenceOwnersWithRoster(
  body: string,
  people: readonly TaggablePerson[],
  mentions: readonly Pick<
    MentionRecord,
    'handle' | 'speakerId' | 'status' | 'name' | 'gone'
  >[],
): Map<string, string[]> {
  return bindTags(body, people, mentions)
}

/**
 * {@link bindTags} over the recorded mentions alone — what the publish tick
 * has, with no roster to hand (tagging spec §4.4, Publish). Per handle, the
 * record ids that own its occurrences, in occurrence order.
 */
export function occurrenceOwners(
  body: string,
  mentions: readonly Pick<
    MentionRecord,
    'handle' | 'speakerId' | 'status' | 'name' | 'gone'
  >[],
): Map<string, string[]> {
  return bindTags(body, [], mentions)
}

/** Hand a person's tag back to their name: all of it, or their occurrence. */
export function untagOwned(
  body: string,
  own: TagOwnership,
  name: string,
): string {
  if (own.occurrence === null) return untagHandle(body, own.handle, name)
  const t = mentionTokens(body).filter((x) => x.handle === own.handle)[
    own.occurrence
  ]
  return t ? `${body.slice(0, t.start)}${name}${body.slice(t.end)}` : body
}

/**
 * The one-click fix ("use the plain name") for one issue: the issue's
 * person's tag back to their name — only THEIR occurrence of a shared
 * handle (`bindTags` says which), every occurrence otherwise.
 */
export function fixTagIssue(
  body: string,
  issue: MentionIssue,
  people: readonly TaggablePerson[],
  mentions: readonly MentionRecord[],
): string {
  const speakerId =
    mentions.find((m) => m._key === issue.mentionKey)?.speakerId ??
    people.find((p) => storedKey(p.speakerId) === issue.mentionKey)?.speakerId
  const owners = bindTags(body, people, mentions).get(issue.handle) ?? []
  const k = speakerId ? owners.indexOf(speakerId) : -1
  return owners.length > 1 && k >= 0
    ? untagOwned(body, { handle: issue.handle, occurrence: k }, issue.name)
    : untagHandle(body, issue.handle, issue.name)
}

/**
 * The body with every recorded tag replaced by its name (§4.4, both forms).
 * Person-bound per occurrence: when one (shared) handle is recorded for
 * several people, its k-th occurrence stands for the k-th of them — "@team
 * and @team" is "Bob and Alice", not "Bob and Bob". Extra occurrences take
 * the last one's name.
 */
export function plainBody(
  body: string,
  mentions: readonly Pick<MentionRecord, 'handle' | 'name' | 'status'>[],
): string {
  return swapTags(body, mentions, (_, name) => name)
}

/**
 * The body with each recorded tag replaced by its name where `swap` says so,
 * occurrence-bound as {@link plainBody} is.
 */
function swapTags(
  body: string,
  mentions: readonly Pick<MentionRecord, 'handle' | 'name' | 'status'>[],
  /** The text to put in place of this tag, or null to keep it. */
  swap: (token: string, name: string) => string | null,
): string {
  const names = new Map<string, string[]>()
  for (const m of mentions) {
    if (m.status !== 'tagged') continue
    const h = normaliseHandle(m.handle)
    names.set(h, [...(names.get(h) ?? []), m.name])
  }
  const seen = new Map<string, number>()
  const swaps = mentionTokens(body).flatMap((t) => {
    const list = names.get(t.handle)
    if (!list) return []
    const k = seen.get(t.handle) ?? 0
    seen.set(t.handle, k + 1)
    const text = swap(
      body.slice(t.start, t.end),
      list[Math.min(k, list.length - 1)],
    )
    return text === null ? [] : [{ ...t, name: text }]
  })
  let out = body
  for (const t of swaps.reverse())
    out = `${out.slice(0, t.start)}${t.name}${out.slice(t.end)}`
  return out
}

/**
 * Who lists each handle. A handle a SPONSOR holds is the company's account
 * (spec §3.3): a speaker who also lists it — an employee linking the company
 * page — does not share it, so the tag binds to the company and her opt-out
 * (which covers her own accounts) does not refuse it.
 */
function byHandle(
  people: readonly TaggablePerson[],
): Map<string, TaggablePerson[]> {
  const map = new Map<string, TaggablePerson[]>()
  for (const p of people) {
    const all = p.handles ?? (p.handle ? [p.handle] : [])
    for (const h of new Set(all.map(normaliseHandle)))
      map.set(h, [...(map.get(h) ?? []), p])
  }
  for (const [h, listers] of map) {
    const companies = listers.filter((p) => p.sponsor)
    if (companies.length > 0) map.set(h, companies)
  }
  return map
}

function optedOutIssue(p: TaggablePerson, handle: string): MentionIssue {
  return {
    code: 'opted-out',
    mentionKey: storedKey(p.speakerId),
    handle,
    name: p.name,
    // A sponsor is refused for a speaker who lists its account: never named,
    // since the Task editor is not hers to see (#1154).
    message: p.sponsor
      ? `Someone who has asked not to be tagged in social posts lists @${handle}. Use the plain name instead.`
      : `${p.name} has asked not to be tagged in social posts. Use the plain name instead of @${handle}.`,
  }
}

/**
 * The opt-out always wins (#1154): a sponsor whose handle an opted-out
 * speaker of this conference also lists is treated as opted out itself — the
 * company still OWNS the tag (`byHandle`), but it is refused at save and
 * approval, and swapped for the name in the manual view. Pure.
 */
export function withSharedOptOuts(
  people: readonly TaggablePerson[],
): TaggablePerson[] {
  const refused = new Set(
    people
      .filter((p) => !p.sponsor && p.optedOut)
      .flatMap((p) =>
        (p.handles ?? (p.handle ? [p.handle] : [])).map(normaliseHandle),
      ),
  )
  return people.map((p) =>
    p.sponsor &&
    (p.handles ?? (p.handle ? [p.handle] : [])).some((h) =>
      refused.has(normaliseHandle(h)),
    )
      ? { ...p, optedOut: true }
      : p,
  )
}

/**
 * The conference's own account in the text. The fix drops the `@`: without
 * it the handle is plain text and tags nobody.
 */
function ownAccountIssue(handle: string, name = handle): MentionIssue {
  return {
    code: 'own-account',
    mentionKey: storedKey(`own/${handle}`),
    handle,
    name,
    message: `@${handle} is the conference's own Bluesky account, which is never tagged. Use it without the @.`,
  }
}

function notASpeaker(m: MentionRecord, handle: string): MentionIssue {
  if (m.sponsor)
    return {
      code: 'not-a-sponsor',
      mentionKey: m._key,
      handle,
      name: m.name,
      message: `${m.name} no longer sponsors this conference. Use the plain name instead of @${handle}.`,
    }
  return {
    code: 'not-a-speaker',
    mentionKey: m._key,
    handle,
    name: m.gone ? GONE_SPEAKER_TEXT : m.name,
    ...(m.gone ? { gone: true as const } : {}),
    // A gone speaker's record reads as the neutral words, never their name
    // (MENTION_RECORD_PROJECTION, #1232): say so without naming anyone.
    message: m.gone
      ? `@${handle} tags someone who is no longer a speaker at this conference. Replace it with “${GONE_SPEAKER_TEXT}”.`
      : `${m.name} is no longer a speaker at this conference. Use the plain name instead of @${handle}.`,
  }
}

function notFoundIssue(
  key: string,
  handle: string,
  name: string,
): MentionIssue {
  return {
    code: 'not-found',
    mentionKey: key,
    handle,
    name,
    message: `@${handle} does not resolve on Bluesky, so it would not tag ${name}. Use the plain name.`,
  }
}

function unverified(key: string, handle: string): TagWarning {
  return {
    code: 'unverified',
    mentionKey: key,
    handle,
    message: `Bluesky could not be reached to check @${handle}. The tag is kept; it is checked again at approval and at publish.`,
  }
}

/** The body's tags that are some speaker's handle: one per handle, in order. */
function matchedTags(
  body: string,
  people: readonly TaggablePerson[],
): { handle: string; matches: TaggablePerson[] }[] {
  const known = byHandle(people)
  const seen = new Set<string>()
  return mentionTokens(body).flatMap((t) => {
    const matches = known.get(t.handle)
    if (!matches || seen.has(t.handle)) return []
    seen.add(t.handle)
    return [{ handle: t.handle, matches }]
  })
}

/**
 * What a save decides for one `@handle` in the body, before Bluesky is asked.
 * A handle already RECORDED is judged by the person it was recorded for (so
 * a speaker who changed their link, or a handle another speaker now lists,
 * cannot rebind or drop it); any other handle by the roster's current
 * handles. An opted-out speaker listing the handle refuses it either way.
 */
type TagPlan =
  | { kind: 'refuse'; issue: TagIssue }
  | {
      kind: 'record'
      handle: string
      person: TaggablePerson
      key: string
      did?: string
    }

function planTags(input: {
  body: string
  people: readonly TaggablePerson[]
  previous: readonly MentionRecord[]
  ownAccount?: string | null
}): TagPlan[] {
  const known = byHandle(input.people)
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  const recordFor = (speakerId: string, handle: string) =>
    input.previous.find(
      (m) =>
        m.status === 'tagged' &&
        m.speakerId === speakerId &&
        normaliseHandle(m.handle) === handle,
    )
  const keys = new Set<string>()
  const keyFor = (speakerId: string, handle: string) => {
    let key = storedKey(speakerId)
    // One person's old and new handle both in the text: two keys.
    if (keys.has(key)) key = storedKey(`${speakerId}/${handle}`)
    keys.add(key)
    return key
  }
  const bound = bindTags(input.body, input.people, input.previous)
  const seen = new Set<string>()
  const plans: TagPlan[] = []
  for (const { handle } of mentionTokens(input.body)) {
    if (seen.has(handle)) continue
    seen.add(handle)
    // Our own account, whoever typed it (§4.1): checked before a stranger's
    // handle is let through as text, since the publisher tags any handle.
    if (input.ownAccount && handle === input.ownAccount) {
      plans.push({ kind: 'refuse', issue: ownAccountIssue(handle) })
      continue
    }
    const optedOut = (known.get(handle) ?? []).find((p) => p.optedOut)
    if (optedOut) {
      plans.push({ kind: 'refuse', issue: optedOutIssue(optedOut, handle) })
      continue
    }
    // One record per occurrence owner, in occurrence order (`bindTags`).
    for (const speakerId of bound.get(handle) ?? []) {
      const rec = recordFor(speakerId, handle)
      const person = byId.get(speakerId)
      if (!person) {
        if (rec) plans.push({ kind: 'refuse', issue: notASpeaker(rec, handle) })
        continue
      }
      if (person.optedOut) {
        plans.push({
          kind: 'refuse',
          issue: {
            ...optedOutIssue(person, handle),
            ...(rec ? { mentionKey: rec._key } : {}),
          },
        })
        continue
      }
      plans.push({
        kind: 'record',
        handle,
        person,
        key: keyFor(person.speakerId, handle),
        ...(rec?.did ? { did: rec.did } : {}),
      })
    }
  }
  return plans
}

/**
 * The handles a save must ask Bluesky about: tags it will record that carry
 * no DID already checked for that person and handle. A refused handle (an
 * opted-out speaker's) is never looked up.
 */
export function handlesToResolve(input: {
  body: string
  people: readonly TaggablePerson[]
  previous: readonly MentionRecord[]
  ownAccount?: string | null
}): string[] {
  return [
    ...planTags(input).flatMap((p) =>
      p.kind === 'record' && !p.did ? [p.handle] : [],
    ),
    ...strangersToResolve(
      input.body,
      input.people,
      input.previous,
      input.ownAccount,
    ),
  ]
}

/**
 * When our own account is known only by DID, a stranger's `@handle` may BE
 * it — only Bluesky can tell. Only strangers are asked: no speaker lists
 * these handles, so no opted-out speaker is ever looked up.
 */
function strangersToResolve(
  body: string,
  people: readonly TaggablePerson[],
  mentions: readonly MentionRecord[],
  ownAccount: string | null | undefined,
): string[] {
  if (!ownAccount?.startsWith('did:')) return []
  const bound = bindTags(body, people, mentions)
  return [
    ...new Set(
      mentionTokens(body)
        .map((t) => t.handle)
        .filter((h) => !bound.has(h)),
    ),
  ]
}

/** Strangers' handles that resolved to our own DID (§4.1). */
function ownByDid(
  body: string,
  people: readonly TaggablePerson[],
  mentions: readonly MentionRecord[],
  ownAccount: string | null | undefined,
  resolutions: ReadonlyMap<string, HandleResolution>,
): MentionIssue[] {
  return strangersToResolve(body, people, mentions, ownAccount).flatMap((h) => {
    const r = resolutions.get(h)
    return r?.kind === 'resolved' && r.did === ownAccount
      ? [ownAccountIssue(h)]
      : []
  })
}

/**
 * `mentions[]` rebuilt from the body on a save (§4.3), and the save check
 * (§4.4): every `@handle` that is a speaker's handle, or already recorded,
 * is recorded — typed by hand or generated alike — and a stranger's handle
 * is just text. Refused: an opted-out speaker's handle, a recorded tag of
 * someone no longer a speaker here, a handle Bluesky definitely does not
 * know, and a body that fits only in its tagged form. An `unresolved` note
 * from generation stays while the person is named in plain text.
 */
export function saveMentions(input: {
  body: string
  people: readonly TaggablePerson[]
  previous: readonly MentionRecord[]
  resolutions: ReadonlyMap<string, HandleResolution>
  /** The conference's own account (a handle or DID): never tagged (§4.1). */
  ownAccount?: string | null
}): TagCheck & { mentions: MentionRecord[] } {
  const issues: TagIssue[] = []
  const warnings: TagWarning[] = []
  const tagged: MentionRecord[] = []
  for (const plan of planTags(input)) {
    if (plan.kind === 'refuse') {
      issues.push(plan.issue)
      continue
    }
    const { handle, person, key } = plan
    let did = plan.did
    if (!did) {
      const r = input.resolutions.get(handle)
      if (r?.kind === 'not-found') {
        issues.push(notFoundIssue(key, handle, person.name))
        continue
      }
      if (r?.kind === 'resolved') did = r.did
      else warnings.push(unverified(key, handle))
    }
    // Our own account named by DID: only the resolution tells.
    if (input.ownAccount && did === input.ownAccount) {
      issues.push({ ...ownAccountIssue(handle, person.name), mentionKey: key })
      continue
    }
    tagged.push({
      _key: key,
      handle,
      ...(did ? { did } : {}),
      speakerId: person.speakerId,
      ...(person.sponsor ? { sponsor: true as const } : {}),
      name: person.name,
      status: 'tagged',
    })
  }
  const taggedIds = new Set(tagged.map((m) => m.speakerId))
  // A note stands while the person is still named in plain text.
  const onRoster = new Set(input.people.map((p) => p.speakerId))
  const notes = input.previous.filter(
    (m) =>
      m.status === 'unresolved' &&
      !taggedIds.has(m.speakerId) &&
      // A departed or erased speaker's note goes with them.
      onRoster.has(m.speakerId) &&
      nameIndex(input.body, m.name) >= 0,
  )
  issues.push(
    ...ownByDid(
      input.body,
      input.people,
      input.previous,
      input.ownAccount,
      input.resolutions,
    ),
  )
  const tooLong = plainLengthIssue(input.body, tagged)
  if (tooLong) issues.push(tooLong)
  return { mentions: [...tagged, ...notes], issues, warnings }
}

/**
 * §4.4 "both forms must fit", bounded over EVERY form: at publish only an
 * opted-out speaker's tag is swapped for the name, so any subset of tags may
 * go back. The longest form swaps exactly the tags whose name is longer —
 * stricter than "as written, and with every tag replaced", which misses a
 * post where one name is longer than its tag and another shorter. Measured
 * separately for characters and for bytes, whose longest forms can differ.
 */
function plainLengthIssue(
  body: string,
  mentions: readonly MentionRecord[],
): TagIssue | null {
  if (!mentions.some((m) => m.status === 'tagged')) return null
  const utf8 = (t: string) => new TextEncoder().encode(t).length
  // What may stand in for a tag at publish: the name (an opt-out), or the
  // neutral word for a speaker deleted or erased since (#1152). Per tag,
  // the longest of those, if it is longer than the tag itself.
  const longest =
    (size: (t: string) => number) => (tag: string, name: string) => {
      const text = [name, GONE_SPEAKER_TEXT].reduce((a, b) =>
        size(b) > size(a) ? b : a,
      )
      return size(text) > size(tag) ? text : null
    }
  const plain = countGraphemes(
    swapTags(body, mentions, longest(countGraphemes)),
  )
  const bytes = utf8(swapTags(body, mentions, longest(utf8)))
  const over =
    plain > BLUESKY_MAX_GRAPHEMES
      ? `${plain} characters; Bluesky allows ${BLUESKY_MAX_GRAPHEMES}`
      : bytes > BLUESKY_MAX_BYTES
        ? `${bytes} bytes; Bluesky allows ${BLUESKY_MAX_BYTES}`
        : null
  if (!over) return null
  return {
    code: 'plain-too-long',
    mentionKey: null,
    handle: null,
    name: null,
    message: `A tag may be swapped back for the name at publish, and then the post can reach ${over}. Shorten it until it fits with or without each tag.`,
  }
}

/**
 * The recorded tags the body still carries. A record whose `@handle` is no
 * longer in the text (the body edited in Studio, say) tags nobody: it is
 * neither checked nor refused.
 */
function liveRecords(
  body: string,
  mentions: readonly MentionRecord[],
  people: readonly TaggablePerson[],
): MentionRecord[] {
  // Per occurrence, not per handle: two records for a shared handle with
  // one occurrence left are one live tag (`bindTags` says whose).
  const bound = bindTags(body, people, mentions)
  return mentions.filter(
    (m) =>
      m.status === 'tagged' &&
      (bound.get(normaliseHandle(m.handle)) ?? []).includes(m.speakerId),
  )
}

/**
 * The handles an approval must ask Bluesky about: each recorded tag of a
 * person who is still a speaker here and has not opted out since.
 */
export function approvalHandlesToResolve(input: {
  body: string
  mentions: readonly MentionRecord[]
  people: readonly TaggablePerson[]
  ownAccount?: string | null
}): string[] {
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  return [
    ...new Set([
      ...liveRecords(input.body, input.mentions, input.people).flatMap((m) => {
        const p = byId.get(m.speakerId)
        return m.status === 'tagged' && p && !p.optedOut
          ? [normaliseHandle(m.handle)]
          : []
      }),
      ...strangersToResolve(
        input.body,
        input.people,
        input.mentions,
        input.ownAccount,
      ),
    ]),
  ]
}

/**
 * The approval check (§4.4), on all three refusal paths — approving the
 * Task, scheduling the variant, saving a scheduled one. Each recorded tag:
 * its person still a speaker here and not opted out, its handle still
 * resolving to the recorded DID. Bluesky unreachable is a WARNING; only a
 * definite "no such handle" or a changed DID refuses. An opted-out
 * speaker's handle in the body refuses even when no save recorded it (a
 * body edited outside the editor).
 */
export function approvalCheck(input: {
  body: string
  mentions: readonly MentionRecord[]
  people: readonly TaggablePerson[]
  resolutions: ReadonlyMap<string, HandleResolution>
  /** The conference's own account (a handle or DID): never tagged (§4.1). */
  ownAccount?: string | null
}): TagCheck {
  const issues: TagIssue[] = []
  const warnings: TagWarning[] = []
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  const live = liveRecords(input.body, input.mentions, input.people)
  for (const m of live) {
    const handle = normaliseHandle(m.handle)
    const p = byId.get(m.speakerId)
    if (!p) {
      issues.push(notASpeaker(m, handle))
      continue
    }
    if (p.optedOut) {
      issues.push({ ...optedOutIssue(p, handle), mentionKey: m._key })
      continue
    }
    const r = input.resolutions.get(handle)
    if (r?.kind === 'not-found') {
      issues.push(notFoundIssue(m._key, handle, m.name))
    } else if (r?.kind === 'resolved') {
      if (!m.did) {
        // Saved while Bluesky was unreachable: no DID was ever checked, and
        // the one that goes out must be one that was. A save records it.
        issues.push({
          code: 'unchecked',
          mentionKey: m._key,
          handle,
          name: m.name,
          message: `@${handle} was saved while Bluesky could not be reached, so it was never checked. Save the post again to check it, or use the plain name.`,
        })
      } else if (r.did !== m.did) {
        issues.push({
          code: 'did-changed',
          mentionKey: m._key,
          handle,
          name: m.name,
          message: `@${handle} now belongs to a different Bluesky account than the one checked for ${m.name}. Use the plain name.`,
        })
      }
    } else {
      warnings.push(unverified(m._key, handle))
    }
  }
  const flagged = new Set(issues.map((i) => i.mentionKey))
  // Both forms, again: a Task approved straight from generation was never
  // saved, and generation's fallback fits only the tagged form.
  const tooLong = plainLengthIssue(input.body, live)
  if (tooLong) issues.push(tooLong)
  const recordedHandles = new Set(live.map((m) => normaliseHandle(m.handle)))
  const own = input.ownAccount
  if (own && mentionTokens(input.body).some((t) => t.handle === own))
    issues.push(ownAccountIssue(own))
  issues.push(
    ...ownByDid(
      input.body,
      input.people,
      input.mentions,
      input.ownAccount,
      input.resolutions,
    ),
  )
  for (const { handle, matches } of matchedTags(input.body, input.people)) {
    const optedOut = matches.find((p) => p.optedOut)
    if (optedOut) {
      if (!flagged.has(storedKey(optedOut.speakerId)))
        issues.push(optedOutIssue(optedOut, handle))
      continue
    }
    // A speaker's handle no save recorded (a post created and scheduled
    // without passing through the editor's save): never checked, so never
    // queued. A save records and checks it.
    if (!recordedHandles.has(handle)) {
      const p = matches[0]
      issues.push({
        code: 'unchecked',
        mentionKey: storedKey(p.speakerId),
        handle,
        name: p.name,
        message: `@${handle} tags ${p.name} but was never checked. Save the post to check it, or use the plain name.`,
      })
    }
  }
  return { issues, warnings }
}
