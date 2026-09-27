/**
 * The publish-time check (tagging spec §4.4, Publish). Pure.
 *
 * A speaker may opt out after their post was approved and scheduled. At
 * publish each recorded tag is checked against the opt-out the tick read with
 * it; an opted-out speaker's tag goes out as their plain name, and the post
 * still goes out on schedule. Only RECORDED tags are checked — a handle typed
 * past every save is the approval check's to refuse.
 */

import { normaliseHandle } from '@/lib/social/provider/bluesky-syntax'
import type { PublishMention } from '@/lib/social/provider/types'
import type { RecordedTag } from '@/lib/social/types'
import { mentionTokens } from './checks'

/**
 * What stands in for a speaker who is GONE — deleted, or erased (#1162). Not
 * their name: erasure never touches the variant, so the name stored on the
 * record is an erased person's real name, and it must never be posted or
 * repeated in a notification (GDPR). A neutral word keeps the sentence
 * readable ("a speaker and @bob.dev are speaking").
 */
export const GONE_SPEAKER_TEXT = 'a speaker'

/**
 * A tag that did not go out. An opted-out speaker is still a speaker: their
 * name is what was posted, and the organizers are told it. A gone speaker
 * carries nothing of the person.
 */
export type WithheldTag =
  | { reason: 'opted-out'; speakerId: string; name: string; handle: string }
  | { reason: 'gone'; speakerId: string }

export interface WithheldTags {
  /** The text to post. */
  body: string
  /** The recorded DIDs to post: only for handles still in `body`. */
  mentions: PublishMention[]
  withheld: WithheldTag[]
}

export function withholdOptedOutTags(input: {
  body: string
  recorded: readonly RecordedTag[]
}): WithheldTags {
  // Per handle, the records in occurrence order (as `plainBody` binds them):
  // the k-th occurrence is the k-th record, extra ones the last record's.
  const byHandle = new Map<string, RecordedTag[]>()
  for (const r of input.recorded) {
    const h = normaliseHandle(r.handle)
    byHandle.set(h, [...(byHandle.get(h) ?? []), r])
  }
  const seen = new Map<string, number>()
  const withheld = new Map<string, WithheldTag>()
  const swaps = mentionTokens(input.body).flatMap((t) => {
    const list = byHandle.get(t.handle)
    if (!list) return []
    const k = seen.get(t.handle) ?? 0
    seen.set(t.handle, k + 1)
    const r = list[Math.min(k, list.length - 1)]
    if (!r.speakerId || !(r.optedOut || r.gone)) return []
    withheld.set(
      r.speakerId,
      r.gone
        ? { reason: 'gone', speakerId: r.speakerId }
        : {
            reason: 'opted-out',
            speakerId: r.speakerId,
            name: r.name,
            handle: t.handle,
          },
    )
    return [{ ...t, name: r.gone ? GONE_SPEAKER_TEXT : r.name }]
  })
  let body = input.body
  for (const t of swaps.reverse())
    body = `${body.slice(0, t.start)}${t.name}${body.slice(t.end)}`

  // The DIDs the adapter posts: only for handles still in the text, once each.
  const left = new Set(mentionTokens(body).map((t) => t.handle))
  const mentions = new Map<string, PublishMention>()
  for (const r of input.recorded) {
    const h = normaliseHandle(r.handle)
    if (r.did && left.has(h) && !mentions.has(h))
      mentions.set(h, { handle: r.handle, did: r.did })
  }
  return {
    body,
    mentions: [...mentions.values()],
    withheld: [...withheld.values()],
  }
}
