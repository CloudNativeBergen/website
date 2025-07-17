import { ConferenceSchedule } from '@/lib/conference/types'

export interface ScheduleResponse {
  status: number
  schedule?: ConferenceSchedule
  error?: { message: string }
}

// Save schedule
export async function saveSchedule(
  schedule: ConferenceSchedule,
): Promise<ScheduleResponse> {
  try {
    const res = await fetch(`/admin/api/schedule`, {
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
