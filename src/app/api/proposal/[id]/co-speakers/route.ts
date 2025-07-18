import { NextAuthRequest, auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/sanity'
import { proposalResponseError } from '@/lib/proposal/server'
import { NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { CoSpeakerInvitation, CoSpeakerInvitationStatus, Format } from '@/lib/proposal/types'
import { v4 as randomUUID } from 'uuid'
import { Reference } from 'sanity'
import { Speaker } from '@/lib/speaker/types'

export const dynamic = 'force-dynamic'

// Helper function to get ID from speaker or reference
function getSpeakerId(speaker: Speaker | Reference | undefined): string | undefined {
  if (!speaker) return undefined
  if ('_id' in speaker) return speaker._id
  if ('_ref' in speaker) return speaker._ref
  return undefined
}

// GET co-speakers and invitations for a proposal
export const GET = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
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

    const { proposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: req.auth.speaker._id,
      isOrganizer: req.auth.speaker.is_organizer,
    })

    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!proposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    // Check if the speaker is authorized (must be the primary speaker, co-speaker, or organizer)
    const proposalSpeakerId = getSpeakerId(proposal.speaker)
    const isCoSpeaker = proposal.coSpeakers?.some(s => {
      const coSpeakerId = getSpeakerId(s)
      return coSpeakerId === req.auth!.speaker._id
    })

    if (
      proposalSpeakerId !== req.auth.speaker._id &&
      !isCoSpeaker &&
      !req.auth.speaker.is_organizer
    ) {
      return proposalResponseError({
        message: 'Unauthorized to view co-speakers',
        type: 'authentication',
        status: 403,
      })
    }

    return NextResponse.json({
      coSpeakers: proposal.coSpeakers || [],
      coSpeakerInvitations: proposal.coSpeakerInvitations || [],
    })
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

// POST to add a co-speaker directly (for existing speakers)
export const POST = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
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

    const { speakerId } = await req.json()

    if (!speakerId) {
      return proposalResponseError({
        message: 'Speaker ID is required',
        type: 'validation',
        status: 400,
      })
    }

    const { proposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: req.auth.speaker._id,
      isOrganizer: req.auth.speaker.is_organizer,
    })

    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!proposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    // Only the primary speaker can add co-speakers
    const proposalSpeakerId = getSpeakerId(proposal.speaker)
    if (proposalSpeakerId !== req.auth.speaker._id) {
      return proposalResponseError({
        message: 'Only the primary speaker can add co-speakers',
        type: 'authentication',
        status: 403,
      })
    }

    // Check if proposal format allows co-speakers
    if (proposal.format === Format.lightning_10) {
      return proposalResponseError({
        message: 'Lightning talks (10 min) cannot have co-speakers',
        type: 'validation',
        status: 400,
      })
    }

    // Check if speaker is already a co-speaker
    const existingCoSpeakers = proposal.coSpeakers || []
    const isAlreadyCoSpeaker = existingCoSpeakers.some(s => {
      const coSpeakerId = getSpeakerId(s)
      return coSpeakerId === speakerId
    })
    
    if (isAlreadyCoSpeaker) {
      return proposalResponseError({
        message: 'Speaker is already a co-speaker',
        type: 'validation',
        status: 400,
      })
    }

    // Check if speaker is the primary speaker
    if (proposalSpeakerId === speakerId) {
      return proposalResponseError({
        message: 'Cannot add primary speaker as co-speaker',
        type: 'validation',
        status: 400,
      })
    }

    try {
      // Add the speaker reference to coSpeakers array
      const speakerRef: Reference = { _type: 'reference', _ref: speakerId }
      const updatedProposal = await clientWrite
        .patch(id as string)
        .setIfMissing({ coSpeakers: [] })
        .append('coSpeakers', [speakerRef])
        .commit()

      return NextResponse.json({
        message: 'Co-speaker added successfully',
        coSpeakers: updatedProposal.coSpeakers,
      })
    } catch (error) {
      return proposalResponseError({
        error: error as Error,
        message: 'Error adding co-speaker',
        type: 'server',
        status: 500,
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

// DELETE to remove a co-speaker
export const DELETE = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
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

    const { speakerId } = await req.json()

    if (!speakerId) {
      return proposalResponseError({
        message: 'Speaker ID is required',
        type: 'validation',
        status: 400,
      })
    }

    const { proposal, proposalError } = await getProposal({
      id: id as string,
      speakerId: req.auth.speaker._id,
      isOrganizer: req.auth.speaker.is_organizer,
    })

    if (proposalError) {
      return proposalResponseError({
        error: proposalError,
        message: 'Error fetching proposal from database',
        type: 'server',
        status: 500,
      })
    }

    if (!proposal) {
      return proposalResponseError({
        message: 'Proposal not found',
        type: 'not_found',
        status: 404,
      })
    }

    // Only the primary speaker or the co-speaker themselves can remove
    const proposalSpeakerId = getSpeakerId(proposal.speaker)
    if (proposalSpeakerId !== req.auth.speaker._id && req.auth.speaker._id !== speakerId) {
      return proposalResponseError({
        message: 'Unauthorized to remove co-speaker',
        type: 'authentication',
        status: 403,
      })
    }

    try {
      // Remove the speaker from coSpeakers array
      const updatedCoSpeakers = (proposal.coSpeakers || [])
        .filter(s => {
          const coSpeakerId = getSpeakerId(s)
          return coSpeakerId !== speakerId
        })
        .map(s => {
          const speakerRef = getSpeakerId(s)
          return { _type: 'reference', _ref: speakerRef || '' }
        })

      const updatedProposal = await clientWrite
        .patch(id as string)
        .set({ coSpeakers: updatedCoSpeakers })
        .commit()

      return NextResponse.json({
        message: 'Co-speaker removed successfully',
        coSpeakers: updatedProposal.coSpeakers,
      })
    } catch (error) {
      return proposalResponseError({
        error: error as Error,
        message: 'Error removing co-speaker',
        type: 'server',
        status: 500,
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any