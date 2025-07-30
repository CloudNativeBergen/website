'use client'

import { CoSpeakerInvitation } from './types'
import { COSPEAKER_API_ENDPOINTS, COSPEAKER_API_PARAMS } from './constants'
import { AppEnvironment } from '@/lib/environment'

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

export async function respondToInvitation(
  token: string,
  response: 'accept' | 'decline',
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    const url = AppEnvironment.buildApiUrl(
      COSPEAKER_API_ENDPOINTS.INVITATION_RESPOND,
    )

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

export async function cancelInvitation(
  proposalId: string,
  invitationId: string,
): Promise<void> {
  const url = AppEnvironment.buildApiUrl(
    COSPEAKER_API_ENDPOINTS.INVITATION_DELETE(proposalId),
  )

  await apiFetch(url.toString(), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationId }),
  })
}

export async function sendInvitations(
  proposalId: string,
  emails: string[],
): Promise<{
  success: boolean
  sentEmails: string[]
  invitations: CoSpeakerInvitation[]
  error?: string
}> {
  try {
    const results = []
    const sentEmails = []

    for (const email of emails) {
      const url = AppEnvironment.buildApiUrl(
        COSPEAKER_API_ENDPOINTS.INVITATION_CREATE(proposalId),
      )

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

export function generateNameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function getValidEmails(emails: string[]): string[] {
  return emails.filter((email) => email.trim() && validateEmail(email))
}
