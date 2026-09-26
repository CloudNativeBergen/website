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

/**
 * The conference's own account is never tagged (spec §4.1): a speaker who
 * lists it has no handle to tag. `own` is `ownBlueskyHandle(socialLinks)`,
 * a handle or a DID; the DID form is caught on the resolved DID instead.
 */
export function withoutOwnAccount(
  people: readonly TaggablePerson[],
  own: string | null,
): TaggablePerson[] {
  if (!own) return [...people]
  return people.map((p) =>
    p.handle && normaliseHandle(p.handle) === own ? { ...p, handle: null } : p,
  )
}

export type TagIssueCode =
  | 'opted-out'
  | 'not-a-speaker'
  | 'not-found'
  | 'did-changed'
  | 'unchecked'
  | 'own-account'
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
}): TagPlan[] {
  const known = byHandle(input.people)
  const byId = new Map(input.people.map((p) => [p.speakerId, p]))
  const recorded = new Map<string, MentionRecord>()
  for (const m of input.previous) {
    const h = normaliseHandle(m.handle)
    if (m.status === 'tagged' && !recorded.has(h)) recorded.set(h, m)
  }
  const keys = new Set<string>()
  const seen = new Set<string>()
  const plans: TagPlan[] = []
  for (const { handle } of mentionTokens(input.body)) {
    if (seen.has(handle)) continue
    seen.add(handle)
    const matches = known.get(handle) ?? []
    const optedOut = matches.find((p) => p.optedOut)
    const rec = recorded.get(handle)
    if (optedOut) {
      plans.push({ kind: 'refuse', issue: optedOutIssue(optedOut, handle) })
      continue
    }
    let person: TaggablePerson | undefined
    let did: string | undefined
    if (rec) {
      person = byId.get(rec.speakerId)
      if (!person) {
        plans.push({ kind: 'refuse', issue: notASpeaker(rec, handle) })
        continue
      }
      if (person.optedOut) {
        plans.push({
          kind: 'refuse',
          issue: { ...optedOutIssue(person, handle), mentionKey: rec._key },
        })
        continue
      }
      did = rec.did
    } else {
      person = matches[0]
      if (!person) continue // a stranger's handle is just text
    }
    // One entry per handle; one person's old and new handle get two keys.
    let key = storedKey(person.speakerId)
    if (keys.has(key)) key = storedKey(`${person.speakerId}/${handle}`)
    keys.add(key)
    plans.push({ kind: 'record', handle, person, key, ...(did ? { did } : {}) })
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
}): string[] {
  return planTags(input).flatMap((p) =>
    p.kind === 'record' && !p.did ? [p.handle] : [],
  )
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
    if (did && input.ownAccount && did === input.ownAccount) {
      issues.push({
        code: 'own-account',
        mentionKey: key,
        handle,
        name: person.name,
        message: `@${handle} is the conference's own Bluesky account, which is never tagged. Use the plain name.`,
      })
      continue
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
  const recordedHandles = new Set(
    input.mentions
      .filter((m) => m.status === 'tagged')
      .map((m) => normaliseHandle(m.handle)),
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
