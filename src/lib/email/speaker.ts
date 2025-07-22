import { Resend } from 'resend'
import assert from 'assert'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposal } from '@/lib/proposal/sanity'
import { SingleSpeakerEmailTemplate } from '@/components/email'
import { Conference } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'

// Only assert in non-test environments
if (process.env.NODE_ENV !== 'test') {
  assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
  assert(process.env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL is not set')
}

const resend = new Resend(process.env.RESEND_API_KEY || 'test_key')
const fromEmail = process.env.RESEND_FROM_EMAIL || 'test@cloudnativebergen.no'

export interface SpeakerEmailRequest {
  proposalId: string
  speakerId: string
  subject: string
  message: string
}

export interface SpeakerEmailResponse {
  message: string
  emailId?: string
  recipient: string
  proposalTitle: string
}

export interface SpeakerEmailError {
  error: string
  status: number
}

/**
 * Send an email to a specific speaker about their proposal
 */
export async function sendSpeakerEmail({
  proposalId,
  speakerId,
  subject,
  message,
  senderName,
}: SpeakerEmailRequest & { senderName: string }): Promise<{
  data?: SpeakerEmailResponse
  error?: SpeakerEmailError
}> {
  try {
    // Get the conference details
    const { conference } = await getConferenceForCurrentDomain({})

    if (!conference) {
      return {
        error: {
          error: 'Conference not found',
          status: 404,
        },
      }
    }

    // Get the proposal details
    const { proposal, proposalError } = await getProposal({
      id: proposalId,
      speakerId: '', // For organizer view, we don't need to filter by speaker
      isOrganizer: true,
      includeReviews: false,
      includePreviousAcceptedTalks: false,
      includeSubmittedTalks: false,
    })

    if (proposalError) {
      return {
        error: {
          error: `Failed to fetch proposal: ${proposalError.message}`,
          status: 500,
        },
      }
    }

    if (!proposal) {
      return {
        error: {
          error: 'Proposal not found',
          status: 404,
        },
      }
    }

    // Find the speaker in the proposal
    const speakers = Array.isArray(proposal.speakers)
      ? proposal.speakers.filter(
          (speaker) =>
            typeof speaker === 'object' && speaker && '_id' in speaker,
        )
      : []

    const speaker = speakers.find(
      (s: { _id: string; email?: string; name: string }) => s._id === speakerId,
    )

    if (!speaker || !speaker.email) {
      return {
        error: {
          error: 'Speaker not found or speaker has no email',
          status: 404,
        },
      }
    }

    // Send the email
    const emailResult = await sendFormattedSpeakerEmail({
      speaker,
      proposal,
      conference,
      subject,
      message,
      senderName,
    })

    if (emailResult.error) {
      return { error: emailResult.error }
    }

    return {
      data: {
        message: 'Email sent successfully',
        emailId: emailResult.data?.emailId,
        recipient: speaker.email,
        proposalTitle: proposal.title,
      },
    }
  } catch (error) {
    console.error('Error sending speaker email:', error)
    return {
      error: {
        error: 'Internal server error',
        status: 500,
      },
    }
  }
}

/**
 * Send a formatted email using the speaker email template
 */
export async function sendFormattedSpeakerEmail({
  speaker,
  proposal,
  conference,
  subject,
  message,
  senderName,
}: {
  speaker: { _id: string; email: string; name: string }
  proposal: ProposalExisting
  conference: Conference
  subject: string
  message: string
  senderName: string
}): Promise<{
  data?: { emailId: string }
  error?: SpeakerEmailError
}> {
  try {
    // Create the proposal URL
    const proposalUrl = `${conference.domains[0]}/cfp/admin/proposals/${proposal._id}`

    // Create the email template
    const emailTemplate = SingleSpeakerEmailTemplate({
      speakerName: speaker.name,
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

    // Send the email
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [speaker.email],
      subject: subject,
      react: emailTemplate,
    })

    if (error) {
      console.error('Failed to send email:', error)
      return {
        error: {
          error: `Failed to send email: ${error.message}`,
          status: 500,
        },
      }
    }

    return {
      data: {
        emailId: data?.id || '',
      },
    }
  } catch (error) {
    console.error('Error sending formatted speaker email:', error)
    return {
      error: {
        error: 'Failed to send email',
        status: 500,
      },
    }
  }
}

/**
 * Validate speaker email request
 */
export function validateSpeakerEmailRequest(
  request: Partial<SpeakerEmailRequest>,
): { isValid: boolean; error?: string } {
  const { proposalId, speakerId, subject, message } = request

  if (!proposalId || !speakerId || !subject || !message) {
    return {
      isValid: false,
      error: 'Missing required fields: proposalId, speakerId, subject, message',
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