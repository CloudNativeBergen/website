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
  BLUESKY_MAX_GRAPHEMES,
  countGraphemes,
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
 * Someone a body may tag: a speaker of this conference (sponsors join in
 * #1154). `handle` is null without a Bluesky link — and for an opted-out
 * speaker in anything sent to the browser, so their links never leave the
 * server; the server-side checks get the real handle.
 */
export interface TaggablePerson {
  speakerId: string
  name: string
  handle: string | null
  optedOut: boolean
}

export type TagIssueCode =
  | 'opted-out'
  | 'not-a-speaker'
  | 'not-found'
  | 'did-changed'
  | 'unchecked'
  | 'plain-too-long'

/**
 * Why a save or an approval is refused, structured so the editor can offer
 * the one-click fix ("use the plain name"): the fix swaps `@handle` for
 * `name`. `mentionKey`, `handle` and `name` are null only for
 * `plain-too-long`, which is about the whole body.
 */
export interface TagIssue {
  code: TagIssueCode
  mentionKey: string | null
  handle: string | null
  name: string | null
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
  const at = nameIndex(body, person.name)
  if (at < 0) return null
  return `${body.slice(0, at)}@${person.handle}${body.slice(at + person.name.length)}`
}

/**
 * Where the name stands as a whole word the adapter would detect a tag at,
 * or -1: not inside a longer word, a handle or a URL ("Ann" is not in
 * "Annika" or "x.dev/Ann"), and not after a quote or a dash, where
 * `@handle` would stay plain text.
 */
export function nameIndex(body: string, name: string): number {
  if (!name) return -1
  for (let at = body.indexOf(name); at >= 0; at = body.indexOf(name, at + 1)) {
    const before = body[at - 1]
    const after = body[at + name.length]
    // Only where a tag would be detected: after a space, a "(" or at the start.
    const startsTag = before === undefined || /[\s(]/.test(before)
    const endsWord = after === undefined || !/[\p{L}\p{N}_]/u.test(after)
    if (startsTag && endsWord) return at
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

/** The body with every recorded tag replaced by its name (§4.4, both forms). */
export function plainBody(
  body: string,
  mentions: readonly Pick<MentionRecord, 'handle' | 'name' | 'status'>[],
): string {
  return mentions
    .filter((m) => m.status === 'tagged')
    .reduce((text, m) => untagHandle(text, m.handle, m.name), body)
}

function byHandle(
  people: readonly TaggablePerson[],
): Map<string, TaggablePerson[]> {
  const map = new Map<string, TaggablePerson[]>()
  for (const p of people) {
    if (!p.handle) continue
    const h = normaliseHandle(p.handle)
    map.set(h, [...(map.get(h) ?? []), p])
  }
  return map
}

function optedOutIssue(p: TaggablePerson, handle: string): TagIssue {
  return {
    code: 'opted-out',
    mentionKey: storedKey(p.speakerId),
    handle,
    name: p.name,
    message: `${p.name} has asked not to be tagged in social posts. Use the plain name instead of @${handle}.`,
  }
}

function notASpeaker(m: MentionRecord, handle: string): TagIssue {
  return {
    code: 'not-a-speaker',
    mentionKey: m._key,
    handle,
    name: m.name,
    message: `${m.name} is no longer a speaker at this conference. Use the plain name instead of @${handle}.`,
  }
}

function notFoundIssue(key: string, handle: string, name: string): TagIssue {
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
 * The handles a save must ask Bluesky about: tags of speakers who have not
 * opted out (an opted-out speaker's handle is refused, never looked up) and
 * that carry no DID already checked for the same person and handle.
 */
export function handlesToResolve(input: {
  body: string
  people: readonly TaggablePerson[]
  previous: readonly MentionRecord[]
}): string[] {
  return matchedTags(input.body, input.people).flatMap(
    ({ handle, matches }) => {
      if (matches.some((p) => p.optedOut)) return []
      return priorDid(input.previous, matches[0], handle) ? [] : [handle]
    },
  )
}

function priorDid(
  previous: readonly MentionRecord[],
  person: TaggablePerson,
  handle: string,
): string | undefined {
  return previous.find(
    (m) =>
      m.status === 'tagged' &&
      m.speakerId === person.speakerId &&
      normaliseHandle(m.handle) === handle &&
      m.did,
  )?.did
}

/**
 * `mentions[]` rebuilt from the body on a save (§4.3), and the save check
 * (§4.4): every `@handle` that is a speaker's handle is recorded — typed by
 * hand or generated alike — and a stranger's handle is just text. Refused:
 * an opted-out speaker's handle, a handle Bluesky definitely does not know,
 * and a body that fits only in its tagged form. An `unresolved` note from
 * generation stays until that person is tagged.
 */
export function saveMentions(input: {
  body: string
  people: readonly TaggablePerson[]
  previous: readonly MentionRecord[]
  resolutions: ReadonlyMap<string, HandleResolution>
}): TagCheck & { mentions: MentionRecord[] } {
  const issues: TagIssue[] = []
  const warnings: TagWarning[] = []
  const tagged: MentionRecord[] = []
  for (const { handle, matches } of matchedTags(input.body, input.people)) {
    const optedOut = matches.find((p) => p.optedOut)
    if (optedOut) {
      issues.push(optedOutIssue(optedOut, handle))
      continue
    }
    const person = matches[0]
    const key = storedKey(person.speakerId)
    let did = priorDid(input.previous, person, handle)
    if (!did) {
      const r = input.resolutions.get(handle)
      if (r?.kind === 'not-found') {
        issues.push(notFoundIssue(key, handle, person.name))
        continue
      }
      if (r?.kind === 'resolved') did = r.did
      else warnings.push(unverified(key, handle))
    }
    tagged.push({
      _key: key,
      handle,
      ...(did ? { did } : {}),
      speakerId: person.speakerId,
      name: person.name,
      status: 'tagged',
    })
  }
  // A recorded tag whose handle is still in the body but no longer matches
  // anyone's CURRENT handle (the speaker changed their link, or left the
  // roster): never dropped — that would leave a tag no later check knows
  // about. It is judged by the PERSON it was recorded for.
  const inBody = new Set(mentionTokens(input.body).map((t) => t.handle))
  const known = byHandle(input.people)
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  for (const m of input.previous) {
    const handle = normaliseHandle(m.handle)
    if (m.status !== 'tagged' || !inBody.has(handle) || known.has(handle))
      continue
    if (tagged.some((t) => t.handle === handle)) continue
    const person = byId.get(m.speakerId)
    if (!person) issues.push(notASpeaker(m, handle))
    else if (person.optedOut)
      issues.push({ ...optedOutIssue(person, handle), mentionKey: m._key })
    else {
      // Old and new handle of one person both in the text: one entry each,
      // so the keys must differ.
      const clash = tagged.some((t) => t._key === m._key)
      tagged.push({
        ...m,
        _key: clash ? storedKey(`${m.speakerId}/${handle}`) : m._key,
        handle,
        name: person.name,
      })
    }
  }
  const taggedIds = new Set(tagged.map((m) => m.speakerId))
  // A note stands while the person is still named in plain text.
  const notes = input.previous.filter(
    (m) =>
      m.status === 'unresolved' &&
      !taggedIds.has(m.speakerId) &&
      nameIndex(input.body, m.name) >= 0,
  )
  if (tagged.length > 0) {
    const plain = countGraphemes(plainBody(input.body, tagged))
    if (plain > BLUESKY_MAX_GRAPHEMES) {
      issues.push({
        code: 'plain-too-long',
        mentionKey: null,
        handle: null,
        name: null,
        message: `With every tag replaced by its name the post is ${plain} characters; Bluesky allows ${BLUESKY_MAX_GRAPHEMES}. A tag may be swapped for the name at publish, so shorten the post until it fits both ways.`,
      })
    }
  }
  return { mentions: [...tagged, ...notes], issues, warnings }
}

/**
 * The handles an approval must ask Bluesky about: each recorded tag of a
 * person who is still a speaker here and has not opted out since.
 */
export function approvalHandlesToResolve(input: {
  mentions: readonly MentionRecord[]
  people: readonly TaggablePerson[]
}): string[] {
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  return [
    ...new Set(
      input.mentions.flatMap((m) => {
        const p = byId.get(m.speakerId)
        return m.status === 'tagged' && p && !p.optedOut
          ? [normaliseHandle(m.handle)]
          : []
      }),
    ),
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
}): TagCheck {
  const issues: TagIssue[] = []
  const warnings: TagWarning[] = []
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  for (const m of input.mentions) {
    if (m.status !== 'tagged') continue
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
  for (const { handle, matches } of matchedTags(input.body, input.people)) {
    const optedOut = matches.find((p) => p.optedOut)
    if (optedOut && !flagged.has(storedKey(optedOut.speakerId)))
      issues.push(optedOutIssue(optedOut, handle))
  }
  return { issues, warnings }
}
