/**
 * How a recorded mention (tagging spec §4.3) is stored on the variant, and
 * read back. The speaker reference is WEAK: a strong one would make the
 * speaker undeletable and defeat GDPR erasure. Pure.
 */

import type { SocialPostMentionDocument } from '@/lib/social/types'
import { GONE_SPEAKER_TEXT, type MentionRecord } from './body'

export function mentionDocuments(
  mentions: readonly MentionRecord[],
): SocialPostMentionDocument[] {
  return mentions.map((m) => ({
    _key: m._key,
    _type: 'socialPostMention',
    handle: m.handle,
    ...(m.did ? { did: m.did } : {}),
    // A sponsor's tag refers to the company, not to a speaker (spec §3.3).
    ...(m.sponsor
      ? { sponsor: { _type: 'reference', _ref: m.speakerId, _weak: true } }
      : { speaker: { _type: 'reference', _ref: m.speakerId, _weak: true } }),
    name: m.name,
    status: m.status,
  }))
}

/**
 * The GROQ projection that reads `mentions[]` back as `MentionRecord`s.
 *
 * A speaker GONE since the record was written — erased, or deleted so the
 * weak reference dangles — reads as the neutral words, never the stored
 * name, without its DID, and marked `gone` (the marker, not the name, is
 * what the editor tells a gone speaker by). The stored name is an erased
 * person's real one, and this read feeds the editor — the issue text and its
 * one-click fix (#1232). Their UNRESOLVED note has no tag in the body to fix,
 * so it is not read at all (no handle, so `mentionRecordsFrom` drops it).
 * Erasure also strips the records themselves; this covers a record written
 * back before it and a speaker deleted outright.
 */
export const MENTION_RECORD_PROJECTION = `{ _key, "handle": select(status == "unresolved" && defined(speaker._ref) && (!defined(speaker->_id) || defined(speaker->erasedAt)) => null, handle), "did": select(defined(speaker._ref) && (!defined(speaker->_id) || defined(speaker->erasedAt)) => null, did), "speakerId": coalesce(speaker._ref, sponsor._ref), "sponsor": defined(sponsor._ref), "name": select(defined(speaker._ref) && (!defined(speaker->_id) || defined(speaker->erasedAt)) => ${JSON.stringify(GONE_SPEAKER_TEXT)}, name), status, "gone": defined(speaker._ref) && (!defined(speaker->_id) || defined(speaker->erasedAt)) }`

export interface RawMentionRecord {
  _key: string | null
  handle: string | null
  did: string | null
  speakerId: string | null
  /** The record's reference is a sponsor's. */
  sponsor?: boolean | null
  name: string | null
  status: string | null
  gone?: boolean | null
}

/** Rows that are not a whole record are dropped rather than half-trusted. */
export function mentionRecordsFrom(
  raw: readonly (RawMentionRecord | null)[] | null | undefined,
): MentionRecord[] {
  return (raw ?? []).flatMap((m): MentionRecord[] => {
    if (!m?._key || !m.handle || !m.speakerId || !m.name) return []
    if (m.status !== 'tagged' && m.status !== 'unresolved') return []
    return [
      {
        _key: m._key,
        handle: m.handle,
        ...(m.did ? { did: m.did } : {}),
        speakerId: m.speakerId,
        ...(m.sponsor === true ? { sponsor: true as const } : {}),
        name: m.name,
        status: m.status,
        ...(m.gone === true ? { gone: true as const } : {}),
      },
    ]
  })
}
