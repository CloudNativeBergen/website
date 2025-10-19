'use server'

import { revalidatePath } from 'next/cache'
import { ProposalInput, ProposalExisting } from '@/lib/proposal/types'
import {
  createProposal,
  updateProposal,
  getProposal,
} from '@/lib/proposal/data/sanity'
import { getAuthSession } from '@/lib/auth'
import { createReferenceWithKey } from '@/lib/sanity/helpers'
import { Reference } from 'sanity'

export async function createProposalAsAdmin(
  proposalData: ProposalInput,
  conferenceId: string,
  speakerIds: string[],
): Promise<{ success: boolean; proposal?: ProposalExisting; error?: string }> {
  try {
    // Verify admin authorization
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return { success: false, error: 'Unauthorized - Admin access required' }
    }

    // Validate required fields
    if (!proposalData.title || proposalData.title.trim() === '') {
      return { success: false, error: 'Title is required' }
    }
    if (!proposalData.format) {
      return { success: false, error: 'Format is required' }
    }
    if (!proposalData.level) {
      return { success: false, error: 'Level is required' }
    }
    if (!proposalData.tos) {
      return { success: false, error: 'Terms of service must be accepted' }
    }
    if (!speakerIds || speakerIds.length === 0) {
      return { success: false, error: 'At least one speaker is required' }
    }
    if (!conferenceId) {
      return { success: false, error: 'Conference ID is required' }
    }

    // Create proposal with first speaker as primary
    const { proposal: created, err } = await createProposal(
      proposalData,
      speakerIds[0],
      conferenceId,
    )

    if (err || !created) {
      return {
        success: false,
        error:
          typeof err === 'string'
            ? err
            : err?.message || 'Failed to create proposal',
      }
    }

    // If multiple speakers, update the proposal with all speaker references
    if (speakerIds.length > 1) {
      const speakerRefs = speakerIds.map((id) =>
        createReferenceWithKey(id, 'speaker'),
      )

      // Use Sanity client to patch the speakers array
      const { clientWrite } = await import('@/lib/sanity/client')
      await clientWrite
        .patch(created._id)
        .set({ speakers: speakerRefs })
        .commit()
    }

    // Fetch the updated proposal
    const { proposal } = await getProposal({
      id: created._id,
      speakerId: session.speaker._id,
      isOrganizer: true,
    })

    // Revalidate the proposals list
    revalidatePath('/admin/proposals')

    return {
      success: true,
      proposal: proposal || created,
    }
  } catch (error) {
    console.error('Error creating proposal as admin:', error)

    if (error instanceof Error) {
      // Handle Sanity-specific errors
      if (error.message.includes('validation')) {
        return {
          success: false,
          error: 'Validation error: Please check all required fields',
        }
      }
      if (error.message.includes('reference')) {
        return { success: false, error: 'Invalid speaker reference' }
      }
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Failed to create proposal' }
  }
}

export async function updateProposalAsAdmin(
  proposalId: string,
  proposalData: ProposalInput,
  speakerIds: string[],
): Promise<{ success: boolean; proposal?: ProposalExisting; error?: string }> {
  try {
    // Verify admin authorization
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return { success: false, error: 'Unauthorized - Admin access required' }
    }

    // Validate required fields
    if (!proposalData.title || proposalData.title.trim() === '') {
      return { success: false, error: 'Title is required' }
    }
    if (!proposalData.format) {
      return { success: false, error: 'Format is required' }
    }
    if (!proposalData.level) {
      return { success: false, error: 'Level is required' }
    }
    if (!proposalData.tos) {
      return { success: false, error: 'Terms of service must be accepted' }
    }
    if (!speakerIds || speakerIds.length === 0) {
      return { success: false, error: 'At least one speaker is required' }
    }

    // Fetch existing proposal to verify it exists
    const { proposal: existingProposal, proposalError } = await getProposal({
      id: proposalId,
      speakerId: session.speaker._id,
      isOrganizer: true,
    })

    if (proposalError || !existingProposal) {
      return {
        success: false,
        error:
          typeof proposalError === 'string'
            ? proposalError
            : proposalError?.message || 'Proposal not found',
      }
    }

    // Prepare speaker references
    const speakerItems = speakerIds.map(
      (id) => ({ _type: 'reference', _ref: id }) as Reference,
    )

    // Update the proposal with new data and speaker references
    const { proposal: updated, err } = await updateProposal(
      proposalId,
      {
        ...proposalData,
        speakers: speakerItems,
      },
      session.speaker._id,
    )

    if (err || !updated) {
      return {
        success: false,
        error:
          typeof err === 'string'
            ? err
            : err?.message || 'Failed to update proposal',
      }
    }

    // Fetch the fully updated proposal with expanded references
    const { proposal } = await getProposal({
      id: proposalId,
      speakerId: session.speaker._id,
      isOrganizer: true,
    })

    // Revalidate paths
    revalidatePath('/admin/proposals')
    revalidatePath(`/admin/proposals/${proposalId}`)

    return {
      success: true,
      proposal: proposal || updated,
    }
  } catch (error) {
    console.error('Error updating proposal as admin:', error)

    if (error instanceof Error) {
      // Handle Sanity-specific errors
      if (error.message.includes('validation')) {
        return {
          success: false,
          error: 'Validation error: Please check all required fields',
        }
      }
      if (error.message.includes('reference')) {
        return { success: false, error: 'Invalid speaker reference' }
      }
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Failed to update proposal' }
  }
}
