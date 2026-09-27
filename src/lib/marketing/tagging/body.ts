/**
 * A tagging Bluesky body (spec §4.1, §4.3). Pure.
 *
 * The value map a beat is built from serves BOTH Channels and the alt text,
 * so `{name}` and `{speakers}` stay plain names in it. This is the one place
 * a handle goes in: when the body of a Bluesky `tagSubject` recipe is
 * resolved, `{name}` and `{speakers}` are the subject's people with each tag
 * in place of the name — and a handle costs its full length, so over either
 * limit (300 characters, 3,000 bytes) a tag longer than its name in that
 * unit falls back to plain text, from the last one, until every form fits.
 */

import { resolvePlaceholders, type Placeholder } from '../placeholders'
import { storedKey } from '../recipes'
import type { TaskRecipe } from '../template/types'

/** Bluesky's limit (`PLATFORM_CONSTRAINTS.bluesky.maxLength`). */
export const BLUESKY_MAX_GRAPHEMES = 300

/**
 * Length as Bluesky counts it, like `countLength(text, 'graphemes')`. Not
 * imported from the platform constraints: seeding (and so this module) is
 * imported by the admin stories, and those constraints pull in a domain list.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export function countGraphemes(text: string): number {
  return [...segmenter.segment(text)].length
}

/** Bluesky's byte cap on a post's text (`PLATFORM_CONSTRAINTS.bluesky.maxBytes`). */
export const BLUESKY_MAX_BYTES = 3000
const utf8 = new TextEncoder()
const countBytes = (text: string) => utf8.encode(text).length

/** One limit a generated body must fit in every form, in its own unit. */
interface LengthBound {
  length: (text: string) => number
  max: number
}
const LENGTH_BOUNDS: readonly LengthBound[] = [
  { length: countGraphemes, max: BLUESKY_MAX_GRAPHEMES },
  { length: countBytes, max: BLUESKY_MAX_BYTES },
]

/** What generation found for one person's Bluesky account. */
export type BlueskyTag =
  | { status: 'tagged'; handle: string; did: string }
  /** Generation wanted to tag and the handle did not resolve. */
  | { status: 'unresolved'; handle: string }

/**
 * A person as `{name}` and `{speakers}` name them. `jobTitle` is what
 * `{company}` holds for a speaker — never the talk's `{title}`.
 */
export interface NamedPerson {
  name: string
  jobTitle?: string | null
}

/**
 * One person a subject's `{name}` and `{speakers}` name, in order. `tag` is
 * null when there is nothing to tag: no Bluesky link, opted out (#1148), or
 * our own account.
 */
export interface TagPerson extends NamedPerson {
  speakerId: string
  tag: BlueskyTag | null
}

/**
 * A recorded mention (spec §4.3): one per tag the body carries, and one per
 * handle that did not resolve (the editor's note is shown from it). `did` is
 * what the publishing adapter posts (#1149's `PublishMention`).
 */
export interface MentionRecord {
  _key: string
  handle: string
  did?: string
  speakerId: string
  name: string
  status: 'tagged' | 'unresolved'
}

/** The only kind of recipe `tagSubject` applies to (tagging spec §2). */
export function isBlueskyPost(r: TaskRecipe): boolean {
  return r.kind === 'publishing' && r.channel === 'bluesky'
}

/** A recipe whose generated body tags its subject (tagging spec §2, §4.1). */
export function tagsItsSubject(r: TaskRecipe): boolean {
  return isBlueskyPost(r) && r.tagSubject === true
}

/** "Alice", "Alice and Bob", "Alice, Bob and Carol" (spec §4.2). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * `{speakers}` (spec §4.2): each name with what `{company}` holds for a
 * speaker — their job title — "Alice (SRE, Acme) and Bob (CTO, Initech)".
 */
export function speakersList(people: readonly NamedPerson[]): string {
  return joinNames(
    people.map((p) =>
      p.jobTitle?.trim() ? `${p.name} (${p.jobTitle.trim()})` : p.name,
    ),
  )
}

export function tagBlueskyBody(input: {
  skeleton: string
  values: Partial<Record<Placeholder, string>>
  people: readonly TagPerson[]
}): { body: string; mentions: MentionRecord[] } {
  const { skeleton, values, people } = input
  const plain = resolvePlaceholders(skeleton, values)
  if (
    people.length === 0 ||
    !(skeleton.includes('{name}') || skeleton.includes('{speakers}'))
  )
    return { body: plain, mentions: [] }

  const handleOf = (p: TagPerson) => (p.tag ? `@${p.tag.handle}` : p.name)
  const render = (label: (p: TagPerson) => string) => {
    const named = people.map((p) => ({
      name: label(p),
      jobTitle: p.jobTitle,
    }))
    return resolvePlaceholders(skeleton, {
      ...values,
      name: joinNames(named.map((p) => p.name)),
      speakers: speakersList(named),
    })
  }
  const withTags = (tagged: ReadonlySet<TagPerson>) =>
    render((p) => (tagged.has(p) ? handleOf(p) : p.name))
  // Every form must fit (§4.4), not just all-tagged and all-plain: at
  // publish only an opted-out speaker's tag goes back to the name, so ANY
  // subset may be swapped. Per bound, the longest form takes each tag in
  // its longer form — max(handle, name) in that bound's unit.
  const tagIsLonger = (p: TagPerson, b: LengthBound) =>
    b.length(handleOf(p)) > b.length(p.name)
  const overBounds = (tagged: ReadonlySet<TagPerson>) =>
    LENGTH_BOUNDS.filter(
      (b) =>
        b.length(
          render((p) =>
            tagged.has(p) && tagIsLonger(p, b) ? handleOf(p) : p.name,
          ),
        ) > b.max,
    )

  // Walking back from the LAST speaker, drop only a tag that is longer than
  // its name in a bound that is over: any other drop cannot shorten the
  // worst case, and would cost that speaker their tag for nothing. When no
  // such tag is left and a bound is still over, the plain form itself is
  // over, and nobody is tagged.
  const candidates = people.filter((p) => p.tag?.status === 'tagged')
  for (;;) {
    const over = overBounds(new Set(candidates))
    if (over.length === 0) break
    const i = candidates.findLastIndex((p) =>
      over.some((b) => tagIsLonger(p, b)),
    )
    if (i < 0) {
      candidates.length = 0
      break
    }
    candidates.splice(i, 1)
  }
  const body = withTags(new Set(candidates))

  const tagged = new Set(candidates)
  const mentions = people.flatMap((p): MentionRecord[] => {
    if (!p.tag) return []
    const base = {
      _key: storedKey(p.speakerId),
      handle: p.tag.handle,
      speakerId: p.speakerId,
      name: p.name,
    }
    if (p.tag.status === 'unresolved')
      return [{ ...base, status: 'unresolved' }]
    // Fell back to the plain name for length: not a tag, so no entry.
    return tagged.has(p) ? [{ ...base, did: p.tag.did, status: 'tagged' }] : []
  })
  return { body, mentions }
}
