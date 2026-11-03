/**
 * Speaker domain seam (#1772). Call sites read speakers through this module so
 * the backing store can later move from Sanity to the konf API, the way
 * conference public reads did (`src/lib/conference/konf-api.ts`). Today every
 * function here is Sanity-backed and behaves exactly as the function it wraps.
 *
 * Return types name the fields a caller may rely on, shaped like the future
 * GraphQL type, so a second backend only has to produce these fields.
 *
 * Server-only functions (the public profile, writes that create) live in
 * `./server`.
 */
import type { ProposalExisting } from '@/lib/proposal/types'
import * as store from './sanity'
import type { DuplicateSpeakerInput } from './duplicates'
import type { SpeakerUpdateActor } from './socialTag'
import type {
  Speaker,
  SpeakerAdminDetail,
  SpeakerInput,
  TicketEmailGrant,
} from './types'

// --- Shared result shapes -------------------------------------------------

/** A speaker together with their proposals in the requested scope. */
export type SpeakerWithProposals = Speaker & { proposals: ProposalExisting[] }

export interface SpeakerResult {
  speaker: Speaker | null
  err: Error | null
}

export interface SpeakerListResult {
  speakers: SpeakerWithProposals[]
  err: Error | null
}

export interface OrganizerListResult {
  speakers: Speaker[]
  err: Error | null
}

// --- Public and admin speaker lists ---------------------------------------

/**
 * Speakers with a talk in one of `statuses`, scoped to `conferenceId` or, with
 * only `orgId`, to the org's conferences. Cached.
 */
export function getSpeakers(
  ...args: Parameters<typeof store.getSpeakers>
): Promise<SpeakerListResult> {
  return store.getSpeakers(...args)
}

/** {@link getSpeakers} read past the cache, for admin mutations. */
export function getSpeakersUncached(
  ...args: Parameters<typeof store.getSpeakersUncached>
): Promise<SpeakerListResult> {
  return store.getSpeakersUncached(...args)
}

/** Speakers with an accepted or confirmed talk. */
export function getSpeakersWithAcceptedTalks(
  ...args: Parameters<typeof store.getSpeakersWithAcceptedTalks>
): Promise<SpeakerListResult> {
  return store.getSpeakersWithAcceptedTalks(...args)
}

/** Every speaker in the org, for the admin directory. */
export function getOrgSpeakerDirectory(
  orgId: string | null | undefined,
): Promise<{ speakers: store.OrgDirectorySpeaker[]; err: Error | null }> {
  return store.getOrgSpeakerDirectory(orgId)
}

/** The org's speaker records that duplicate detection compares. */
export function getDuplicateSpeakerCandidateRecords(
  orgId: string | null | undefined,
): Promise<{ records: DuplicateSpeakerInput[]; err: Error | null }> {
  return store.getDuplicateSpeakerCandidateRecords(orgId)
}

// --- Organizers -----------------------------------------------------------

export function getOrganizers(
  orgId: string | null | undefined,
): Promise<OrganizerListResult> {
  return store.getOrganizers(orgId)
}

export function getOrganizersByConference(
  conferenceId: string,
): Promise<OrganizerListResult> {
  return store.getOrganizersByConference(conferenceId)
}

/** Organizer seats the conference allocates a free ticket to. */
export function getOrganizerCount(
  conferenceId: string | null | undefined,
): Promise<{ count: number; err: Error | null }> {
  return store.getOrganizerCount(conferenceId)
}

// --- One speaker by id ----------------------------------------------------

/** One speaker by id, from the live API (authorization-bearing reads). */
export function getSpeaker(speakerId: string): Promise<SpeakerResult> {
  return store.getSpeaker(speakerId)
}

/** One speaker's admin detail, only when they belong to `orgId`. */
export function getSpeakerAdminDetail(
  speakerId: string,
  orgId: string,
): Promise<{ speaker: SpeakerAdminDetail | null; err: Error | null }> {
  return store.getSpeakerAdminDetail(speakerId, orgId)
}

/** The addresses a speaker's free ticket may be claimed with. */
export function getSpeakerTicketGrantState(speakerId: string): Promise<{
  email: string
  knownEmails: string[]
  grants: TicketEmailGrant[]
} | null> {
  return store.getSpeakerTicketGrantState(speakerId)
}

/** Whether an address already belongs to a speaker, for organizer create. */
export function findSpeakerByEmailForOrganizerCreate(
  email: string,
  orgId: string,
): Promise<store.ExistingSpeakerForEmail | null> {
  return store.findSpeakerByEmailForOrganizerCreate(email, orgId)
}

// --- Writes ---------------------------------------------------------------

/**
 * Patch a speaker. `actor` decides which fields the caller may change; see
 * `updateSpeaker` in `./sanity`.
 */
export function updateSpeaker(
  speakerId: string,
  speaker: Partial<SpeakerInput>,
  options: { actor: SpeakerUpdateActor },
): Promise<{ speaker: Speaker; err: Error | null; committed: boolean }> {
  return store.updateSpeaker(speakerId, speaker, options)
}
