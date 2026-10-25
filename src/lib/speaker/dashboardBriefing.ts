/**
 * The speaker dashboard's briefing (#1592): which edition gets one, the live
 * read of its speaker fields, and the conference-day and dinner pins. A failed
 * read or a bad date never throws — the card must still render.
 */
import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import {
  getSpeakerBriefing,
  type SpeakerBriefing,
  type SpeakerBriefingData,
} from '@/lib/speaker/briefing'
import { osloTodayDateString } from '@/lib/time'

export type BriefingFields = Partial<
  Pick<
    Conference,
    | 'speakerInfo'
    | 'speakerDinnerInfo'
    | 'venueName'
    | 'venueAddress'
    | 'venueTravelInfo'
  >
>

export async function loadDashboardBriefing({
  conference,
  currentConferenceId,
  isOver,
  proposals,
  speakerId,
  travelSupport,
  fetchFields,
  now = new Date(),
}: {
  conference: Conference
  currentConferenceId?: string
  isOver: boolean
  proposals: ProposalExisting[]
  speakerId: string
  travelSupport?: SpeakerBriefingData['travelSupport'] | null
  /** The live (uncached) read of the conference's speaker fields. */
  fetchFields: (conferenceId: string) => Promise<BriefingFields | null>
  now?: Date
}): Promise<
  | { briefing: SpeakerBriefing; conferenceDay?: string; pinDinner: boolean }
  | undefined
> {
  // This host's edition only, for a speaker with a confirmed talk, until the
  // conference is over.
  if (
    conference._id !== currentConferenceId ||
    isOver ||
    !proposals.some((p) => p.status === 'confirmed')
  ) {
    return undefined
  }
  const fields = await fetchFields(conference._id).catch((error) => {
    console.error(`Could not read speaker info for ${conference._id}`, error)
    return null
  })
  const briefing = getSpeakerBriefing(
    { ...conference, ...fields },
    {
      proposals,
      speakerId,
      // ponytail: no `ticketState` — the redeemed set is one ~10 s full-event
      // provider fetch, memoized only 30 s per instance.
      travelSupport: travelSupport ?? undefined,
    },
  )
  const today = osloTodayDateString(now)
  const isConferenceDay =
    today >= conference.startDate && today <= conference.endDate
  // Pin the dinner for its whole Oslo day (a late arrival still needs the
  // address); without a valid start time, on the conference days.
  const dinnerAt = Date.parse(briefing.dinner?.startsAt ?? '')
  const pinDinner = Number.isNaN(dinnerAt)
    ? isConferenceDay
    : today === osloTodayDateString(new Date(dinnerAt))
  return {
    briefing,
    conferenceDay: isConferenceDay ? today : undefined,
    pinDinner,
  }
}
