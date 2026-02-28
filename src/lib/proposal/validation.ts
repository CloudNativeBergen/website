import { ProposalInput } from './types'

export const PROPOSAL_VALIDATION_MESSAGES = {
  TITLE_REQUIRED: 'Title is required',
  DESCRIPTION_REQUIRED: 'Description is required',
  FORMAT_REQUIRED: 'Format must be specified',
  LEVEL_REQUIRED: 'Level must be specified',
  AUDIENCE_REQUIRED: 'At least one audience must be specified',
  TOPICS_REQUIRED: 'At least one topic is required',
  SPEAKERS_REQUIRED: 'At least one speaker is required',
  TOS_REQUIRED: 'You must accept the terms of service',
} as const

export function validateProposalForm(
  proposal: ProposalInput,
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!proposal.title || proposal.title.trim() === '') {
    errors.title = PROPOSAL_VALIDATION_MESSAGES.TITLE_REQUIRED
  }

  if (!proposal.description || proposal.description.length === 0) {
    errors.description = PROPOSAL_VALIDATION_MESSAGES.DESCRIPTION_REQUIRED
  }

  if (!proposal.format) {
    errors.format = PROPOSAL_VALIDATION_MESSAGES.FORMAT_REQUIRED
  }

  if (!proposal.level) {
    errors.level = PROPOSAL_VALIDATION_MESSAGES.LEVEL_REQUIRED
  }

  if (!proposal.audiences || proposal.audiences.length === 0) {
    errors.audiences = PROPOSAL_VALIDATION_MESSAGES.AUDIENCE_REQUIRED
  }

  if (!proposal.topics || proposal.topics.length === 0) {
    errors.topics = PROPOSAL_VALIDATION_MESSAGES.TOPICS_REQUIRED
  }

  if (!proposal.tos) {
    errors.tos = PROPOSAL_VALIDATION_MESSAGES.TOS_REQUIRED
  }

  return errors
}

export function validateProposalForAdmin(
  proposal: ProposalInput,
  speakerIds: string[],
): Record<string, string> {
  const errors = validateProposalForm(proposal)

  if (!speakerIds || speakerIds.length === 0) {
    errors.speakers = PROPOSAL_VALIDATION_MESSAGES.SPEAKERS_REQUIRED
  }

  return errors
}
