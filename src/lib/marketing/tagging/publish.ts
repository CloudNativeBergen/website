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

export interface WithheldTag {
  speakerId: string
  name: string
  handle: string
  /** Opted out since approval, or deleted/erased since (nobody to tag). */
  reason: 'opted-out' | 'gone'
}

export function withholdOptedOutTags(input: {
  body: string
  recorded: readonly RecordedTag[]
}): { body: string; mentions: PublishMention[]; withheld: WithheldTag[] } {
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
    withheld.set(r.speakerId, {
      speakerId: r.speakerId,
      name: r.name,
      handle: t.handle,
      reason: r.gone ? 'gone' : 'opted-out',
    })
    return [{ ...t, name: r.name }]
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
