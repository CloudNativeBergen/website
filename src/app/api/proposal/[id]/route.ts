import { ProposalInput } from '@/lib/proposal/types'
import { NextAuthRequest, auth } from '@/lib/auth'
import {
  convertJsonToProposal,
  validateProposal,
} from '@/lib/proposal/validation'
import { getProposal, updateProposal } from '@/lib/proposal/sanity'
import { proposalResponse, proposalResponseError } from '@/lib/proposal/server'

export const dynamic = 'force-dynamic'

export const GET = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

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

    const { proposal: existingProposal, proposalError: error } =
      await getProposal({
        id: id as string,
        speakerId: req.auth.speaker._id,
      })
    if (error) {
      return proposalResponseError({
        error,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (existingProposal) {
      return proposalResponse(existingProposal)
    } else {
      return proposalResponseError({
        message: 'Document not found',
        type: 'not_found',
        status: 404,
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

export const PUT = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

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

    const data = (await req.json()) as ProposalInput
    const proposal = convertJsonToProposal(data)

    // @TODO check if conference is closed for modifications

    const validationErrors = validateProposal(proposal)
    if (validationErrors.length > 0) {
      return proposalResponseError({
        message: 'Proposal contains invalid fields',
        validationErrors,
        type: 'validation',
        status: 400,
      })
    }

    const { proposal: existingProposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: req.auth.speaker._id,
    })
    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!existingProposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    const { proposal: updatedProposal, err: updateErr } = await updateProposal(
      id as string,
      proposal,
      req.auth.speaker._id,
    )
    if (updateErr) {
      return proposalResponseError({
        error: updateErr,
        message: 'Error updating proposal in database',
        type: 'server',
        status: 500,
      })
    }

    return proposalResponse(updatedProposal)
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
