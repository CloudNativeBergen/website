/**
 * Centralized data layer exports
 */

// Client-side API functions
export {
  getProposal as getProposalClient,
  postProposal,
  postProposalAction,
  adminFetchNextUnreviewedProposal,
  adminSearchProposals,
  type NextUnreviewedProposalResponse,
} from './client'

// Server-side response utilities
export {
  proposalResponseError,
  proposalResponse,
  proposalListResponseError,
  proposalListResponse,
} from './server'

// Sanity CMS operations
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
} from './sanity'
