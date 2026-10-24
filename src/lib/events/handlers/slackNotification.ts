import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  notifyProposalStatusChange,
  notifyNewProposal,
} from '@/lib/slack/notify'
import { Action } from '@/lib/proposal/types'

/**
 * A speaker withdrew their own talk and the reason went out as a thread
 * message, whose fan-out already posted to Slack. A second "Talk Withdrawn"
 * alert would double-notify the organizers.
 */
function isSelfWithdrawInThread(event: ProposalStatusChangeEvent): boolean {
  return (
    event.action === Action.withdraw &&
    !event.metadata.triggeredBy.isOrganizer &&
    !!event.metadata.postedToThread
  )
}

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
    isSelfWithdrawInThread(event)
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
