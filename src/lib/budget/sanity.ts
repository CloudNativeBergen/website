import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { CONFERENCE_FILTER } from '@/lib/sanity/scoped'
import { defaultBudgetSeed } from './defaults'
import type { ConferenceBudgetDocument } from './types'

/**
 * Data access for `conferenceBudget` documents.
 *
 * Reads are UNCACHED: the budget page is an admin-only surface that must
 * reflect edits immediately, and the live income feeds beside it are
 * fetched fresh anyway. (If this ever moves behind `'use cache'`, the
 * resolver MUST `cacheTag(conferenceTag(conferenceId))` per house rules.)
 *
 * The budget document is always resolved BY CONFERENCE ID (which callers
 * derive from the request domain) - document ids are never accepted from
 * the client.
 */

// Tenant-scoped root filter (composed like src/lib/messaging/sanity.ts).
const BUDGET_FILTER = `_type == "conferenceBudget" && ${CONFERENCE_FILTER}`
const BUDGET_QUERY = `*[${BUDGET_FILTER}][0]`

/** Thrown when patching a conference that has no budget document yet. */
export class BudgetNotFoundError extends Error {
  constructor() {
    super('No budget exists for this conference')
    this.name = 'BudgetNotFoundError'
  }
}

export async function getBudgetForConference(
  conferenceId: string,
): Promise<ConferenceBudgetDocument | null> {
  const doc = await clientRead.fetch<ConferenceBudgetDocument | null>(
    BUDGET_QUERY,
    { conferenceId },
  )
  return doc ?? null
}

/**
 * Deterministic document id: makes budget creation naturally idempotent
 * and guarantees at most ONE budget per conference even under concurrent
 * "Create budget" clicks (a plain check-then-create would race and leave
 * two documents behind an unordered `[0]` query).
 */
export function budgetDocumentId(conferenceId: string): string {
  return `conferenceBudget-${conferenceId}`
}

/**
 * Create a budget for the conference, seeded with the default template.
 * Idempotent: `createIfNotExists` on the deterministic id is atomic, so a
 * concurrent create cannot produce a duplicate document.
 */
export async function createBudgetForConference(
  conferenceId: string,
): Promise<ConferenceBudgetDocument> {
  const existing = await getBudgetForConference(conferenceId)
  if (existing) return existing

  const doc = {
    _id: budgetDocumentId(conferenceId),
    ...defaultBudgetSeed(),
    conference: { _type: 'reference', _ref: conferenceId },
  }
  await clientWrite.createIfNotExists(doc)
  // Re-read: if a concurrent create won the race, return THAT document.
  const created = await getBudgetForConference(conferenceId)
  if (!created) {
    throw new Error('Budget creation failed')
  }
  return created
}

/**
 * Patch fields on the conference's budget document. Only the provided
 * fields are set. Throws if the conference has no budget yet.
 */
export async function patchBudgetForConference(
  conferenceId: string,
  fields: Partial<
    Pick<
      ConferenceBudgetDocument,
      | 'vatRate'
      | 'ticketingFeeRate'
      | 'dinnerParticipation'
      | 'ticketTypes'
      | 'sponsorTierAssumptions'
      | 'sponsorAddonAssumptions'
      | 'variableCosts'
      | 'fixedCosts'
      | 'scenarios'
    >
  >,
): Promise<ConferenceBudgetDocument> {
  const existing = await getBudgetForConference(conferenceId)
  if (!existing) {
    throw new BudgetNotFoundError()
  }
  const result = await clientWrite.patch(existing._id).set(fields).commit()
  return result as unknown as ConferenceBudgetDocument
}
