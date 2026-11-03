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
 * Sanity refs. Organizer and speaker reads still return `ProposalExisting`
 * (re-exported from `./types`) until they get their own projection (#1887).
 */
import 'server-only'
import type { ProposalExisting, ProposalInput, Status } from './types'
import * as store from './data/sanity'
import { toPublicTalk, type PublicTalk } from './public'

export { sendAcceptRejectNotification } from './email/notification'
/** Thrown by {@link deleteProposal}; re-exported so `instanceof` holds. */
export {
  ProposalDeletionBlockedError,
  buildProposalDocument,
} from './data/sanity'
export type { ProposalExisting, ProposalInput } from './types'

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
