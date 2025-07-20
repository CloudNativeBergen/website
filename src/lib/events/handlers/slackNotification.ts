import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { notifyProposalStatusChange } from '@/lib/slack/notify'
import { Action } from '@/lib/proposal/types'

/**
 * Handler for Slack notifications
 */
export async function handleSlackNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  // Only send Slack notifications for confirm/withdraw actions
  if (![Action.confirm, Action.withdraw].includes(event.action)) {
    return
  }

  await notifyProposalStatusChange(event.proposal, event.action)

  console.log(`Slack notification sent for proposal ${event.proposal._id}`)
}
