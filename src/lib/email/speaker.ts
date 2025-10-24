import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import { SpeakerEmailTemplate } from '@/components/email/SpeakerEmailTemplate'
import { Conference } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { addSpeakerToAudience, getOrCreateConferenceAudience } from './audience'
import {
  resend,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'

export interface MultiSpeakerEmailRequest {
  proposalId: string
  speakerIds: string[]
  subject: string
  message: string

  addToAudience?: boolean
}

export interface MultiSpeakerEmailResponse {
  message: string
  emailId?: string
  recipients: string[]
  proposalTitle: string
}

export async function sendMultiSpeakerEmail({
  proposalId,
  speakerIds,
  subject,
  message,
  senderName,
  addToAudience = false,
}: MultiSpeakerEmailRequest & { senderName: string }): Promise<
  EmailResult<MultiSpeakerEmailResponse>
> {
  try {
    const { conference } = await getConferenceForCurrentDomain({})

    if (!conference) {
      return {
        error: createEmailError('Conference not found', 404),
      }
    }

    const { proposal, proposalError } = await getProposal({
      id: proposalId,
      speakerId: '',
      isOrganizer: true,
      includeReviews: false,
      includePreviousAcceptedTalks: false,
      includeSubmittedTalks: false,
    })

    if (proposalError) {
      return {
        error: createEmailError(
          `Failed to fetch proposal: ${proposalError.message}`,
          500,
        ),
      }
    }

    if (!proposal) {
      return {
        error: createEmailError('Proposal not found', 404),
      }
    }

    const allSpeakers = Array.isArray(proposal.speakers)
      ? proposal.speakers.filter(
          (speaker): speaker is Speaker =>
            typeof speaker === 'object' && speaker && '_id' in speaker,
        )
      : []

    const targetSpeakers = allSpeakers.filter(
      (s: { _id: string; email?: string; name: string }) =>
        speakerIds.includes(s._id) && s.email,
    )

    if (targetSpeakers.length === 0) {
      return {
        error: createEmailError(
          'No speakers found with valid email addresses',
          404,
        ),
      }
    }

    const emailResult = await sendFormattedMultiSpeakerEmail({
      speakers: targetSpeakers,
      proposal,
      conference,
      subject,
      message,
      senderName,
    })

    if (emailResult.error) {
      return { error: emailResult.error }
    }

    if (addToAudience) {
      try {
        const { audienceId, error: audienceError } =
          await getOrCreateConferenceAudience(conference)
        if (!audienceError && audienceId) {
          for (const speaker of targetSpeakers) {
            const speakerForAudience: Partial<Speaker> &
              Pick<Speaker, '_id' | 'name' | 'email'> = {
              _id: speaker._id,
              name: speaker.name,
              email: speaker.email,
            }
            await addSpeakerToAudience(
              audienceId,
              speakerForAudience as Speaker,
            )
          }
        }
      } catch (error) {
        console.warn('Failed to add speakers to audience:', error)
      }
    }

    return {
      data: {
        message: 'Email sent successfully',
        emailId: emailResult.data?.emailId,
        recipients: targetSpeakers.map((s) => s.email),
        proposalTitle: proposal.title,
      },
    }
  } catch (error) {
    console.error('Error sending multi-speaker email:', error)
    return {
      error: createEmailError('Internal server error', 500),
    }
  }
}

export async function sendFormattedMultiSpeakerEmail({
  speakers,
  proposal,
  conference,
  subject,
  message,
  senderName,
}: {
  speakers: { _id: string; email: string; name: string }[]
  proposal: ProposalExisting
  conference: Conference
  subject: string
  message: string
  senderName: string
}): Promise<EmailResult<{ emailId: string }>> {
  try {
    const proposalUrl = `${conference.domains[0]}/cfp/admin/proposals/${proposal._id}`

    const emailTemplate = SpeakerEmailTemplate({
      speakers: speakers.map((s) => ({ name: s.name, email: s.email })),
      proposalTitle: proposal.title,
      proposalUrl: proposalUrl,
      eventName: conference.title,
      eventLocation: `${conference.city}, ${conference.country}`,
      eventDate: conference.start_date || '',
      eventUrl: `https://${conference.domains[0]}`,
      subject: subject,
      message: message,
      senderName: senderName,
      socialLinks: conference.social_links || [],
    })

    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: `${conference.organizer} <${conference.cfp_email}>`,
        to: speakers.map((s) => s.email),
        subject: subject,
        react: emailTemplate,
      })

      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }

      return result
    })

    return {
      data: {
        emailId: emailResult.data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending formatted multi-speaker email:', error)
    return {
      error: createEmailError('Failed to send email', 500),
    }
  }
}

export function validateMultiSpeakerEmailRequest(
  request: Partial<MultiSpeakerEmailRequest>,
): { isValid: boolean; error?: string } {
  const { proposalId, speakerIds, subject, message } = request

  if (!proposalId || !speakerIds || !subject || !message) {
    return {
      isValid: false,
      error:
        'Missing required fields: proposalId, speakerIds, subject, message',
    }
  }

  if (!Array.isArray(speakerIds) || speakerIds.length === 0) {
    return {
      isValid: false,
      error: 'speakerIds must be a non-empty array',
    }
  }

  if (!subject.trim()) {
    return {
      isValid: false,
      error: 'Subject cannot be empty',
    }
  }

  if (!message.trim()) {
    return {
      isValid: false,
      error: 'Message cannot be empty',
    }
  }

  return { isValid: true }
}
