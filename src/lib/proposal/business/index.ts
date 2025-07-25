/**
 * Centralized business logic exports
 */

export {
  actionStateMachine,
  getAllowedActions,
  isActionAllowed,
} from './state-machine'

export {
  calculateAverageRating,
  getProposalSpeakerNames,
  requiresTravelFunding,
  getProposalSummary,
  groupProposalsByStatus,
  sortProposals,
} from './utils'

// Legacy export for backward compatibility
export { actionStateMachine as actionStateMachineLegacy } from './states'
