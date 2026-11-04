/**
 * Talks (proposals) domain seam (#1772, #1876). Server code reads and writes
 * proposals through this module so the backing store can later move from
 * Sanity to the konf API without touching callers again. Today every function
 * here is Sanity-backed and behaves exactly as the function it wraps.
 *
 * This lives in `server.ts`, not `index.ts`: the `@/lib/proposal` barrel is
 * imported by client components, and the seam pulls in the Sanity write client.
 *
 * Public reads return `PublicTalk` (`./public`): plain, serializable, no
 * Sanity refs. The admin proposal list returns `OrganizerProposal`
 * (`./organizer`). Other organizer and speaker reads still return
 * `ProposalExisting` (re-exported from `./types`) until they get their own
 * projection (#1887).
 */
import 'server-only'
import type { ProposalExisting, ProposalInput, Status } from './types'
import * as store from './data/sanity'
import { toPublicTalk, type PublicTalk } from './public'
import {
  toOrganizerProposal,
  toOrganizerProposalDetail,
  type OrganizerProposal,
  type OrganizerProposalDetail,
} from './organizer'
import { filterProposals, type ProposalFilters } from './utils/filtering'

export { sendAcceptRejectNotification } from './email/notification'
/** Thrown by {@link deleteProposal}; re-exported so `instanceof` holds. */
export {
  ProposalDeletionBlockedError,
  buildProposalDocument,
} from './data/sanity'
export type { ProposalExisting, ProposalInput } from './types'
export type { OrganizerProposal, OrganizerProposalDetail } from './organizer'

export interface ProposalResult {
  proposal: ProposalExisting
  err: Error | null
}

export interface ProposalListResult {
  proposals: ProposalExisting[]
  proposalsError: Error | null
}

// --- Public program and talk reads ----------------------------------------

/**
 * Confirmed talks in `conferenceId` by `speakerId`, as {@link PublicTalk}.
 * `conferenceId` must come from the server (the domain conference).
 */
export async function listPublicTalks(
  conferenceId: string,
  { speakerId }: { speakerId: string },
): Promise<{ talks: PublicTalk[]; err: Error | null }> {
  const { talks, err } = await store.listPublicTalks(conferenceId, speakerId)
  return { talks: talks.map(toPublicTalk), err }
}

/** Listed workshops in a conference; `includeCanceled` for the admin view. */
export function getWorkshops(
  args: Parameters<typeof store.getWorkshops>[0],
): Promise<{ workshops: ProposalExisting[]; workshopsError: Error | null }> {
  return store.getWorkshops(args)
}

// --- Proposal lists (public program, speaker's own, admin) ----------------

/**
 * Proposals in one tenant scope (`conferenceId`, or `orgId` for the speaker's
 * cross-edition list), optionally narrowed to `speakerId`, statuses and formats.
 */
export function getProposals(
  args: Parameters<typeof store.getProposals>[0],
): Promise<ProposalListResult> {
  return store.getProposals(args)
}

// --- Organizer reads ------------------------------------------------------

/**
 * Every non-draft proposal in `conferenceId`, as {@link OrganizerProposal},
 * with reviews. `conferenceId` must come from the server
 * (`resolveConferenceId()`), never from the client. With `filters`, the list
 * is filtered and sorted server-side; `reviewerId` backs the review-status
 * filter.
 */
export async function listOrganizerProposals(
  conferenceId: string,
  filters?: ProposalFilters,
  reviewerId?: string,
): Promise<{ proposals: OrganizerProposal[]; proposalsError: Error | null }> {
  const { proposals, proposalsError } = await store.getProposals({
    conferenceId,
    returnAll: true,
    includeReviews: true,
    includePreviousAcceptedTalks: true,
  })
  const mapped = proposals.map(toOrganizerProposal)
  return {
    proposals: filters ? filterProposals(mapped, filters, reviewerId) : mapped,
    proposalsError,
  }
}

/**
 * One proposal for the organizer detail page, ORG-SCOPED (B1, #642) to `orgId`,
 * the server-resolved organization of the domain conference. Organization, not
 * conference: `previousAcceptedTalks` links to earlier editions of the same org.
 * A foreign-org id reads `null` exactly like a nonexistent one; a null org
 * fails closed.
 */
export async function getOrganizerProposal(
  orgId: string | null,
  id: string,
): Promise<{
  proposal: OrganizerProposalDetail | null
  proposalError: Error | null
}> {
  if (!orgId) return { proposal: null, proposalError: null }
  const { proposal, proposalError } = await store.getProposal({
    id,
    speakerId: '',
    isOrganizer: true,
    organizerOrgId: orgId,
    includeReviews: true,
    includePreviousAcceptedTalks: true,
    includeSubmittedTalks: true,
  })
  return {
    proposal: proposal ? toOrganizerProposalDetail(proposal) : null,
    proposalError,
  }
}

// --- One proposal (speaker's own or organizer detail) ---------------------

/**
 * One proposal, visible when `speakerId` is a speaker on it or, with
 * `isOrganizer`, when it belongs to `organizerOrgId`. Null result otherwise.
 */
export function getProposal(
  args: Parameters<typeof store.getProposal>[0],
): ReturnType<typeof store.getProposal> {
  return store.getProposal(args)
}

// --- Admin review -----------------------------------------------------------

/** The next proposal `reviewerId` has not reviewed in the conference. */
export function fetchNextUnreviewedProposal(
  args: Parameters<typeof store.fetchNextUnreviewedProposal>[0],
): ReturnType<typeof store.fetchNextUnreviewedProposal> {
  return store.fetchNextUnreviewedProposal(args)
}

/** Free-text search over a conference's proposals. */
export function searchProposals(
  args: Parameters<typeof store.searchProposals>[0],
): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  return store.searchProposals(args)
}

// --- Writes -----------------------------------------------------------------

/** Submit a new proposal. */
export function createProposal(
  proposal: ProposalInput,
  speakerId: string,
  conferenceId: string,
  initialStatus?: Status,
): Promise<ProposalResult> {
  return store.createProposal(proposal, speakerId, conferenceId, initialStatus)
}

/** Patch a proposal's content. */
export function updateProposal(
  proposalId: string,
  proposal: Partial<ProposalInput>,
): Promise<ProposalResult> {
  return store.updateProposal(proposalId, proposal)
}

/** Apply a status action; `ifRevisionId` makes it a compare-and-set. */
export function updateProposalStatus(
  proposalId: string,
  status: Status,
  withdrawnReason?: string,
  ifRevisionId?: string,
): Promise<ProposalResult> {
  return store.updateProposalStatus(
    proposalId,
    status,
    withdrawnReason,
    ifRevisionId,
  )
}

/** Delete a proposal; refuses with {@link ProposalDeletionBlockedError}. */
export function deleteProposal(
  proposalId: string,
): Promise<{ err: Error | null; conferenceId?: string | null }> {
  return store.deleteProposal(proposalId)
}

/** Mark that a speaker's ticket email went out for this proposal. */
export function recordSpeakerTicketEmailed(
  proposalId: string,
  marker: { speakerId: string; email: string },
): Promise<void> {
  return store.recordSpeakerTicketEmailed(proposalId, marker)
}

/**
 * {@link getProposal} under the name the organizer detail, the review flow and
 * status actions call it by. Same read; kept separate so those callers can move
 * to an organizer projection on their own.
 */
export function getProposalSanity(
  args: Parameters<typeof store.getProposal>[0],
): ReturnType<typeof store.getProposal> {
  return store.getProposal(args)
}
