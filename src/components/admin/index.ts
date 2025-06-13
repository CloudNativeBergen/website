/**
 * Admin Components Index
 *
 * This file exports all admin-specific components to keep them organized
 * and provide a clean import interface for admin pages.
 */

// Layout Components
export { AdminLayout } from './AdminLayout'
export { AdminActionBar } from './AdminActionBar'

// Proposal Management Components
export { ProposalsList } from './ProposalsList'
export { ProposalCard } from './ProposalCard'
export { ProposalDetail } from './ProposalDetail'
export { ProposalPreview } from './ProposalPreview'
export { ProposalsPageClient } from './ProposalsPageClient'
export { ProposalsFilter } from './ProposalsFilter'
export { FilterDropdown } from './FilterDropdown'
export { BackToProposalsButton } from './BackToProposalsButton'

// Review Management Components
export { ProposalReviewPanel } from './ProposalReviewPanel'
export { ProposalReviewSummary } from './ProposalReviewSummary'
export { ProposalReviewForm } from './ProposalReviewForm'
export { ProposalReviewList } from './ProposalReviewList'
export { ProposalActionModal } from './ProposalActionModal'

// Speaker Management Components
export { SpeakerTable } from './SpeakerTable'

// Utility Components
export { ErrorDisplay } from './ErrorDisplay'

// Hooks
export {
  useFilterState,
  useFilterStateWithURL,
  useProposalFiltering,
} from './hooks'

// Types and Utils
export type { FilterState } from './ProposalsFilter'
export * from './utils'
