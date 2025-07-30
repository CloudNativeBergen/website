import { resend, EMAIL_CONFIG, retryWithBackoff } from '@/lib/email/config'
import React from 'react'
import crypto from 'crypto'
import { clientWrite } from '@/lib/sanity/client'
import {
  InvitationTokenPayload,
  CoSpeakerInvitation,
  InvitationStatus,
} from './types'
import { CoSpeakerInvitationTemplate } from '@/components/email/CoSpeakerInvitationTemplate'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'

// Token secret - in production this should be in env vars
const TOKEN_SECRET =
  process.env.INVITATION_TOKEN_SECRET || 'invitation-token-secret-key'

export interface SendEmailParams<T = Record<string, unknown>> {
  to: string
  subject: string
  component: React.ComponentType<T>
  props: T
}

export interface SendEmailResponse {
  success: boolean
  emailId?: string
  error?: string
}

/**
 * Send an email with retry logic and error handling
 * This function should only be used in server-side code (API routes, server components)
 */
export async function sendEmail<T = Record<string, unknown>>({
  to,
  subject,
  component: Component,
  props,
}: SendEmailParams<T>): Promise<SendEmailResponse> {
  try {
    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: EMAIL_CONFIG.RESEND_FROM_EMAIL,
        to: [to],
        subject,
        react: React.createElement(
          Component as React.ComponentType<Record<string, unknown>>,
          props as Record<string, unknown>,
        ),
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      success: true,
      emailId: emailResult.data?.id,
    }
  } catch (error) {
    console.error('Error sending email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Create a signed token for invitation
 */
export function createInvitationToken(payload: InvitationTokenPayload): string {
  const data = JSON.stringify(payload)
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url')

  // Encode payload as base64url
  const encodedPayload = Buffer.from(data).toString('base64url')

  return `${encodedPayload}.${signature}`
}

/**
 * Verify and decode an invitation token
 */
export function verifyInvitationToken(
  token: string,
): InvitationTokenPayload | null {
  try {
    const [encodedPayload, signature] = token.split('.')

    if (!encodedPayload || !signature) {
      return null
    }

    // Decode payload
    const data = Buffer.from(encodedPayload, 'base64url').toString()

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('base64url')

    if (signature !== expectedSignature) {
      return null
    }

    const payload = JSON.parse(data) as InvitationTokenPayload

    // Check expiration
    if (payload.expiresAt < Date.now()) {
      return null
    }

    return payload
  } catch (error) {
    console.error('Error verifying invitation token:', error)
    return null
  }
}

interface InvitationUpdateData {
  status: 'accepted' | 'declined'
  respondedAt: string
  acceptedSpeakerId?: string
}

/**
 * Update invitation status in Sanity
 */
export async function updateInvitationStatus(
  invitationId: string,
  status: 'accepted' | 'declined',
  acceptedSpeakerId?: string,
): Promise<unknown> {
  try {
    const update: InvitationUpdateData = {
      status,
      respondedAt: new Date().toISOString(),
    }

    if (acceptedSpeakerId) {
      update.acceptedSpeakerId = acceptedSpeakerId
    }

    const result = await clientWrite.patch(invitationId).set(update).commit()

    return result
  } catch (error) {
    console.error('Error updating invitation status:', error)
    throw error
  }
}

/**
 * Create a co-speaker invitation in Sanity
 */
export async function createCoSpeakerInvitation(params: {
  inviterEmail: string
  inviterName: string
  inviteeEmail: string
  inviteeName: string
  proposalId: string
  proposalTitle: string
}): Promise<CoSpeakerInvitation | null> {
  try {
    // Create expiration date (14 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    // Create the invitation document
    const invitation = await clientWrite.create({
      _type: 'coSpeakerInvitation',
      inviterEmail: params.inviterEmail,
      inviterName: params.inviterName,
      inviteeEmail: params.inviteeEmail,
      inviteeName: params.inviteeName,
      proposal: {
        _type: 'reference',
        _ref: params.proposalId,
      },
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
    })

    // Map the Sanity document to the CoSpeakerInvitation type
    const mappedInvitation: CoSpeakerInvitation = {
      _id: invitation._id,
      inviterEmail: invitation.inviterEmail,
      inviterName: invitation.inviterName,
      inviteeEmail: invitation.inviteeEmail,
      inviteeName: invitation.inviteeName,
      proposalId: params.proposalId,
      proposalTitle: params.proposalTitle,
      status: invitation.status as InvitationStatus,
      token: '', // Token is generated when sending the email
      expiresAt: invitation.expiresAt,
      createdAt: invitation._createdAt || new Date().toISOString(),
    }

    return mappedInvitation
  } catch (error) {
    console.error('Error creating co-speaker invitation:', error)
    return null
  }
}

/**
 * Send a co-speaker invitation email
 */
export async function sendInvitationEmail(
  invitation: CoSpeakerInvitation,
): Promise<boolean> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Create the invitation token
    const tokenPayload: InvitationTokenPayload = {
      invitationId: invitation._id,
      inviteeEmail: invitation.inviteeEmail,
      proposalId: invitation.proposalId,
      expiresAt: new Date(invitation.expiresAt).getTime(),
    }

    const token = createInvitationToken(tokenPayload)
    const invitationUrl = `${baseUrl}/invitation/respond?token=${token}`

    // Fetch conference data for the current domain
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()
    if (conferenceError || !conference) {
      console.error('Error fetching conference data:', conferenceError)
      // Fallback to defaults if conference data is not available
    }

    // TODO: Fetch proposal details when we can do so without speakerId
    // For now, we'll use the default message
    const proposalAbstract =
      'Please view the full proposal details for more information.'

    // Use conference data for event details
    const eventName = conference?.title || 'Cloud Native Bergen'
    const eventLocation = conference?.city
      ? `${conference.city}, ${conference.country || 'Norway'}`
      : 'Bergen, Norway'
    const eventDate = conference?.start_date
      ? formatDate(conference.start_date)
      : 'TBD'
    const eventUrl =
      conference && conference.domains?.[0]
        ? `https://${conference.domains[0]}`
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Send the email
    const result = await sendEmail({
      to: invitation.inviteeEmail,
      subject: `You've been invited to co-present "${invitation.proposalTitle || 'a proposal'}"`,
      component: CoSpeakerInvitationTemplate,
      props: {
        inviterName: invitation.inviterName,
        inviterEmail: invitation.inviterEmail,
        inviteeName: invitation.inviteeName || 'Guest',
        proposalTitle: invitation.proposalTitle || 'Untitled Proposal',
        proposalAbstract,
        invitationUrl,
        eventName,
        eventLocation,
        eventDate,
        eventUrl,
        expiresAt: new Date(invitation.expiresAt).toLocaleDateString(),
        socialLinks: conference?.social_links || [],
      },
    })

    return result.success
  } catch (error) {
    console.error('Error sending invitation email:', error)
    return false
  }
}
