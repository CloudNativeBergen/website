/**
 * Client-safe proposal library exports
 * This file only exports functionality that is safe to use on the client side
 */

// Core types
export * from './types'
export * from './ui/config'

// UI Components and styling
export * from './ui'

// Business logic
export * from './business'

// Data layer - client-side functions only
export {
  getProposal as getProposalClient,
  postProposal,
  postProposalAction,
  adminFetchNextUnreviewedProposal,
  adminSearchProposals,
  type NextUnreviewedProposalResponse,
} from './data/client'

// Email types only (not the functions that require server-side config)
export {
  createTemplateProps,
  type BaseEmailTemplateProps,
  type ProposalAcceptTemplateProps,
  type ProposalRejectTemplateProps,
  type NotificationEventData,
  type NotificationParams,
} from './email/types'

// Utilities
export * from './utils'
