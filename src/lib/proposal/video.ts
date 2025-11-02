import type { ProposalExisting } from './types'
import type { Attachment } from '@/lib/attachment/types'

/**
 * Get the primary video URL from a proposal
 * Uses the attachments array to find recording URLs
 */
export function getProposalVideoUrl(
  proposal: Pick<ProposalExisting, 'attachments'>,
): string | undefined {
  const recordingAttachment = proposal.attachments?.find(
    (a): a is Extract<Attachment, { _type: 'urlAttachment' }> =>
      a._type === 'urlAttachment' && a.attachmentType === 'recording',
  )

  return recordingAttachment?.url
}

/**
 * Check if a proposal has any video recordings
 * Checks the attachments array for recording URLs
 */
export function hasProposalVideo(
  proposal: Pick<ProposalExisting, 'attachments'>,
): boolean {
  return !!getProposalVideoUrl(proposal)
}
