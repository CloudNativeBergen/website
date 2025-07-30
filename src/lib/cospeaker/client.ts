'use client'

import { CoSpeakerInvitation } from './types'
import { COSPEAKER_API_ENDPOINTS, COSPEAKER_API_PARAMS } from './constants'

/**
 * Generic API fetch helper that handles common patterns
 * @param url - The URL to fetch
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns The parsed JSON response
 * @throws Error if the response is not ok
 */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      errorData.error ||
        errorData.message ||
        `Request failed: ${response.statusText}`,
    )
  }

  return response.json()
}

/**
 * Fetch invitations for a proposal through the API route
 * This function is safe to use in client components
 */
export async function fetchInvitationsForProposal(
  proposalId: string,
  isTestMode: boolean = false,
): Promise<CoSpeakerInvitation[]> {
  try {
    const url = new URL(
      COSPEAKER_API_ENDPOINTS.INVITATIONS,
      window.location.origin,
    )
    url.searchParams.set(COSPEAKER_API_PARAMS.PROPOSAL_ID, proposalId)
    if (isTestMode) {
      url.searchParams.set(COSPEAKER_API_PARAMS.TEST_MODE, 'true')
    }

    const data = await apiFetch<{ invitations: CoSpeakerInvitation[] }>(
      url.toString(),
    )
    return data.invitations || []
  } catch (error) {
    console.error('[fetchInvitationsForProposal] Error:', error)
    return []
  }
}

/**
 * Fetch invitations for multiple proposals through the API route
 * This function is safe to use in client components
 */
export async function fetchInvitationsForProposals(
  proposalIds: string[],
  isTestMode: boolean = false,
): Promise<Record<string, CoSpeakerInvitation[]>> {
  try {
    if (!proposalIds.length) return {}

    const url = new URL(
      COSPEAKER_API_ENDPOINTS.INVITATIONS,
      window.location.origin,
    )
    url.searchParams.set(
      COSPEAKER_API_PARAMS.PROPOSAL_IDS,
      proposalIds.join(','),
    )
    if (isTestMode) {
      url.searchParams.set(COSPEAKER_API_PARAMS.TEST_MODE, 'true')
    }

    const data = await apiFetch<{
      invitationsByProposal: Record<string, CoSpeakerInvitation[]>
    }>(url.toString())
    return data.invitationsByProposal || {}
  } catch (error) {
    console.error('[fetchInvitationsForProposals] Error:', error)
    return {}
  }
}

/**
 * Respond to a co-speaker invitation
 * This function is safe to use in client components
 */
export async function respondToInvitation(
  token: string,
  response: 'accept' | 'decline',
  isTestMode: boolean = false,
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    const url = new URL(
      COSPEAKER_API_ENDPOINTS.INVITATION_RESPOND,
      window.location.origin,
    )
    if (isTestMode) {
      url.searchParams.set(COSPEAKER_API_PARAMS.TEST_MODE, 'true')
    }

    const data = await apiFetch<{ message: string }>(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, action: response }),
    })

    return {
      success: true,
      message: data.message,
    }
  } catch (error) {
    console.error('[respondToInvitation] Error:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to respond to invitation',
    }
  }
}

/**
 * Cancel a pending co-speaker invitation
 * This function is safe to use in client components
 */
export async function cancelInvitation(
  proposalId: string,
  invitationId: string,
  isTestMode: boolean = false,
): Promise<void> {
  const url = new URL(
    COSPEAKER_API_ENDPOINTS.INVITATION_DELETE(proposalId),
    window.location.origin,
  )
  if (isTestMode) {
    url.searchParams.set(COSPEAKER_API_PARAMS.TEST_MODE, 'true')
  }

  await apiFetch(url.toString(), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationId }),
  })
}
