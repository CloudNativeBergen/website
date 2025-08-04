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

/**
 * Generate conference dates from start to end date
 */
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
    // Fetch conference with schedule data - use shorter cache for admin
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        schedule: true,
        revalidate: 0, // No cache for schedule admin
      })

    if (conferenceError || !conference) {
      return {
        schedules: [],
        conference: {} as Conference,
        proposals: [],
        error: 'Failed to fetch conference data',
      }
    }

    // Get existing schedules or create default ones for each conference day
    const schedules: ConferenceSchedule[] = conference.schedules || []

    // Generate dates for the conference duration
    const conferenceDates = generateConferenceDates(
      conference.start_date,
      conference.end_date,
    )

    // Ensure we have a schedule for each conference day
    const existingDates = new Set(schedules.map((s) => s.date))

    for (const date of conferenceDates) {
      if (!existingDates.has(date)) {
        // Create default schedule for missing dates
        schedules.push({
          _id: '',
          date: date,
          tracks: [],
        })
      }
    }

    // If we only have one date but need more days, generate additional days
    if (schedules.length === 1 && conferenceDates.length === 1) {
      // If start_date and end_date are the same, create a multi-day conference
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

    // Sort schedules by date
    schedules.sort((a, b) => a.date.localeCompare(b.date))

    // Fetch all proposals for the conference
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

    // Filter for accepted and confirmed proposals (for scheduling)
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
