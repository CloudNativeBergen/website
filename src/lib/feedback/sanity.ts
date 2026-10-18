/**
 * Session Feedback reads (speaker feedback spec §4.4, §5, §6).
 *
 * Every read here except the minter's seed is PUBLISHED-ONLY: the clients'
 * API version returns `drafts.*` documents, and a schedule can be a `draft`
 * the organizers are still moving talks around in. Without the filter an
 * unpublished schedule would open a Feedback Window.
 */
import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
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
export function versionsClient() {
  return clientWrite.withConfig({ apiVersion: VERSIONS_API_VERSION })
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
