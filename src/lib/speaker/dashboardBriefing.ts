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
import { resolveDinnerChoice } from '@/lib/speaker/dinnerChoice'
import { isOrganizerForOrg, type OrganizerSpeaker } from '@/lib/authz/organizer'

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

/** Days after the last conference day that the thank-you block stays. */
export const THANK_YOU_DAYS = 60

/** One of the speaker's confirmed talks, for the after-event thank-you. */
export interface ThankYouTalk {
  proposalId: string
  title: string
  video?: string
  hasSlides: boolean
}

/** A YYYY-MM-DD calendar date moved by whole days. */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

export async function loadDashboardBriefing({
  conference,
  currentConferenceId,
  isOver,
  proposals,
  speakerId,
  organizer,
  travelSupport,
  fetchFields,
  fetchDinnerChoice,
  now = new Date(),
}: {
  conference: Conference
  currentConferenceId?: string
  isOver: boolean
  proposals: ProposalExisting[]
  speakerId: string
  /** The signed-in speaker; an organizer of the edition's org sees it too. */
  organizer?: OrganizerSpeaker | null
  travelSupport?: SpeakerBriefingData['travelSupport'] | null
  /** The live (uncached) read of the conference's speaker fields. */
  fetchFields: (conferenceId: string) => Promise<BriefingFields | null>
  /** The speaker's stored dinner route (#1592, phase 5). */
  fetchDinnerChoice?: (conferenceId: string) => Promise<string | null>
  now?: Date
}): Promise<
  | {
      thankYou: ThankYouTalk[]
      briefing?: never
      pinDinner?: never
      dinnerChoice?: never
      asOrganizer?: never
    }
  | {
      briefing: SpeakerBriefing
      conferenceDay?: string
      /** Today is the day before the conference: pin the talks and dinner. */
      dayBefore?: boolean
      /** When the speaker ticket was emailed (no address: personal data). */
      ticketSentAt?: string
      pinDinner: boolean
      dinnerChoice?: string | null
      /** Shown because the speaker organizes the edition, not for a talk. */
      asOrganizer?: boolean
    }
  | undefined
> {
  // This host's edition only, for a speaker with a confirmed talk or an
  // organizer of its org, until the conference is over.
  const confirmed = proposals.filter((p) => p.status === 'confirmed')
  const hasTalk = confirmed.length > 0
  const today = osloTodayDateString(now)
  // After the event: a short thank-you instead, for THANK_YOU_DAYS.
  if (
    isOver &&
    hasTalk &&
    conference._id === currentConferenceId &&
    !!conference.endDate &&
    today <= addDays(conference.endDate, THANK_YOU_DAYS)
  ) {
    return {
      thankYou: confirmed.map((p) => ({
        proposalId: p._id,
        title: p.title,
        ...(p.video && { video: p.video }),
        hasSlides: !!p.attachments?.some((a) => a.attachmentType === 'slides'),
      })),
    }
  }
  const asOrganizer =
    !hasTalk &&
    isOrganizerForOrg(organizer, conference.organization?._ref ?? null)
  if (
    conference._id !== currentConferenceId ||
    isOver ||
    (!hasTalk && !asOrganizer)
  ) {
    return undefined
  }
  const fields = await fetchFields(conference._id).catch((error) => {
    console.error(`Could not read speaker info for ${conference._id}`, error)
    return null
  })
  // An organizer without a talk gets the shared sections only.
  const briefing = getSpeakerBriefing(
    { ...conference, ...fields },
    asOrganizer
      ? undefined
      : {
          proposals,
          speakerId,
          // ponytail: no `ticketState` — the redeemed set is one ~10 s full-event
          // provider fetch, memoized only 30 s per instance.
          travelSupport: travelSupport ?? undefined,
        },
  )
  const isConferenceDay =
    today >= conference.startDate && today <= conference.endDate
  const dayBefore =
    !!conference.startDate && today === addDays(conference.startDate, -1)
  // Pin the dinner for its whole Oslo day (a late arrival still needs the
  // address); without a valid start time, on the conference days. The day
  // before, also a dinner on the first day.
  const dinnerAt = Date.parse(briefing.dinner?.startsAt ?? '')
  const dinnerDay = Number.isNaN(dinnerAt)
    ? undefined
    : osloTodayDateString(new Date(dinnerAt))
  const pinDinner = dinnerDay
    ? today === dinnerDay || (dayBefore && dinnerDay === conference.startDate)
    : isConferenceDay
  // The latest ticket email to this speaker, from any of their talks.
  const ticketSentAt = asOrganizer
    ? undefined
    : confirmed
        .flatMap((p) => p.issuedSpeakerTickets ?? [])
        .filter((t) => t.speakerId === speakerId && t.emailedAt)
        .map((t) => t.emailedAt)
        .sort()
        .at(-1)
  // Only with routes to choose from, and never for an organizer without a
  // talk: setDinnerChoice requires a confirmed talk. A failed read hides the picker rather
  // than showing an unanswered one that would overwrite a stored choice.
  const routes = briefing.dinner?.routes
  const dinnerChoice =
    routes && fetchDinnerChoice && !asOrganizer
      ? await fetchDinnerChoice(conference._id).then(
          (stored) => resolveDinnerChoice(stored, routes),
          (error) => {
            console.error(
              `Could not read dinner choice for ${conference._id}`,
              error,
            )
            return undefined
          },
        )
      : undefined
  return {
    briefing,
    dinnerChoice,
    conferenceDay: isConferenceDay ? today : undefined,
    pinDinner,
    ...(dayBefore && { dayBefore }),
    ...(ticketSentAt && { ticketSentAt }),
    ...(asOrganizer && { asOrganizer }),
  }
}
