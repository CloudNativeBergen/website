import { resend, retryWithBackoff } from '@/lib/email/config'
import React from 'react'
import crypto from 'crypto'
import { clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import {
  InvitationTokenPayload,
  CoSpeakerInvitationFull,
  InvitationStatus,
} from './types'
import { INVITATION_VALID_DAYS } from './constants'
import { getProposalAbstract } from './sanity'
import { CoSpeakerInvitationTemplate } from '@/components/email/CoSpeakerInvitationTemplate'
import { CoSpeakerResponseTemplate } from '@/components/email/CoSpeakerResponseTemplate'
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

/**
 * Builds the shared event-related email template context (protocol,
 * event name/location/date/url) from the current conference and domain.
 */
function buildEmailEventContext(
  conference: {
    title?: string
    city?: string
    country?: string
    startDate?: string
    domains?: string[]
  },
  domain: string,
): {
  protocol: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
} {
  return {
    protocol: domain.includes('localhost') ? 'http://' : 'https://',
    eventName: conference.title || 'Cloud Native Days',
    eventLocation: conference.city
      ? `${conference.city}, ${conference.country || 'Norway'}`
      : 'Location TBA',
    eventDate: conference.startDate ? formatDate(conference.startDate) : 'TBD',
    eventUrl: conference.domains?.[0]
      ? `https://${conference.domains[0]}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
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
    expiresAt.setDate(expiresAt.getDate() + INVITATION_VALID_DAYS)

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

const FALLBACK_PROPOSAL_ABSTRACT =
  'Please view the full proposal details for more information.'

export const ABSTRACT_MAX_LENGTH = 500

/**
 * Truncates a plain-text abstract for inclusion in an email. Abstracts
 * longer than maxLength are cut at the last word boundary before the
 * limit, trailing punctuation is stripped, and an ellipsis is appended.
 *
 * Exported for testing.
 */
export function truncateAbstract(
  abstract: string,
  maxLength: number = ABSTRACT_MAX_LENGTH,
): string {
  const normalized = abstract.trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  const slice = normalized.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : slice

  return `${truncated.replace(/[\s.,;:!?-]+$/, '')}…`
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
    if (conferenceError || !conference || !domain) {
      console.error(
        'Cannot send invitation email: failed to resolve conference or domain for current request',
        conferenceError,
      )
      return false
    }

    const { protocol, eventName, eventLocation, eventDate, eventUrl } =
      buildEmailEventContext(conference, domain)
    const invitationUrl = `${protocol}${domain}/invitation/respond?token=${token}${AppEnvironment.isTestMode ? '&test=true' : ''}`

    const proposalId =
      typeof invitation.proposal === 'object' && invitation.proposal !== null
        ? '_id' in invitation.proposal
          ? invitation.proposal._id
          : invitation.proposal._ref
        : undefined

    let abstract: string | null = null
    if (proposalId) {
      try {
        abstract = await getProposalAbstract(proposalId)
      } catch (error) {
        // The email must never fail to send because of the abstract fetch.
        console.error(
          'Failed to fetch proposal abstract for invitation email:',
          error,
        )
      }
    }

    const proposalAbstract = abstract
      ? truncateAbstract(abstract)
      : FALLBACK_PROPOSAL_ABSTRACT

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

export async function sendResponseNotificationEmail(params: {
  invitation: CoSpeakerInvitationFull
  respondentName: string
  respondentEmail: string
  accepted: boolean
  declineReason?: string
}): Promise<boolean> {
  const { invitation, respondentName, respondentEmail, accepted } = params

  try {
    const inviterName =
      typeof invitation.invitedBy === 'object' &&
      invitation.invitedBy !== null &&
      'name' in invitation.invitedBy
        ? invitation.invitedBy.name
        : undefined

    const inviterEmail =
      typeof invitation.invitedBy === 'object' &&
      invitation.invitedBy !== null &&
      'email' in invitation.invitedBy
        ? invitation.invitedBy.email
        : undefined

    if (!inviterEmail) {
      console.error(
        'Cannot send co-speaker response notification: inviter email missing on invitation',
        invitation._id,
      )
      return false
    }

    const {
      conference,
      domain,
      error: conferenceError,
    } = await getConferenceForCurrentDomain()
    if (conferenceError || !conference || !domain) {
      console.error(
        'Cannot send co-speaker response notification: failed to resolve conference or domain for current request',
        conferenceError,
      )
      return false
    }

    const proposalId =
      typeof invitation.proposal === 'object' &&
      invitation.proposal !== null &&
      '_id' in invitation.proposal
        ? invitation.proposal._id
        : undefined

    const proposalTitle =
      typeof invitation.proposal === 'object' &&
      invitation.proposal !== null &&
      'title' in invitation.proposal &&
      invitation.proposal.title
        ? invitation.proposal.title
        : 'your proposal'

    const { protocol, eventName, eventLocation, eventDate, eventUrl } =
      buildEmailEventContext(conference, domain)
    const proposalUrl = proposalId
      ? `${protocol}${domain}/cfp/proposal/${proposalId}`
      : `${protocol}${domain}/cfp/list`

    const subject = accepted
      ? `${respondentName} accepted your co-speaker invitation for "${proposalTitle}"`
      : `${respondentName} declined your co-speaker invitation for "${proposalTitle}"`

    if (AppEnvironment.isTestMode) {
      console.log('[TEST MODE] Would send co-speaker response notification:')
      console.log('To:', inviterEmail)
      console.log('Subject:', subject)
      return true
    }

    const result = await sendEmail({
      to: inviterEmail,
      subject,
      from: `${conference.organizer} <${conference.cfpEmail}>`,
      component: CoSpeakerResponseTemplate,
      props: {
        inviterName: inviterName || 'there',
        respondentName,
        respondentEmail,
        proposalTitle,
        proposalUrl,
        eventName,
        eventLocation,
        eventDate,
        eventUrl,
        accepted,
        declineReason: params.declineReason,
        socialLinks: conference.socialLinks || [],
      },
    })

    return result.success
  } catch (error) {
    console.error('Error sending co-speaker response notification:', error)
    return false
  }
}
