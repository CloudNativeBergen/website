/**
 * How a recorded mention (tagging spec §4.3) is stored on the variant, and
 * read back. The speaker reference is WEAK: a strong one would make the
 * speaker undeletable and defeat GDPR erasure. Pure.
 */

import type { SocialPostMentionDocument } from '@/lib/social/types'
import type { MentionRecord } from './body'

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

/** The GROQ projection that reads `mentions[]` back as `MentionRecord`s. */
export const MENTION_RECORD_PROJECTION = `{ _key, handle, did, "speakerId": coalesce(speaker._ref, sponsor._ref), "sponsor": defined(sponsor._ref), name, status }`

export interface RawMentionRecord {
  _key: string | null
  handle: string | null
  did: string | null
  speakerId: string | null
  /** The record's reference is a sponsor's. */
  sponsor?: boolean | null
  name: string | null
  status: string | null
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
      },
    ]
  })
}
