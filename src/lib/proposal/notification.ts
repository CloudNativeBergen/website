import sgMail from '@sendgrid/mail'
import assert from 'assert'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'

assert(process.env.SENDGRID_API_KEY, 'SENDGRID_API_KEY is not set')
assert(process.env.SENDGRID_FROM_EMAIL, 'SENDGRID_FROM_EMAIL is not set')
assert(
  process.env.SENDGRID_TEMPALTE_ID_CFP_ACCEPT,
  'SENDGRID_TEMPALTE_ID_CFP_ACCEPT is not set',
)
assert(
  process.env.SENDGRID_TEMPALTE_ID_CFP_REJECT,
  'SENDGRID_TEMPALTE_ID_CFP_REJECT is not set',
)

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string)

const fromEmail = process.env.SENDGRID_FROM_EMAIL as string
const templateAccept = process.env.SENDGRID_TEMPALTE_ID_CFP_ACCEPT as string
const templateReject = process.env.SENDGRID_TEMPALTE_ID_CFP_REJECT as string

function getTemplate(action: Action) {
  switch (action) {
    case Action.accept:
    case Action.remind:
      return templateAccept
    case Action.reject:
      return templateReject
    default:
      return ''
  }
}

export async function sendAcceptRejectNotification({
  action,
  speaker,
  proposal,
  event,
  comment = '',
}: {
  action: Action
  speaker: Speaker
  proposal: ProposalExisting
  event: { location: string; date: string; name: string; url: string }
  comment: string
}): Promise<[sgMail.ClientResponse, object]> {
  const templateId = getTemplate(action)

  if (!templateId) {
    throw new Error(`Template not found for action: ${action}`)
  }

  const msg = {
    to: speaker.email,
    from: fromEmail,
    templateId: templateId,
    dynamicTemplateData: {
      speaker: {
        name: speaker.name,
      },
      proposal: {
        title: proposal.title,
        confirmUrl: `${process.env.NEXT_PUBLIC_URL}/cfp/list?confirm=${proposal._id}`,
        comment,
      },
      event,
    },
  }

  return await sgMail.send(msg)
}

/**
 * Send notifications to all speakers (primary and co-speakers) on a proposal
 */
export async function sendAcceptRejectNotificationToAllSpeakers({
  action,
  proposal,
  event,
  comment = '',
}: {
  action: Action
  proposal: ProposalExisting
  event: { location: string; date: string; name: string; url: string }
  comment: string
}): Promise<void> {
  const templateId = getTemplate(action)

  if (!templateId) {
    throw new Error(`Template not found for action: ${action}`)
  }

  // Collect all speakers to notify
  const speakersToNotify: Speaker[] = []

  // Add primary speaker if populated
  if (proposal.speaker && typeof proposal.speaker === 'object' && '_id' in proposal.speaker) {
    speakersToNotify.push(proposal.speaker as Speaker)
  }

  // Add co-speakers if populated
  if (proposal.coSpeakers && Array.isArray(proposal.coSpeakers)) {
    for (const coSpeaker of proposal.coSpeakers) {
      if (typeof coSpeaker === 'object' && '_id' in coSpeaker) {
        speakersToNotify.push(coSpeaker as Speaker)
      }
    }
  }

  // Send emails to all speakers
  const emailPromises = speakersToNotify.map(speaker => {
    const msg = {
      to: speaker.email,
      from: fromEmail,
      templateId: templateId,
      dynamicTemplateData: {
        speaker: {
          name: speaker.name,
        },
        proposal: {
          title: proposal.title,
          confirmUrl: `${process.env.NEXT_PUBLIC_URL}/cfp/list?confirm=${proposal._id}`,
          comment,
        },
        event,
      },
    }

    return sgMail.send(msg).catch(error => {
      console.error(`Failed to send email to ${speaker.email}:`, error)
      // Don't throw to allow other emails to be sent
    })
  })

  await Promise.all(emailPromises)
}
