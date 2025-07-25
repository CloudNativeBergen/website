/**
 * Server-only proposal library exports
 * This file exports functionality that requires server-side environment variables
 */

// Server-side data operations
export {
  getProposal as getProposalSanity,
  getProposals,
  updateProposal,
  deleteProposal,
  updateProposalStatus,
  createProposal,
  fetchNextUnreviewedProposal,
  searchProposals,
  fixProposalSpeakerKeys,
} from './data/sanity'

// Server response utilities
export {
  proposalResponseError,
  proposalResponse,
  proposalListResponseError,
  proposalListResponse,
} from './data/server'

// Email functionality (requires server-side config)
export { sendAcceptRejectNotification } from './email/notification'
