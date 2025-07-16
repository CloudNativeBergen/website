import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/sanity'
import { Status, ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'

export interface ScheduleData {
  schedule: ConferenceSchedule | null
  proposals: ProposalExisting[]
  error?: string
}

export async function getScheduleData(): Promise<ScheduleData> {
  try {
    // Fetch conference with schedule data
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        schedule: true,
      })

    if (conferenceError || !conference) {
      return {
        schedule: null,
        proposals: [],
        error: 'Failed to fetch conference data',
      }
    }

    // Get the current schedule or create a default one
    let schedule: ConferenceSchedule | null = conference.schedules?.[0] || null

    // If no schedule exists, create a default one with the conference start date
    if (!schedule && conference.start_date) {
      schedule = {
        _id: '',
        date: conference.start_date,
        tracks: [],
      }
    }

    // Fetch all proposals for the conference
    const { proposals, proposalsError } = await getProposals({
      conferenceId: conference._id,
      returnAll: true,
      includePreviousAcceptedTalks: true,
    })

    if (proposalsError) {
      return {
        schedule,
        proposals: [],
        error: 'Failed to fetch proposals',
      }
    }

    // Filter for confirmed proposals only
    const confirmedProposals = proposals.filter(
      (proposal: ProposalExisting) => proposal.status === Status.confirmed,
    )

    return {
      schedule,
      proposals: confirmedProposals,
    }
  } catch (error) {
    console.error('Error fetching schedule data:', error)
    return {
      schedule: null,
      proposals: [],
      error: 'Internal server error',
    }
  }
}
