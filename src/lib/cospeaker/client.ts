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

/**
 * Send co-speaker invitations to multiple email addresses
 * This function is safe to use in client components
 */
export async function sendInvitations(
  proposalId: string,
  emails: string[],
  isTestMode: boolean = false,
): Promise<{
  success: boolean
  sentEmails: string[]
  invitations: CoSpeakerInvitation[]
  error?: string
}> {
  try {
    const results = []
    const sentEmails = []

    // Send invitations for all emails
    for (const email of emails) {
      const url = new URL(
        COSPEAKER_API_ENDPOINTS.INVITATION_CREATE(proposalId),
        window.location.origin,
      )
      if (isTestMode) {
        url.searchParams.set(COSPEAKER_API_PARAMS.TEST_MODE, 'true')
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteeEmail: email,
          inviteeName: generateNameFromEmail(email),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to send invitation to ${email}`)
      }

      results.push(data.invitation)
      sentEmails.push(email)
    }

    return {
      success: true,
      sentEmails,
      invitations: results,
    }
  } catch (error) {
    return {
      success: false,
      sentEmails: [],
      invitations: [],
      error:
        error instanceof Error ? error.message : 'Failed to send invitation(s)',
    }
  }
}

/**
 * Generate a readable name from an email address
 * Converts email prefix to a proper name format
 */
export function generateNameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * Validate an email address using regex
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Filter and validate email addresses from invite fields
 */
export function getValidEmails(emails: string[]): string[] {
  return emails.filter((email) => email.trim() && validateEmail(email))
}
