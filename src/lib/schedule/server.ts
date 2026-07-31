import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'
import type { Conference } from '@/lib/conference/types'
import { EditorSchedule, toEditorSchedule, ScheduleStatus } from './types'
import { clientReadUncached } from '@/lib/sanity/client'

export interface ScheduleData {
  officialSchedules: EditorSchedule[]
  draftSchedules: EditorSchedule[]
  conference: Conference
  proposals: ProposalExisting[]
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

    const { proposals, proposalsError } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includePreviousAcceptedTalks: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statuses: ['submitted', 'accepted', 'confirmed'] as any,
    })

    if (proposalsError) {
      return {
        officialSchedules,
        draftSchedules,
        conference,
        proposals: [],
        error: 'Failed to fetch proposals',
      }
    }

    // Return ALL proposals so organizers can draft with unaccepted talks
    return {
      officialSchedules,
      draftSchedules,
      conference,
      proposals: proposals || [],
    }
  } catch (error) {
    console.error('Error fetching schedule data:', error)
    return {
      officialSchedules: [],
      draftSchedules: [],
      conference: {} as Conference,
      proposals: [],
      error: 'Internal server error',
    }
  }
}
