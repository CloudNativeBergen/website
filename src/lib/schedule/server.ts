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
        revalidate: 0,
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
      conference.start_date,
      conference.end_date,
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

    if (schedules.length === 1 && conferenceDates.length === 1) {
      const baseDate = new Date(schedules[0].date)
      const secondDay = new Date(baseDate)
      secondDay.setDate(secondDay.getDate() + 1)

      schedules.push({
        _id: '',
        date: secondDay.toISOString().split('T')[0],
        tracks: [],
      })

      console.log(
        'Added second day schedule:',
        secondDay.toISOString().split('T')[0],
      )
    }

    schedules.sort((a, b) => a.date.localeCompare(b.date))

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
