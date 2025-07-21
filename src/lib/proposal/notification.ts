import { Resend } from 'resend'
import assert from 'assert'
import { Action } from '@/lib/proposal/types'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
} from '@/components/email'
import {
  NotificationParams,
  createTemplateProps,
  type ProposalAcceptTemplateProps,
  type ProposalRejectTemplateProps,
} from './email-types'

assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
assert(process.env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL is not set')

const resend = new Resend(process.env.RESEND_API_KEY as string)
const fromEmail = process.env.RESEND_FROM_EMAIL as string

function getEmailTemplate(
  action: Action,
  templateProps: ProposalAcceptTemplateProps | ProposalRejectTemplateProps,
) {
  switch (action) {
    case Action.accept:
    case Action.remind:
      if (!('confirmUrl' in templateProps) || !templateProps.confirmUrl) {
        throw new Error(`Missing confirmUrl for action: ${action}`)
      }
      return ProposalAcceptTemplate(
        templateProps as ProposalAcceptTemplateProps,
      )
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

export async function sendAcceptRejectNotification(params: NotificationParams) {
  const { action } = params

  if (
    !action ||
    (action !== Action.accept &&
      action !== Action.remind &&
      action !== Action.reject)
  ) {
    throw new Error(`Invalid action for notification: ${action}`)
  }

  const confirmUrl = `/cfp/list?confirm=${params.proposal._id}`
  const templateProps = createTemplateProps(params, confirmUrl)

  const subject = getEmailSubject(action, params.event.name)
  const template = getEmailTemplate(action, templateProps)

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [params.speaker.email],
    subject: subject,
    react: template,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}
