import {
  Action,
  ActionInput,
  ProposalActionResponse,
} from '@/lib/proposal/types'
import { NextAuthRequest, auth } from '@/lib/auth'
import { proposalResponseError } from '@/lib/proposal/server'
import { NextResponse } from 'next/server'
import { getProposal, updateProposalStatus } from '@/lib/proposal/sanity'
import { actionStateMachine } from '@/lib/proposal/states'
import { sendAcceptRejectNotification } from '@/lib/proposal/notification'
import { Speaker } from '@/lib/speaker/types'
import { notifyProposalStatusChange } from '@/lib/slack/notify'

export const dynamic = 'force-dynamic'

export const POST = auth(
  async (
    req: NextAuthRequest,
    { params }: { params: Record<string, string | string[] | undefined> },
  ) => {
    const { id } = await params as { id: string }
    const { action, notify, comment } = (await req.json()) as ActionInput

    if (
      !req.auth ||
      !req.auth.user ||
      !req.auth.speaker ||
      !req.auth.speaker._id ||
      !req.auth.account
    ) {
      return proposalResponseError({
        message: 'Unauthorized',
        type: 'authentication',
        status: 401,
      })
    }

    const { proposal, err: error } = await getProposal(
      id,
      req.auth.speaker._id,
      req.auth.speaker.is_organizer,
    )
    if (error || !proposal || proposal._id !== id) {
      if (error) console.error(error)
      if (!proposal) console.error('Proposal not found')

      return proposalResponseError({
        message: 'Unauthorized',
        type: 'authentication',
        status: 401,
      })
    }

    // Check if the action is valid for the current status
    const { status, isValidAction } = actionStateMachine(
      proposal.status,
      action,
      req.auth.speaker.is_organizer,
    )
    if (!isValidAction) {
      console.error(`Invalid action ${action} for status ${proposal.status}`)
      return proposalResponseError({
        message: 'Invalid action',
        type: 'invalid_action',
        status: 400,
      })
    }

    // Update the proposal status in the database
    const { proposal: updatedProposal, err: updateErr } =
      await updateProposalStatus(id, status)
    if (updateErr) {
      console.error(updateErr)
      return proposalResponseError({
        message: updateErr.message,
        type: 'update_error',
        status: 500,
      })
    }

    if (notify && (action === Action.accept || action === Action.reject)) {
      await sendAcceptRejectNotification({
        action,
        speaker: proposal.speaker as Speaker,
        proposal: proposal,
        comment: comment || '',
      })
    }

    // Send Slack notification for confirm/withdraw actions
    if (action === Action.confirm || action === Action.withdraw) {
      await notifyProposalStatusChange(updatedProposal, action)
    }

    return new NextResponse(
      JSON.stringify({
        proposalStatus: updatedProposal.status,
        status: 200,
      } as ProposalActionResponse),
      { status: 200 },
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
