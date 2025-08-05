import { Action } from '../types'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
} from '@/components/email'
import { resend, EMAIL_CONFIG } from '@/lib/email/config'
import {
  NotificationParams,
  createTemplateProps,
  type ProposalAcceptTemplateProps,
  type ProposalRejectTemplateProps,
} from './types'

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

  const confirmUrl = `${params.event.url}/cfp/list?confirm=${params.proposal._id}`
  const templateProps = createTemplateProps(params, confirmUrl)

  const subject = getEmailSubject(action, params.event.name)
  const template = getEmailTemplate(action, templateProps)

  const { data, error } = await resend.emails.send({
    from: params.event.contactEmail || EMAIL_CONFIG.RESEND_FROM_EMAIL,
    to: [params.speaker.email],
    subject: subject,
    react: template,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}
