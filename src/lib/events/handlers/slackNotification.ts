import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  notifyProposalStatusChange,
  notifyNewProposal,
} from '@/lib/slack/notify'
import { Action } from '@/lib/proposal/types'

export async function handleSlackNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (event.action === Action.submit) {
    await notifyNewProposal(event.proposal, event.conference)
    console.log(
      `Slack new proposal notification sent for proposal ${event.proposal._id}`,
    )
    return
  }

  if (![Action.confirm, Action.withdraw].includes(event.action)) {
    return
  }

  await notifyProposalStatusChange(
    event.proposal,
    event.action,
    event.conference,
  )

  console.log(`Slack notification sent for proposal ${event.proposal._id}`)
}
