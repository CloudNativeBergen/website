import { ProposalExisting } from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'

export interface ScheduleResponse {
  status: number
  schedule?: ConferenceSchedule
  error?: { message: string }
}

export interface ConfirmedProposalsResponse {
  status: number
  proposals?: ProposalExisting[]
  error?: { message: string }
}

// Fetch confirmed proposals that can be scheduled
export async function fetchConfirmedProposals(): Promise<ConfirmedProposalsResponse> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/proposal/confirmed`,
      {
        cache: 'no-store',
        next: { revalidate: 0 },
      },
    )

    if (!res.ok) {
      return {
        status: res.status,
        error: { message: 'Failed to fetch confirmed proposals' },
      }
    }

    const data = await res.json()
    return { status: 200, proposals: data.proposals || [] }
  } catch (error) {
    console.error('Error fetching confirmed proposals:', error)
    return { status: 500, error: { message: 'Network error' } }
  }
}

// Fetch current schedule
export async function fetchSchedule(): Promise<ScheduleResponse> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/schedule`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return {
        status: res.status,
        error: { message: 'Failed to fetch schedule' },
      }
    }

    const data = await res.json()
    return { status: 200, schedule: data.schedule }
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return { status: 500, error: { message: 'Network error' } }
  }
}

// Save schedule
export async function saveSchedule(schedule: ConferenceSchedule): Promise<ScheduleResponse> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ schedule }),
      cache: 'no-store',
    })

    if (!res.ok) {
      return {
        status: res.status,
        error: { message: 'Failed to save schedule' },
      }
    }

    const data = await res.json()
    return { status: 200, schedule: data.schedule }
  } catch (error) {
    console.error('Error saving schedule:', error)
    return { status: 500, error: { message: 'Network error' } }
  }
}
