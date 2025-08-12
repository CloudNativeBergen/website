import { ConferenceSponsorInput, ConferenceSponsorResponse } from './types'

// Conference sponsor assignment functions - Used by email functionality
export async function addSponsorToConference(
  data: ConferenceSponsorInput,
): Promise<void> {
  const response = await fetch('/admin/api/sponsor/conference', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result: ConferenceSponsorResponse = await response.json()

  if (!response.ok) {
    throw new Error(
      result.error?.message || 'Failed to add sponsor to conference',
    )
  }
}

export async function removeSponsorFromConference(
  sponsorId: string,
): Promise<void> {
  const response = await fetch(
    `/admin/api/sponsor/conference?sponsorId=${sponsorId}`,
    {
      method: 'DELETE',
    },
  )

  const result: ConferenceSponsorResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to remove sponsor')
  }
}
