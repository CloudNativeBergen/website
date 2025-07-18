import { NextAuthRequest, auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/sanity'
import { proposalResponseError } from '@/lib/proposal/server'
import { NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { CoSpeakerInvitation, CoSpeakerInvitationStatus, Format } from '@/lib/proposal/types'
import { getSpeaker, findSpeakerByEmail } from '@/lib/speaker/sanity'
import { v4 as randomUUID } from 'uuid'
// TODO: Implement email functionality
// For now, we'll log email actions
const sendEmail = async (params: { to: string; subject: string; html: string }) => {
  console.log('Email would be sent:', params)
  // In production, this would integrate with an email service
}
import { Reference } from 'sanity'
import { Speaker } from '@/lib/speaker/types'
import { isValidEmail, normalizeEmail } from '@/lib/proposal/validation'

export const dynamic = 'force-dynamic'

// Helper function to get ID from speaker or reference
function getSpeakerId(speaker: Speaker | Reference | undefined): string | undefined {
  if (!speaker) return undefined
  if ('_id' in speaker) return speaker._id
  if ('_ref' in speaker) return speaker._ref
  return undefined
}

// POST to send a co-speaker invitation via email
export const POST = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    const { id } = await context.params

    if (
      !req.auth ||
      !req.auth.user ||
      !req.auth.speaker ||
      !req.auth.speaker._id ||
      !req.auth.account
    ) {
      return proposalResponseError({
        message: 'Unauthorized',
        type: 'authentication',
        status: 401,
      })
    }

    const { email, name, message } = await req.json()

    if (!email || !isValidEmail(email)) {
      return proposalResponseError({
        message: 'Valid email address is required',
        type: 'validation',
        status: 400,
      })
    }

    if (!name || !name.trim()) {
      return proposalResponseError({
        message: 'Name is required',
        type: 'validation',
        status: 400,
      })
    }

    const normalizedEmail = normalizeEmail(email)

    const { proposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: req.auth.speaker._id,
      isOrganizer: req.auth.speaker.is_organizer,
    })

    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!proposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    // Only the primary speaker can send invitations
    const proposalSpeakerId = getSpeakerId(proposal.speaker)
    if (proposalSpeakerId !== req.auth.speaker._id) {
      return proposalResponseError({
        message: 'Only the primary speaker can send co-speaker invitations',
        type: 'authentication',
        status: 403,
      })
    }

    // Check if proposal format allows co-speakers
    if (proposal.format === Format.lightning_10) {
      return proposalResponseError({
        message: 'Lightning talks (10 min) cannot have co-speakers',
        type: 'validation',
        status: 400,
      })
    }

    // Check if email belongs to the primary speaker
    if (normalizedEmail === req.auth.user.email) {
      return proposalResponseError({
        message: 'Cannot invite yourself as a co-speaker',
        type: 'validation',
        status: 400,
      })
    }

    // Check if email is already invited or is already a co-speaker
    const existingInvitations = proposal.coSpeakerInvitations || []
    const pendingInvitation = existingInvitations.find(
      inv => inv.email === normalizedEmail && inv.status === CoSpeakerInvitationStatus.pending
    )

    if (pendingInvitation) {
      return proposalResponseError({
        message: 'An invitation has already been sent to this email',
        type: 'validation',
        status: 400,
      })
    }

    // Check if the email belongs to an existing speaker who is already a co-speaker
    const { speaker: existingSpeaker } = await findSpeakerByEmail(normalizedEmail)
    if (existingSpeaker) {
      const existingCoSpeakers = proposal.coSpeakers || []
      const isAlreadyCoSpeaker = existingCoSpeakers.some(s => {
        const coSpeakerId = getSpeakerId(s)
        return coSpeakerId === existingSpeaker._id
      })

      if (isAlreadyCoSpeaker) {
        return proposalResponseError({
          message: 'This speaker is already a co-speaker on this proposal',
          type: 'validation',
          status: 400,
        })
      }
    }

    try {
      // Generate invitation token
      const token = randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 14) // 14 days from now
      
      const invitation: CoSpeakerInvitation = {
        email: normalizedEmail,
        name: existingSpeaker?.name || name.trim(), // Use existing speaker name if available, otherwise use provided name
        status: CoSpeakerInvitationStatus.pending,
        invitedAt: new Date().toISOString(),
        token,
        expiresAt: expiresAt.toISOString(),
      }

      // Update proposal with new invitation
      const updatedProposal = await clientWrite
        .patch(id as string)
        .setIfMissing({ coSpeakerInvitations: [] })
        .append('coSpeakerInvitations', [invitation])
        .commit()

      // Send invitation email
      const emailSubject = `Invitation to co-present: ${proposal.title}`
      const emailBody = `
        <p>Hello${invitation.name ? ` ${invitation.name}` : ''},</p>
        <p>${req.auth.speaker.name} has invited you to be a co-speaker on their proposal "${proposal.title}" for the Cloud Native Bergen conference.</p>
        ${message ? `<p>Message from ${req.auth.speaker.name}:</p><blockquote>${message}</blockquote>` : ''}
        <p>To accept or decline this invitation, please click the link below:</p>
        <p><a href="${process.env.NEXTAUTH_URL}/proposal/invitation?token=${token}">Respond to invitation</a></p>
        <p>This invitation will expire in 7 days.</p>
        <p>Best regards,<br>Cloud Native Bergen Team</p>
      `

      await sendEmail({
        to: normalizedEmail,
        subject: emailSubject,
        html: emailBody,
      })

      return NextResponse.json({
        message: 'Invitation sent successfully',
        invitation: {
          email: invitation.email,
          status: invitation.status,
          invitedAt: invitation.invitedAt,
        },
      })
    } catch (error) {
      return proposalResponseError({
        error: error as Error,
        message: 'Error sending invitation',
        type: 'server',
        status: 500,
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

// PATCH to accept or decline an invitation
export const PATCH = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    const { id } = await context.params

    const { token, action } = await req.json()

    if (!token || !action || !['accept', 'decline'].includes(action)) {
      return proposalResponseError({
        message: 'Token and action (accept/decline) are required',
        type: 'validation',
        status: 400,
      })
    }

    // For invitation acceptance, we need to get the proposal without speaker authorization
    // Since we're validating by token, not by speaker ID
    const { proposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: '', // Empty string to bypass speaker check for token-based access
      isOrganizer: true, // Allow access for invitation validation
    })

    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!proposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    // Find the invitation by token
    const invitations = proposal.coSpeakerInvitations || []
    const invitationIndex = invitations.findIndex(inv => inv.token === token)

    if (invitationIndex === -1) {
      return proposalResponseError({
        message: 'Invalid or expired invitation token',
        type: 'validation',
        status: 400,
      })
    }

    const invitation = invitations[invitationIndex]

    // Check if invitation is still pending
    if (invitation.status !== CoSpeakerInvitationStatus.pending) {
      return proposalResponseError({
        message: `Invitation has already been ${invitation.status}`,
        type: 'validation',
        status: 400,
      })
    }

    // Check if invitation has expired (7 days)
    const invitedDate = new Date(invitation.invitedAt)
    const expiryDate = new Date(invitedDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    if (new Date() > expiryDate) {
      // Update invitation status to expired
      invitations[invitationIndex] = {
        ...invitation,
        status: CoSpeakerInvitationStatus.expired,
        respondedAt: new Date().toISOString(),
      }

      await clientWrite
        .patch(id as string)
        .set({ coSpeakerInvitations: invitations })
        .commit()

      return proposalResponseError({
        message: 'Invitation has expired',
        type: 'validation',
        status: 400,
      })
    }

    try {
      if (action === 'accept') {
        // Check if the user is authenticated and has a speaker profile
        if (!req.auth || !req.auth.speaker) {
          return proposalResponseError({
            message: 'You must be logged in with a speaker profile to accept this invitation',
            type: 'authentication',
            status: 401,
          })
        }

        // Verify the authenticated user's email matches the invitation email
        if (normalizeEmail(req.auth.user.email) !== invitation.email) {
          return proposalResponseError({
            message: 'This invitation was sent to a different email address',
            type: 'validation',
            status: 403,
          })
        }

        // Update invitation status
        invitations[invitationIndex] = {
          ...invitation,
          status: CoSpeakerInvitationStatus.accepted,
          respondedAt: new Date().toISOString(),
        }

        // Add speaker as co-speaker
        const speakerRef: Reference = { _type: 'reference', _ref: req.auth.speaker._id }
        
        await clientWrite
          .patch(id as string)
          .set({ coSpeakerInvitations: invitations })
          .setIfMissing({ coSpeakers: [] })
          .append('coSpeakers', [speakerRef])
          .commit()

        // Send notification email to primary speaker
        const primarySpeaker = proposal.speaker && '_id' in proposal.speaker 
          ? proposal.speaker 
          : undefined

        if (primarySpeaker) {
          await sendEmail({
            to: primarySpeaker.email,
            subject: `Co-speaker invitation accepted: ${proposal.title}`,
            html: `
              <p>Hello ${primarySpeaker.name},</p>
              <p>${req.auth.speaker.name} has accepted your invitation to be a co-speaker on "${proposal.title}".</p>
              <p>They now have access to view and edit the proposal.</p>
              <p>Best regards,<br>Cloud Native Bergen Team</p>
            `,
          })
        }

        return NextResponse.json({
          message: 'Invitation accepted successfully',
          status: 'accepted',
        })
      } else {
        // Decline invitation
        invitations[invitationIndex] = {
          ...invitation,
          status: CoSpeakerInvitationStatus.rejected,
          respondedAt: new Date().toISOString(),
        }

        await clientWrite
          .patch(id as string)
          .set({ coSpeakerInvitations: invitations })
          .commit()

        // Send notification email to primary speaker
        const primarySpeaker = proposal.speaker && '_id' in proposal.speaker 
          ? proposal.speaker 
          : undefined

        if (primarySpeaker) {
          await sendEmail({
            to: primarySpeaker.email,
            subject: `Co-speaker invitation declined: ${proposal.title}`,
            html: `
              <p>Hello ${primarySpeaker.name},</p>
              <p>The invitation to ${invitation.email} to be a co-speaker on "${proposal.title}" has been declined.</p>
              <p>Best regards,<br>Cloud Native Bergen Team</p>
            `,
          })
        }

        return NextResponse.json({
          message: 'Invitation declined',
          status: 'declined',
        })
      }
    } catch (error) {
      return proposalResponseError({
        error: error as Error,
        message: 'Error processing invitation response',
        type: 'server',
        status: 500,
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any