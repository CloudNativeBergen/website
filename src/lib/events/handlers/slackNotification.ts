import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  notifyProposalStatusChange,
  notifyNewProposal,
} from '@/lib/slack/notify'
import { Action } from '@/lib/proposal/types'
import { isSelfWithdrawInThread } from '@/lib/notification/proposal-copy'

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

  if (
    ![Action.confirm, Action.withdraw, Action.cancel].includes(event.action) ||
    // The thread message already posted to Slack (speaker-authored fan-out).
    isSelfWithdrawInThread({
      action: event.action,
      isOrganizer: event.metadata.triggeredBy.isOrganizer,
      postedToThread: event.metadata.postedToThread,
      ticketCancellation: event.metadata.ticketCancellation,
    })
  ) {
    return
  }

  await notifyProposalStatusChange(
    event.proposal,
    event.action,
    event.conference,
    undefined,
    event.metadata.reason,
    event.metadata.ticketCancellation,
  )

  console.log(`Slack notification sent for proposal ${event.proposal._id}`)
}
