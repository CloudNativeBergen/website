import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { Status, ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'
import type { Conference } from '@/lib/conference/types'

export interface ScheduleData {
  schedules: ConferenceSchedule[]
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
        schedules: [],
        conference: {} as Conference,
        proposals: [],
        error: 'Failed to fetch conference data',
      }
    }

    const schedules: ConferenceSchedule[] = conference.schedules || []

    const conferenceDates = generateConferenceDates(
      conference.startDate,
      conference.endDate,
    )

    const existingDates = new Set(schedules.map((s) => s.date))

    for (const date of conferenceDates) {
      if (!existingDates.has(date)) {
        schedules.push({
          _id: '',
          date: date,
          tracks: [],
        })
      }
    }

    schedules.sort((a, b) => a.date.localeCompare(b.date))

    // Drop "ghost" slots — entries whose talk reference no longer resolves (the
    // proposal was deleted after being scheduled) and which aren't service
    // placeholders. The projection keeps them as `{ talk: null }` with no
    // placeholder; in the editor they render invisibly and can't be removed, and
    // on save the payload validator rejects the whole day ("neither a talk nor a
    // placeholder"), permanently bricking that day. The public read side already
    // filters these out, so stripping them here keeps the write side symmetric.
    for (const schedule of schedules) {
      schedule.tracks = (schedule.tracks || []).map((track) => ({
        ...track,
        talks: (track.talks || []).filter(
          (slot) => slot.talk || slot.placeholder,
        ),
      }))
    }

    const { proposals, proposalsError } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includePreviousAcceptedTalks: true,
    })

    if (proposalsError) {
      return {
        schedules,
        conference,
        proposals: [],
        error: 'Failed to fetch proposals',
      }
    }

    const schedulableProposals = proposals.filter(
      (proposal: ProposalExisting) =>
        proposal.status === Status.accepted ||
        proposal.status === Status.confirmed,
    )

    return {
      schedules,
      conference,
      proposals: schedulableProposals,
    }
  } catch (error) {
    console.error('Error fetching schedule data:', error)
    return {
      schedules: [],
      conference: {} as Conference,
      proposals: [],
      error: 'Internal server error',
    }
  }
}
