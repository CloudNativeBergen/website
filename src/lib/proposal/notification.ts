import { Resend } from 'resend'
import assert from 'assert'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
} from '@/components/email'

assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
assert(process.env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL is not set')

const resend = new Resend(process.env.RESEND_API_KEY as string)
const fromEmail = process.env.RESEND_FROM_EMAIL as string

function getEmailTemplate(
  action: Action,
  templateProps: {
    speakerName: string
    proposalTitle: string
    eventName: string
    eventLocation: string
    eventDate: string
    eventUrl: string
    confirmUrl?: string
    comment?: string
  },
) {
  switch (action) {
    case Action.accept:
    case Action.remind:
      if (!templateProps.confirmUrl) {
        throw new Error(`Missing confirmUrl for action: ${action}`)
      }
      return ProposalAcceptTemplate({
        ...templateProps,
        confirmUrl: templateProps.confirmUrl,
      })
    case Action.reject:
      return ProposalRejectTemplate(templateProps)
    default:
      throw new Error(`No template found for action: ${action}`)
  }
}

function getEmailSubject(action: Action, eventName: string): string {
  switch (action) {
    case Action.accept:
      return `🎉 Your proposal has been accepted for ${eventName}`
    case Action.remind:
      return `⏰ Reminder: Please confirm your participation in ${eventName}`
    case Action.reject:
      return `Thank you for your proposal submission to ${eventName}`
    default:
      return `Update on your proposal for ${eventName}`
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
}) {
  if (
    !action ||
    (action !== Action.accept &&
      action !== Action.remind &&
      action !== Action.reject)
  ) {
    throw new Error(`Invalid action for notification: ${action}`)
  }

  const templateProps = {
    speakerName: speaker.name,
    proposalTitle: proposal.title,
    eventName: event.name,
    eventLocation: event.location,
    eventDate: event.date,
    eventUrl: event.url,
    confirmUrl: `${process.env.NEXT_PUBLIC_URL}/cfp/list?confirm=${proposal._id}`,
    comment,
  }

  const subject = getEmailSubject(action, event.name)
  const template = getEmailTemplate(action, templateProps)

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [speaker.email],
    subject: subject,
    react: template,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}
