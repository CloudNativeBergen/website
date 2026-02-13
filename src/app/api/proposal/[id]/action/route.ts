import { ProposalActionResponse, Status } from '@/lib/proposal/types'
import { NextAuthRequest, auth } from '@/lib/auth'
import { proposalResponseError } from '@/lib/proposal/server'
import { NextResponse } from 'next/server'
import {
  deleteProposal,
  getProposalSanity,
  updateProposalStatus,
} from '@/lib/proposal/server'
import { actionStateMachine } from '@/lib/proposal'
import { Speaker } from '@/lib/speaker/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { eventBus } from '@/lib/events/bus'
import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { ProposalActionSchema } from '@/server/schemas/proposal'
import '@/lib/events/registry'

export const POST = auth(
  async (
    req: NextAuthRequest,
    { params }: { params: Record<string, string | string[] | undefined> },
  ) => {
    const { id } = (await params) as { id: string }

    // Validate request body with Zod schema
    const body = await req.json()
    const validationResult = ProposalActionSchema.safeParse(body)

    if (!validationResult.success) {
      return proposalResponseError({
        message: 'Invalid request body',
        type: 'validation',
        status: 400,
        validationErrors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const { action, notify, comment } = validationResult.data

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

    const {
      conference,
      domain,
      error: conferenceError,
    } = await getConferenceForCurrentDomain({})
    if (conferenceError || !conference) {
      console.error(conferenceError || 'Conference not found')
      return proposalResponseError({
        message: 'Conference not found',
        type: 'not_found',
        status: 404,
      })
    }

    const { proposal, proposalError } = await getProposalSanity({
      id,
      speakerId: req.auth.speaker._id,
      isOrganizer: req.auth.speaker.isOrganizer,
    })
    if (proposalError || !proposal || proposal._id !== id) {
      console.error(proposalError || 'Proposal not found')

      return proposalResponseError({
        message: 'Unauthorized',
        type: 'authentication',
        status: 401,
      })
    }

    const { status, isValidAction } = actionStateMachine(
      proposal.status,
      action,
      req.auth.speaker.isOrganizer,
    )
    if (!isValidAction) {
      console.error(`Invalid action ${action} for status ${proposal.status}`)
      return proposalResponseError({
        message: `Invalid action ${action} for status ${proposal.status}`,
        type: 'invalid_action',
        status: 400,
      })
    }

    if (status === Status.deleted) {
      const { err: deleteError } = await deleteProposal(id)
      if (deleteError) {
        console.error(deleteError)
        return proposalResponseError({
          message: deleteError.message,
          type: 'delete_error',
          status: 500,
        })
      }
      return new NextResponse(
        JSON.stringify({
          proposalStatus: Status.deleted,
          status: 200,
        } as ProposalActionResponse),
        { status: 200 },
      )
    }

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

    const statusChangeEvent: ProposalStatusChangeEvent = {
      eventType: 'proposal.status.changed',
      timestamp: new Date(),
      proposal: updatedProposal,
      previousStatus: proposal.status,
      newStatus: status,
      action,
      conference,
      speakers: proposal.speakers as Speaker[],
      metadata: {
        triggeredBy: {
          speakerId: req.auth.speaker._id,
          isOrganizer: req.auth.speaker.isOrganizer,
        },
        shouldNotify: notify,
        comment,
        domain,
      },
    }

    eventBus.publish(statusChangeEvent).catch((error) => {
      console.error('Failed to publish status change event:', error)
    })

    return new NextResponse(
      JSON.stringify({
        proposalStatus: updatedProposal.status,
        status: 200,
      } as ProposalActionResponse),
      { status: 200 },
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NextAuth route handler type workaround
) as any
