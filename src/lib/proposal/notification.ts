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
  event: { location: string; date: string; name: string, url: string }
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
      event
    },
  }

  return await sgMail.send(msg)
}
