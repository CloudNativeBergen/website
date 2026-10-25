import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'
import type { Conference } from '@/lib/conference/types'
import {
  EditorSchedule,
  toEditorSchedule,
  ScheduleStatus,
  type TrackSponsorOption,
} from './types'
import { Status } from '@/lib/proposal/types'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

export interface ScheduleData {
  officialSchedules: EditorSchedule[]
  draftSchedules: EditorSchedule[]
  conference: Conference
  proposals: ProposalExisting[]
  /** The sponsors a track can be given, Track Sponsorship holders first. */
  trackSponsorOptions: TrackSponsorOption[]
  error?: string
}

function generateConferenceDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const dates: string[] = []

  const current = new Date(start)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * The conference's public sponsors (a closed deal with a tier), the ones a
 * room screen can thank alone: Track Sponsorship holders first, then by name.
 */
async function getTrackSponsorOptions(
  conferenceId: string,
): Promise<TrackSponsorOption[]> {
  // Only the picker needs these: a failed read must not take the editor down.
  try {
    const options = await scopedFetch<Partial<TrackSponsorOption>[]>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "sponsorForConference" && status == "closed-won" && defined(tier->_id) && defined(sponsor->_id)]{
        "_id": sponsor->_id,
        "name": sponsor->name,
        "trackAddon": count(addons[@->title match "track*"]) > 0
      }`,
    )
    return (options || [])
      .filter(
        (o): o is TrackSponsorOption =>
          typeof o._id === 'string' && typeof o.name === 'string',
      )
      .sort(
        (a, b) =>
          Number(b.trackAddon) - Number(a.trackAddon) ||
          a.name.localeCompare(b.name),
      )
  } catch (error) {
    console.error('Failed to read the track sponsor options:', error)
    return []
  }
}

export async function getScheduleData(): Promise<ScheduleData> {
  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        schedule: true,
        confirmedTalksOnly: false,
      })

    if (conferenceError || !conference) {
      return {
        officialSchedules: [],
        draftSchedules: [],
        conference: {} as Conference,
        proposals: [],
        trackSponsorOptions: [],
        error: 'Failed to fetch conference data',
      }
    }

    // explicitly query Sanity for all schedules (both drafts and official)
    const rawSchedules = await clientReadUncached.fetch<ConferenceSchedule[]>(
      `*[_type == "schedule" && conference._ref == $conferenceId]{
        _id, _rev, date, status, version, owner,
        tracks[]{
          trackTitle,
          trackDescription,
          sponsor,
          talks[]{
            startTime,
            endTime,
            placeholder,
            "hasTalkRef": defined(talk),
            talk->{
              _id,
              title,
              description,
              format,
              level,
              status,
              audiences,
              topics[]-> {
                _id,
                title,
                color,
                slug,
                description
              },
              speakers[]->{
                _id,
                name,
                "slug": slug.current,
                title,
                "image": coalesce(image.asset->url, imageURL)
              }
            }
          }
        }
      }`,
      { conferenceId: conference._id },
    )

    const officialRaw = rawSchedules.filter(
      (s) => s.status === ScheduleStatus.Official || !s.status,
    ) // Fallback for legacy
    const draftRaw = rawSchedules.filter(
      (s) => s.status === ScheduleStatus.Draft,
    )

    const conferenceDates = generateConferenceDates(
      conference.startDate,
      conference.endDate,
    )

    function fillAndSort(
      list: ConferenceSchedule[],
      defaultStatus: ScheduleStatus,
    ): EditorSchedule[] {
      const conferenceDatesSet = new Set(conferenceDates)
      const copy = list.filter((s) => conferenceDatesSet.has(s.date))
      const existingDates = new Set(copy.map((s) => s.date))
      for (const date of conferenceDates) {
        if (!existingDates.has(date)) {
          copy.push({
            _id: '',
            date: date,
            tracks: [],
            status: defaultStatus,
          })
          existingDates.add(date)
        }
      }
      copy.sort((a, b) => a.date.localeCompare(b.date))
      return copy.map(toEditorSchedule)
    }

    const officialSchedules = fillAndSort(officialRaw, ScheduleStatus.Official)
    const draftSchedules = fillAndSort(draftRaw, ScheduleStatus.Draft)

    const trackSponsorOptions = await getTrackSponsorOptions(conference._id)

    const { proposals, proposalsError } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includePreviousAcceptedTalks: true,
      statuses: [Status.submitted, Status.accepted, Status.confirmed],
    })

    if (proposalsError) {
      return {
        officialSchedules,
        draftSchedules,
        conference,
        proposals: [],
        trackSponsorOptions,
        error: 'Failed to fetch proposals',
      }
    }

    // Return ALL proposals so organizers can draft with unaccepted talks
    return {
      officialSchedules,
      draftSchedules,
      conference,
      proposals: proposals || [],
      trackSponsorOptions,
    }
  } catch (error) {
    console.error('Error fetching schedule data:', error)
    return {
      officialSchedules: [],
      draftSchedules: [],
      conference: {} as Conference,
      proposals: [],
      trackSponsorOptions: [],
      error: 'Internal server error',
    }
  }
}
