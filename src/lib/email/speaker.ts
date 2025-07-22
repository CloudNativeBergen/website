import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposal } from '@/lib/proposal/sanity'
import { SpeakerEmailTemplate } from '@/components/email/SpeakerEmailTemplate'
import { Conference } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { addSpeakerToAudience, getOrCreateConferenceAudience } from './audience'
import {
  resend,
  EMAIL_CONFIG,
  retryWithBackoff,
  createEmailError,
  type EmailResult,
} from './config'

export interface SpeakerEmailRequest {
  proposalId: string
  speakerId: string
  subject: string
  message: string
  /** Whether to add the speaker to the conference audience for future broadcasts */
  addToAudience?: boolean
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
  addToAudience = false,
}: SpeakerEmailRequest & { senderName: string }): Promise<
  EmailResult<SpeakerEmailResponse>
> {
  try {
    // Get the conference details
    const { conference } = await getConferenceForCurrentDomain({})

    if (!conference) {
      return {
        error: createEmailError('Conference not found', 404),
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
        error: createEmailError(
          'Speaker not found or speaker has no email',
          404,
        ),
      }
    }

    // Send the email with rate limiting and retry logic
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

    // Optionally add speaker to conference audience for future communications
    if (addToAudience) {
      try {
        const { audienceId, error: audienceError } =
          await getOrCreateConferenceAudience(conference)
        if (!audienceError && audienceId) {
          // Create a minimal Speaker object for audience management
          const speakerForAudience: Partial<Speaker> &
            Pick<Speaker, '_id' | 'name' | 'email'> = {
            _id: speaker._id,
            name: speaker.name,
            email: speaker.email,
          }
          await addSpeakerToAudience(audienceId, speakerForAudience as Speaker)
          console.log(`Speaker ${speaker.name} added to conference audience`)
        }
      } catch (error) {
        // Don't fail the email if audience sync fails
        console.warn('Failed to add speaker to audience:', error)
      }
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
      error: createEmailError('Internal server error', 500),
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
}): Promise<EmailResult<{ emailId: string }>> {
  try {
    // Create the proposal URL
    const proposalUrl = `${conference.domains[0]}/cfp/admin/proposals/${proposal._id}`

    // Create the email template
    const emailTemplate = SpeakerEmailTemplate({
      speakers: [{ name: speaker.name, email: speaker.email }],
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

    // Send the email with retry logic for production reliability
    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: EMAIL_CONFIG.RESEND_FROM_EMAIL,
        to: [speaker.email],
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
    console.error('Error sending formatted speaker email:', error)
    return {
      error: createEmailError('Failed to send email', 500),
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

// Multi-speaker email interfaces and functions

export interface MultiSpeakerEmailRequest {
  proposalId: string
  speakerIds: string[]
  subject: string
  message: string
  /** Whether to add the speakers to the conference audience for future broadcasts */
  addToAudience?: boolean
}

export interface MultiSpeakerEmailResponse {
  message: string
  emailId?: string
  recipients: string[]
  proposalTitle: string
}

/**
 * Send an email to multiple speakers about their proposal
 */
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
    // Get the conference details
    const { conference } = await getConferenceForCurrentDomain({})

    if (!conference) {
      return {
        error: createEmailError('Conference not found', 404),
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

    // Find the speakers in the proposal
    const allSpeakers = Array.isArray(proposal.speakers)
      ? proposal.speakers.filter(
          (speaker) =>
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

    // Send the email with rate limiting and retry logic
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

    // Optionally add speakers to conference audience for future communications
    if (addToAudience) {
      try {
        const { audienceId, error: audienceError } =
          await getOrCreateConferenceAudience(conference)
        if (!audienceError && audienceId) {
          for (const speaker of targetSpeakers) {
            // Create a minimal Speaker object for audience management
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
          console.log(
            `${targetSpeakers.length} speakers added to conference audience`,
          )
        }
      } catch (error) {
        // Don't fail the email if audience sync fails
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

/**
 * Send a formatted email to multiple speakers using the multi-speaker email template
 */
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
    // Create the proposal URL
    const proposalUrl = `${conference.domains[0]}/cfp/admin/proposals/${proposal._id}`

    // Create the email template
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

    // Send the email with retry logic for production reliability
    const emailResult = await retryWithBackoff(async () => {
      const result = await resend.emails.send({
        from: EMAIL_CONFIG.RESEND_FROM_EMAIL,
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

/**
 * Validate multi-speaker email request
 */
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
