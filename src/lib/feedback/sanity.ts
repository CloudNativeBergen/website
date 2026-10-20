/**
 * Session Feedback reads (speaker feedback spec §4.4, §5, §6).
 *
 * Every read here except the minter's seed is PUBLISHED-ONLY: the clients'
 * API version returns `drafts.*` documents, and a schedule can be a `draft`
 * the organizers are still moving talks around in. Without the filter an
 * unpublished schedule would open a Feedback Window.
 */
import 'server-only'
import {
  clientReadCached,
  clientReadUncached,
  clientWrite,
} from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { OFFICIAL_SCHEDULE_FILTER } from '@/lib/speaker/sanity'
import type { FeedbackSlot } from './window'

/**
 * The first API version whose `raw` perspective includes Content Release
 * `versions.**` documents (as in `src/lib/sanity/orphaned-asset.ts`). The
 * default clients' version does not, so a write that must reach every
 * version of a talk runs through {@link versionsClient}.
 */
export const VERSIONS_API_VERSION = '2025-02-19'

/**
 * The one client for the version lookup, the write and the sweep (§4.2).
 * Every fetch through it passes `perspective: 'raw'`.
 */
export function versionsClient({ timeout }: { timeout?: number } = {}) {
  return clientWrite.withConfig({
    apiVersion: VERSIONS_API_VERSION,
    ...(timeout !== undefined && { timeout }),
  })
}

/** Published documents only (§4.4): no drafts, no Content Release versions. */
export const PUBLISHED_ONLY =
  '!(_id in path("drafts.**")) && !(_id in path("versions.**"))'

/**
 * Every slot of `talkId` on the conference's published, official schedule
 * days (§6). Placeholder slots never carry a talk reference, so they never
 * match.
 */
export async function getFeedbackSlots(
  conferenceId: string,
  talkId: string,
): Promise<FeedbackSlot[]> {
  const days = await scopedFetch<
    { date: string | null; slots: Omit<FeedbackSlot, 'date'>[] | null }[]
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "schedule" && ${PUBLISHED_ONLY} && ${OFFICIAL_SCHEDULE_FILTER}]{
      date,
      "slots": tracks[].talks[][talk._ref == $talkId]{ startTime, endTime }
    }`,
    { talkId },
    { cache: 'no-store' },
  )
  return (days ?? []).flatMap((day) =>
    (day.slots ?? []).map((s) => ({
      date: day.date,
      startTime: s.startTime ?? null,
      endTime: s.endTime ?? null,
    })),
  )
}

/**
 * The minter's seed: every Feedback Code the conference's talks hold,
 * INCLUDING drafts and release versions (§4.4), so a new code is never one a
 * draft already holds — the `/go` minter's rule.
 */
export async function conferenceFeedbackCodes(
  conferenceId: string,
): Promise<string[]> {
  const codes = await scopedFetch<unknown>(
    versionsClient(),
    { conferenceId },
    `*[_type == "talk" && defined(feedbackCode)].feedbackCode`,
    {},
    { cache: 'no-store', perspective: 'raw' },
  )
  if (!Array.isArray(codes)) return []
  return codes.filter((c): c is string => typeof c === 'string')
}

export interface ConfirmedTalk {
  _id: string
  title: string | null
  feedbackCode: string | null
  /** A speaker of the talk exists and is not erased. */
  hasLiveSpeaker: boolean
}

/**
 * The conference's published, confirmed talks, for minting every code at
 * once (#1459). GROQ may lag a write by about a second; each talk is read
 * again by id before anything is written to it.
 */
export async function getConfirmedTalks(
  conferenceId: string,
): Promise<ConfirmedTalk[]> {
  const talks = await scopedFetch<ConfirmedTalk[]>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "talk" && ${PUBLISHED_ONLY} && status == "confirmed"] | order(title asc){
      _id, title, feedbackCode,
      // count() of a missing array is null: coalesce, so the flag is a boolean.
      "hasLiveSpeaker": coalesce(count(speakers[defined(@->_id) && !defined(@->erasedAt)]), 0) > 0
    }`,
    {},
    { cache: 'no-store' },
  )
  return talks ?? []
}

/**
 * Every slot on the conference's published, official schedule days, by
 * talk: {@link getFeedbackSlots} for all talks in one read, for the bulk
 * mint's count (#1459) and the dashboard chips, which pass the CDN client.
 */
export async function getConferenceFeedbackSlots(
  conferenceId: string,
  client:
    typeof clientReadUncached | typeof clientReadCached = clientReadUncached,
): Promise<Map<string, FeedbackSlot[]>> {
  const days = await scopedFetch<
    | {
        date: string | null
        // A track with no talks yields a null entry.
        slots:
          | ((Omit<FeedbackSlot, 'date'> & { talkId: string | null }) | null)[]
          | null
      }[]
    | null
  >(
    client,
    { conferenceId },
    `*[_type == "schedule" && ${PUBLISHED_ONLY} && ${OFFICIAL_SCHEDULE_FILTER}]{
      date,
      "slots": tracks[].talks[defined(talk._ref)]{
        "talkId": talk._ref, startTime, endTime
      }
    }`,
    {},
    client === clientReadUncached ? { cache: 'no-store' } : {},
  )
  const byTalk = new Map<string, FeedbackSlot[]>()
  for (const day of days ?? []) {
    for (const s of day.slots ?? []) {
      if (!s?.talkId) continue
      const slots = byTalk.get(s.talkId) ?? []
      slots.push({
        date: day.date,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
      })
      byTalk.set(s.talkId, slots)
    }
  }
  return byTalk
}
