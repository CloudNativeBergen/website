import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createSponsorActivity } from './activity'

/**
 * Renewal (R1/R2, #1687). Every edition is its own conference on its own
 * domain, so "next" and "previous" edition mean the neighbouring conference of
 * the same organization by `startDate`. Every read here is org-scoped through
 * `scopedFetch`; no conference id ever comes from the client.
 */

// ponytail: no conference setting for when sponsor outreach starts
// (`sponsorDeadlineDate` is the signing deadline), so renewal reminders open a
// fixed 6 months before `startDate`. Add a conference field if editions differ.
export const RENEWAL_LEAD_MONTHS = 6

/** True from `RENEWAL_LEAD_MONTHS` before `startDate` onwards. */
export function isRenewalWindowOpen(startDate: string, now = new Date()) {
  const opens = new Date(startDate)
  opens.setUTCMonth(opens.getUTCMonth() - RENEWAL_LEAD_MONTHS)
  return now >= opens
}

export interface EditionRef {
  _id: string
  title: string
  domain?: string
}

export interface RenewalSource {
  _id: string
  sponsor: { _ref: string }
  sponsorName?: string
  assignedTo?: { _ref: string }
  contactPersons?: unknown[]
  billing?: unknown
  tierTitle?: string
  conference: EditionRef & { startDate: string; endDate?: string }
}

export interface NextEdition extends EditionRef {
  organizers?: string[]
  /** This sponsor's deal in the next edition, if it already has one. */
  existingId?: string
  /** A tier in the next edition with the same title as the source tier. */
  tierId?: string
}

/**
 * The source record (must belong to `conferenceId`, the current domain's
 * conference, which must belong to `orgId`) and the org's next edition.
 */
export async function getRenewalContext(
  orgId: string,
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<{ source: RenewalSource | null; next: NextEdition | null }> {
  const conference = await scopedFetch<
    (EditionRef & { startDate: string; endDate?: string }) | null
  >(
    clientReadUncached,
    { orgId },
    `*[_type == "conference" && _id == $conferenceId][0]{ _id, title, startDate, endDate, "domain": domains[0] }`,
    { conferenceId },
  )
  if (!conference) return { source: null, next: null }

  const source = await clientReadUncached.fetch<Omit<
    RenewalSource,
    'conference'
  > | null>(
    // groq-global-scoped: `conference._ref == $conferenceId` IS the tenant
    // predicate; the org-scoped read above proved the conference ours.
    `*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId][0]{
      _id, sponsor, "sponsorName": sponsor->name, assignedTo,
      contactPersons, billing, "tierTitle": tier->title
    }`,
    { id: sponsorForConferenceId, conferenceId },
  )
  if (!source) return { source: null, next: null }

  const next = await scopedFetch<NextEdition | null>(
    clientReadUncached,
    { orgId },
    // groq-global-scoped: the nested reads hang off `^._id`, the next edition
    // the org-scoped root filter returned.
    `*[_type == "conference" && startDate > $startDate] | order(startDate asc)[0]{
      _id, title, "domain": domains[0], "organizers": organizers[]._ref,
      "existingId": *[_type == "sponsorForConference" && conference._ref == ^._id && conference->organization._ref == $orgId && sponsor._ref == $sponsorId][0]._id,
      "tierId": *[_type == "sponsorTier" && conference._ref == ^._id && conference->organization._ref == $orgId && title == $tierTitle][0]._id
    }`,
    {
      startDate: conference.startDate,
      sponsorId: source.sponsor._ref,
      tierTitle: source.tierTitle ?? '',
    },
  )
  return { source: { ...source, conference }, next }
}

/**
 * The new prospect for the next edition. Copies only the sponsor, owner (if
 * they organize the next edition), contacts, billing and a same-title tier;
 * never contract, signature, invoice, discount codes, tokens or activities.
 */
export function buildRenewalDoc(source: RenewalSource, next: NextEdition) {
  const ownerId = source.assignedTo?._ref
  const keepOwner = !!ownerId && !!next.organizers?.includes(ownerId)
  return {
    _type: 'sponsorForConference' as const,
    sponsor: { _type: 'reference' as const, _ref: source.sponsor._ref },
    conference: { _type: 'reference' as const, _ref: next._id },
    status: 'prospect' as const,
    invoiceStatus: 'not-sent' as const,
    ...(keepOwner && {
      assignedTo: { _type: 'reference' as const, _ref: ownerId },
    }),
    ...(next.tierId && {
      tier: { _type: 'reference' as const, _ref: next.tierId },
    }),
    ...(source.contactPersons && { contactPersons: source.contactPersons }),
    ...(source.billing ? { billing: source.billing } : {}),
  }
}

export async function copyToNextEdition(
  source: RenewalSource,
  next: NextEdition,
  userId: string,
): Promise<string> {
  const created = await clientWrite.create(buildRenewalDoc(source, next))
  await Promise.all([
    createSponsorActivity(
      created._id,
      'note',
      `Copied from ${source.conference.title}`,
      userId,
    ),
    createSponsorActivity(
      source._id,
      'note',
      `Copied to ${next.title}`,
      userId,
    ),
  ])
  return created._id
}

export interface RenewalCandidate {
  _id: string
  name: string
  assignedTo?: { _id: string; name: string; image?: string }
}

export interface PreviousEditionRenewals {
  edition: EditionRef
  candidates: RenewalCandidate[]
}

/**
 * The previous edition of `$orgId` before `$conferenceId`, and its closed-won
 * sponsors with no deal (any status) in `$conferenceId`. A root of its own, so
 * the `/admin` dashboard composes it into its single query.
 */
export const PREVIOUS_EDITION_RENEWALS_ROOT = `*[_type == "conference" && organization._ref == $orgId && startDate < *[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0].startDate] | order(startDate desc)[0]{
  "currentStartDate": *[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0].startDate,
  "edition": { _id, title, "domain": domains[0] },
  "candidates": *[_type == "sponsorForConference" && conference._ref == ^._id && conference->organization._ref == $orgId && status == "closed-won"
    && !(sponsor._ref in *[_type == "sponsorForConference" && conference._ref == $conferenceId].sponsor._ref)]{
    _id, "name": sponsor->name, assignedTo->{ _id, name, image }
  }
}`

export type PreviousEditionRenewalsRow =
  (PreviousEditionRenewals & { currentStartDate?: string }) | null

/** Null outside the lead window. */
export function shapeRenewals(
  row: PreviousEditionRenewalsRow | undefined,
  now = new Date(),
): PreviousEditionRenewals | null {
  if (!row?.currentStartDate) return null
  if (!isRenewalWindowOpen(row.currentStartDate, now)) return null
  return { edition: row.edition, candidates: row.candidates ?? [] }
}

/** ONE query, for the CRM board. */
export async function getPreviousEditionRenewals(
  orgId: string,
  conferenceId: string,
  now = new Date(),
): Promise<PreviousEditionRenewals | null> {
  if (!orgId || !conferenceId) return null // FAIL CLOSED: no tenant, no read.
  const row = await clientReadUncached.fetch<PreviousEditionRenewalsRow>(
    PREVIOUS_EDITION_RENEWALS_ROOT,
    { orgId, conferenceId },
  )
  return shapeRenewals(row, now)
}
