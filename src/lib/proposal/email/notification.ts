import { Action } from '../types'
import {
  ProposalAcceptTemplate,
  ProposalCancelTemplate,
  ProposalRejectTemplate,
  ProposalWaitlistTemplate,
} from '@/components/email'
import { resolveEmailSender, retryWithBackoff } from '@/lib/email/config'
import {
  NotificationParams,
  createTemplateProps,
  type ProposalAcceptTemplateProps,
  type ProposalRejectTemplateProps,
} from './types'
import { resolveConferenceFrom } from '@/lib/email/from'

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
    case Action.waitlist:
      return ProposalWaitlistTemplate(templateProps)
    case Action.reject:
      return ProposalRejectTemplate(templateProps)
    case Action.cancel:
    case Action.withdraw:
      return ProposalCancelTemplate({
        ...templateProps,
        withdrawn: action === Action.withdraw,
      })
    default:
      throw new Error(`No template found for action: ${action}`)
  }
}

function getEmailSubject(action: Action, eventName: string): string {
  switch (action) {
    case Action.accept:
      return `🎉 Your proposal has been accepted for ${eventName}`
    case Action.waitlist:
      return `Your proposal has been waitlisted for ${eventName}`
    case Action.remind:
      return `⏰ Reminder: Please confirm your participation in ${eventName}`
    case Action.reject:
      return `Thank you for your proposal submission to ${eventName}`
    case Action.cancel:
      return `Your talk at ${eventName} has been canceled`
    case Action.withdraw:
      return `Your talk at ${eventName} has been withdrawn`
    default:
      return `Update on your proposal for ${eventName}`
  }
}

const EMAIL_ACTIONS: readonly Action[] = [
  Action.accept,
  Action.remind,
  Action.waitlist,
  Action.reject,
  Action.cancel,
  Action.withdraw,
]

export async function sendAcceptRejectNotification(params: NotificationParams) {
  const { action } = params

  if (!action || !EMAIL_ACTIONS.includes(action)) {
    throw new Error(`Invalid action for notification: ${action}`)
  }

  const confirmUrl = `${params.event.url}/cfp/list?confirm=${params.proposal._id}`
  const templateProps = createTemplateProps(params, confirmUrl)

  const subject = getEmailSubject(action, params.event.name)
  const template = getEmailTemplate(action, templateProps)

  // Retry transient provider failures (e.g. rate limits) with backoff,
  // consistent with the other email flows in the codebase
  const { client } = await resolveEmailSender(params.event.orgId)

  return retryWithBackoff(async () => {
    const { data, error } = await client.emails.send({
      from: resolveConferenceFrom(params.event),
      to: [params.speaker.email],
      subject: subject,
      react: template,
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }

    return data
  })
}
