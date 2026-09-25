/**
 * A tagging Bluesky body (spec §4.1, §4.3). Pure.
 *
 * The value map a beat is built from serves BOTH Channels and the alt text,
 * so `{name}` stays a plain name in it. This is the one place a handle goes
 * in: when the body of a Bluesky `tagSubject` recipe is resolved, `{name}` is
 * the subject's people with each tag in place of the name — and a handle
 * costs its full length, so over the limit names fall back to plain text from
 * the last one until the body fits.
 */

import { resolvePlaceholders, type Placeholder } from '../placeholders'
import { storedKey } from '../recipes'

/** Bluesky's limit (`PLATFORM_CONSTRAINTS.bluesky.maxLength`). */
export const BLUESKY_MAX_GRAPHEMES = 300

/**
 * Length as Bluesky counts it, like `countLength(text, 'graphemes')`. Not
 * imported from the platform constraints: seeding (and so this module) is
 * imported by the admin stories, and those constraints pull in a domain list.
 */
function graphemes(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].length
}

/** What generation found for one person's Bluesky account. */
export type BlueskyTag =
  | { status: 'tagged'; handle: string; did: string }
  /** Generation wanted to tag and the handle did not resolve. */
  | { status: 'unresolved'; handle: string }

/**
 * One person a subject's `{name}` names, in order. `tag` is null when there is
 * nothing to tag: no Bluesky link, opted out (#1148), or our own account.
 */
export interface TagPerson {
  speakerId: string
  name: string
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

/** "Alice", "Alice and Bob", "Alice, Bob and Carol" (spec §4.2). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function tagBlueskyBody(input: {
  skeleton: string
  values: Partial<Record<Placeholder, string>>
  people: readonly TagPerson[]
  maxGraphemes?: number
}): { body: string; mentions: MentionRecord[] } {
  const { skeleton, values, people } = input
  const max = input.maxGraphemes ?? BLUESKY_MAX_GRAPHEMES
  const plain = resolvePlaceholders(skeleton, values)
  if (people.length === 0 || !skeleton.includes('{name}'))
    return { body: plain, mentions: [] }

  const render = (tagged: ReadonlySet<TagPerson>) =>
    resolvePlaceholders(skeleton, {
      ...values,
      name: joinNames(
        people.map((p) =>
          tagged.has(p) && p.tag ? `@${p.tag.handle}` : p.name,
        ),
      ),
    })

  const candidates = people.filter((p) => p.tag?.status === 'tagged')
  let body = render(new Set(candidates))
  while (candidates.length > 0 && graphemes(body) > max) {
    candidates.pop()
    body = render(new Set(candidates))
  }

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
