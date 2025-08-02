/**
 * Centralized utils exports
 */

export {
  convertJsonToProposal,
  convertStringToPortableTextBlocks,
  validateProposal,
} from './validation'

export {
  isFromDifferentConference,
  isCfpEnded,
  isProposalReadOnly,
} from './state'

export * from './validation'
