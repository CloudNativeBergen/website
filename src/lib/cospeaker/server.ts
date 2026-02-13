import { resend, retryWithBackoff } from '@/lib/email/config'
import React from 'react'
import crypto from 'crypto'
import { clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import type { Reference } from '@sanity/types'
import {
  InvitationTokenPayload,
  CoSpeakerInvitationFull,
  InvitationStatus,
} from './types'
import { CoSpeakerInvitationTemplate } from '@/components/email/CoSpeakerInvitationTemplate'
import { AppEnvironment } from '@/lib/environment'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'

const TOKEN_SECRET = process.env.INVITATION_TOKEN_SECRET

if (!TOKEN_SECRET) {
  throw new Error(
    'INVITATION_TOKEN_SECRET environment variable is not set. ' +
      'Please set this environment variable to a secure random value.',
  )
}

const SECURE_TOKEN_SECRET = TOKEN_SECRET

export interface SendEmailParams<T = Record<string, unknown>> {
  to: string
  subject: string
  component: React.ComponentType<T>
  props: T
  from: string
}

export interface SendEmailResponse {
  success: boolean
  emailId?: string
  error?: string
}

export async function sendEmail<T = Record<string, unknown>>({
  to,
  subject,
  component: Component,
  props,
  from,
}: SendEmailParams<T>): Promise<SendEmailResponse> {
  try {
    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: from,
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

export function createInvitationToken(payload: InvitationTokenPayload): string {
  const data = JSON.stringify(payload)
  const signature = crypto
    .createHmac('sha256', SECURE_TOKEN_SECRET)
    .update(data)
    .digest('base64url')

  const encodedPayload = Buffer.from(data).toString('base64url')

  return `${encodedPayload}.${signature}`
}

interface InvitationUpdateData {
  status: 'accepted' | 'declined'
  respondedAt: string
  acceptedSpeaker?: Reference
}

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
      update.acceptedSpeaker = createReference(acceptedSpeakerId)
    }

    const result = await clientWrite.patch(invitationId).set(update).commit()

    return result
  } catch (error) {
    console.error('Error updating invitation status:', error)
    throw error
  }
}

export async function createCoSpeakerInvitation(params: {
  invitedByEmail: string
  invitedByName: string
  invitedEmail: string
  invitedName?: string
  proposalId: string
  proposalTitle: string
  invitedBySpeakerId: string
  conferenceId: string
}): Promise<CoSpeakerInvitationFull | null> {
  try {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    const tokenPayload: InvitationTokenPayload = {
      invitationId: '',
      invitedEmail: params.invitedEmail,
      proposalId: params.proposalId,
      expiresAt: expiresAt.getTime(),
    }

    const invitation = await clientWrite.create({
      _type: 'coSpeakerInvitation',
      proposal: createReference(params.proposalId),
      conference: createReference(params.conferenceId),
      invitedBy: createReference(params.invitedBySpeakerId),
      invitedEmail: params.invitedEmail,
      invitedName: params.invitedName,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    })

    tokenPayload.invitationId = invitation._id
    const token = AppEnvironment.isTestMode
      ? `test-${invitation._id}`
      : createInvitationToken(tokenPayload)

    const updatedInvitation = await clientWrite
      .patch(invitation._id)
      .set({ token })
      .commit()

    const fullInvitation: CoSpeakerInvitationFull = {
      _id: updatedInvitation._id,
      invitedEmail: updatedInvitation.invitedEmail,
      invitedName: updatedInvitation.invitedName,
      status: updatedInvitation.status as InvitationStatus,
      token: updatedInvitation.token,
      expiresAt: updatedInvitation.expiresAt,
      createdAt: updatedInvitation.createdAt,
      _createdAt: updatedInvitation._createdAt,
      _updatedAt: updatedInvitation._updatedAt,
      proposal: {
        _id: params.proposalId,
        title: params.proposalTitle,
      },
      invitedBy: {
        _id: params.invitedBySpeakerId,
        name: params.invitedByName,
        email: params.invitedByEmail,
      },
    }

    return fullInvitation
  } catch (error) {
    console.error('Error creating co-speaker invitation:', error)
    return null
  }
}

export async function sendInvitationEmail(
  invitation: CoSpeakerInvitationFull,
): Promise<boolean> {
  try {
    const token = invitation.token
    if (!token) {
      console.error('No token found in invitation:', invitation._id)
      return false
    }

    const {
      conference,
      domain,
      error: conferenceError,
    } = await getConferenceForCurrentDomain()
    if (conferenceError || !conference) {
      console.error('Error fetching conference data:', conferenceError)
    }
    const invitationUrl = `${domain}/invitation/respond?token=${token}${AppEnvironment.isTestMode ? '&test=true' : ''}`

    // TODO: Fetch proposal details when we can do so without speakerId

    const proposalAbstract =
      'Please view the full proposal details for more information.'

    const eventName = conference?.title || 'Cloud Native Days'
    const eventLocation = conference?.city
      ? `${conference.city}, ${conference.country || 'Norway'}`
      : 'Location TBA'
    const eventDate = conference?.startDate
      ? formatDate(conference.startDate)
      : 'TBD'
    const eventUrl =
      conference && conference.domains?.[0]
        ? `https://${conference.domains[0]}`
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const proposalTitle =
      typeof invitation.proposal === 'object' && 'title' in invitation.proposal
        ? invitation.proposal.title
        : 'a proposal'

    const inviterName =
      typeof invitation.invitedBy === 'object' && 'name' in invitation.invitedBy
        ? invitation.invitedBy.name
        : 'Someone'

    const inviterEmail =
      typeof invitation.invitedBy === 'object' &&
      'email' in invitation.invitedBy
        ? invitation.invitedBy.email
        : ''

    if (AppEnvironment.isTestMode) {
      console.log('[TEST MODE] Would send co-speaker invitation email:')
      console.log('To:', invitation.invitedEmail)
      console.log(
        'Subject:',
        `You've been invited to co-present \"${proposalTitle}\"`,
      )
      console.log('Invitation URL:', invitationUrl)
      console.log('Token:', token)
      return true
    }

    const result = await sendEmail({
      to: invitation.invitedEmail,
      subject: `You've been invited to co-present "${proposalTitle}"`,
      from: `${conference.organizer} <${conference.cfpEmail}>`,
      component: CoSpeakerInvitationTemplate,
      props: {
        inviterName,
        inviterEmail,
        inviteeName: invitation.invitedName || 'Guest',
        proposalTitle: proposalTitle || 'Untitled Proposal',
        proposalAbstract,
        invitationUrl,
        eventName,
        eventLocation,
        eventDate,
        eventUrl,
        expiresAt: new Date(invitation.expiresAt).toLocaleDateString(),
        socialLinks: conference?.socialLinks || [],
      },
    })

    return result.success
  } catch (error) {
    console.error('Error sending invitation email:', error)
    return false
  }
}
