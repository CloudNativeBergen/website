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
import { mentionTokens, occurrenceOwners, replacementText } from './checks'
import { GONE_SPEAKER_TEXT } from './body'

export { GONE_SPEAKER_TEXT }

/**
 * A tag that did not go out. An opted-out speaker is still a speaker: their
 * name is what was posted, and the organizers are told it. A gone speaker
 * carries nothing of the person.
 */
export type WithheldTag =
  | {
      reason: 'opted-out'
      speakerId: string
      name: string
      /** Every handle of theirs that was withheld, in body order (round 4). */
      handles: string[]
    }
  | { reason: 'gone'; speakerId: string }
  /**
   * A sponsor company's tag whose handle an opted-out speaker lists (#1154):
   * the company's name went out. The speaker is never named.
   */
  | {
      reason: 'listed-by-opted-out'
      sponsorId: string
      name: string
      handles: string[]
    }

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
  // Which record owns each occurrence: the SAME binding the approval check
  // uses (`bindTags`), so a shared handle whose first occurrence was edited
  // away in Studio still belongs to whoever the check bound it to. Records
  // are keyed by index: publish has no roster, and a record may have no
  // speaker (a sponsor's).
  const owners = occurrenceOwners(
    input.body,
    input.recorded.map((r, i) => ({
      handle: r.handle,
      speakerId: String(i),
      status: 'tagged' as const,
      name: r.name,
    })),
  )
  const lastOf = new Map<string, RecordedTag>()
  for (const r of input.recorded) lastOf.set(normaliseHandle(r.handle), r)
  const seen = new Map<string, number>()
  const withheld = new Map<string, WithheldTag>()
  const kept: { handle: string; record: RecordedTag }[] = []
  const swaps = mentionTokens(input.body).flatMap((t) => {
    const ids = owners.get(t.handle)
    const last = lastOf.get(t.handle)
    if (!last) return []
    const k = seen.get(t.handle) ?? 0
    seen.set(t.handle, k + 1)
    // More occurrences than owners: the extras are the last record's.
    const id = ids?.[k]
    const r = id !== undefined ? input.recorded[Number(id)] : last
    const owner = r.speakerId ?? r.sponsorId
    if (!owner || !(r.optedOut || r.gone)) {
      kept.push({ handle: t.handle, record: r })
      return []
    }
    const before = withheld.get(owner)
    if (!r.speakerId && r.sponsorId) {
      withheld.set(owner, {
        reason: 'listed-by-opted-out',
        sponsorId: r.sponsorId,
        name: r.name,
        handles: [
          ...new Set([
            ...(before?.reason === 'listed-by-opted-out' ? before.handles : []),
            t.handle,
          ]),
        ],
      })
      return [{ ...t, name: replacementText(r) }]
    }
    withheld.set(
      owner,
      r.gone
        ? { reason: 'gone', speakerId: r.speakerId! }
        : {
            reason: 'opted-out',
            speakerId: r.speakerId!,
            name: r.name,
            handles: [
              ...new Set([
                ...(before?.reason === 'opted-out' ? before.handles : []),
                t.handle,
              ]),
            ],
          },
    )
    return [{ ...t, name: replacementText(r) }]
  })
  let body = input.body
  for (const t of [...swaps].reverse())
    body = `${body.slice(0, t.start)}${t.name}${body.slice(t.end)}`

  // The DIDs the adapter posts: per handle, the DID of the records owning its
  // SURVIVING original occurrences (never re-detected from the new text: a
  // name holding the handle must not bring the tag back). The adapter applies
  // one DID to every occurrence of a handle, so when those records disagree
  // (a shared handle recorded at two DIDs) none is posted — never, say, the
  // opted-out owner's DID on the other owner's occurrence.
  const dids = new Map<string, { handle: string; did: Set<string> }>()
  for (const { handle, record } of kept) {
    const entry = dids.get(handle) ?? { handle: record.handle, did: new Set() }
    entry.did.add(record.did ?? '')
    dids.set(handle, entry)
  }
  const mentions: PublishMention[] = []
  for (const { handle, did } of dids.values()) {
    const [only] = [...did]
    if (did.size === 1 && only) mentions.push({ handle, did: only })
  }
  return {
    body,
    mentions,
    withheld: [...withheld.values()],
  }
}
