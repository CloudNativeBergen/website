import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { findOutboundOrigin } from '@/lib/conference/baseUrl'
import { osloTodayDateString } from '@/lib/time'
import { createSponsorActivity } from './activity'

/**
 * Renewal (R1/R2, #1687). Every edition is its own conference on its own
 * domain, so "next" and "previous" edition mean the neighbouring conference of
 * the same organization by `startDate`. Every read here is org-scoped; no
 * conference id ever comes from the client.
 */

interface RenewalWindowConference {
  startDate?: string
  sponsorRenewalLeadMonths?: number
}

/** Months before `startDate` the renewal window opens; 6 when unset. */
export function renewalLeadMonths(conference: RenewalWindowConference) {
  const n = conference.sponsorRenewalLeadMonths
  return Number.isInteger(n) && n! >= 1 && n! <= 12 ? n! : 6
}

/** True from `renewalLeadMonths` before `startDate` onwards, by Oslo date. */
export function isRenewalWindowOpen(
  conference: RenewalWindowConference,
  now = new Date(),
) {
  const { startDate } = conference
  if (!startDate) return false
  // `startDate` is a plain Oslo date; do the month arithmetic on it as a
  // calendar date and compare with today's Oslo date.
  const [y, m, d] = startDate.slice(0, 10).split('-').map(Number)
  const month = m - 1 - renewalLeadMonths(conference)
  // Clamp to the target month's last day: 31 Aug minus 6 months is 28 Feb,
  // not the 3 March a plain month shift would overflow to.
  const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate()
  const opens = new Date(Date.UTC(y, month, Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10)
  return osloTodayDateString(now) >= opens
}

/** `endDate` is a plain Oslo date: the event has ended from the next day on. */
export function hasEnded(endDate?: string, now = new Date()) {
  return !!endDate && endDate.slice(0, 10) < osloTodayDateString(now)
}

interface EditionRow {
  _id: string
  title: string
  domains?: string[]
}

export interface RenewalSource {
  _id: string
  sponsor: { _ref: string }
  sponsorName?: string
  assignedTo?: { _ref: string }
  contactPersons?: unknown[]
  billing?: unknown
  tierTitle?: string
  conference: EditionRow & { startDate: string; endDate?: string }
}

export interface NextEdition extends EditionRow {
  organizers?: string[]
  /** This sponsor's deal in the next edition, if it already has one. */
  existingId?: string
  /** A tier in the next edition with the same title as the source tier. */
  tierId?: string
}

/**
 * The source record (must belong to `conferenceId`, the current domain's
 * conference, which must belong to `orgId`) and, once that conference has
 * ended, the org's next edition. Before that `next` is not read.
 */
export async function getRenewalContext(
  orgId: string,
  conferenceId: string,
  sponsorForConferenceId: string,
  now = new Date(),
): Promise<{ source: RenewalSource | null; next: NextEdition | null }> {
  const conference = await scopedFetch<
    (EditionRow & { startDate: string; endDate?: string }) | null
  >(
    clientReadUncached,
    { orgId },
    `*[_type == "conference" && _id == $conferenceId][0]{ _id, title, startDate, endDate, domains }`,
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
  if (!hasEnded(conference.endDate, now)) {
    return { source: { ...source, conference }, next: null }
  }

  const next = await scopedFetch<NextEdition | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "conference" && startDate > $startDate && !(_id in path("drafts.**"))] | order(startDate asc)[0]{
      _id, title, domains, "organizers": organizers[]._ref,
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
 * The same context, seen from the next edition's board: the source record
 * must belong to the org edition right before `current`, and that edition's
 * next must be `current`. Anything else is not found.
 */
export async function getRenewalContextIntoCurrent(
  orgId: string,
  current: { _id: string; startDate?: string },
  sponsorForConferenceId: string,
  now = new Date(),
): Promise<{ source: RenewalSource | null; next: NextEdition | null }> {
  const none = { source: null, next: null }
  if (!current.startDate) return none
  const previous = await scopedFetch<{ _id: string } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "conference" && startDate < $startDate && !(_id in path("drafts.**"))] | order(startDate desc)[0]{ _id }`,
    { startDate: current.startDate },
  )
  if (!previous) return none
  const context = await getRenewalContext(
    orgId,
    previous._id,
    sponsorForConferenceId,
    now,
  )
  if (!context.source) return none
  // `next` is null until last edition has ended: let the route say so.
  if (context.next && context.next._id !== current._id) return none
  return context
}

/** Deterministic, so two organizers copying at once land on one record. */
export function renewalDocId(nextId: string, sponsorId: string) {
  return `sfc-renewal-${nextId}-${sponsorId}`
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
    _id: renewalDocId(next._id, source.sponsor._ref),
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

/** Returns the record id and whether this call created it. */
export async function copyToNextEdition(
  source: RenewalSource,
  next: NextEdition,
  userId: string,
): Promise<{ id: string; created: boolean }> {
  const doc = buildRenewalDoc(source, next)
  // `create` with the deterministic id is atomic: the second of two racing
  // organizers gets a 409 and is handed the record the first one made.
  // (`createIfNotExists` would not say which call created it, so the
  // activities could be logged twice.)
  let created = true
  try {
    await clientWrite.create(doc)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 409) throw error
    created = false
  }
  if (created) {
    await Promise.all([
      createSponsorActivity(
        doc._id,
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
  }
  return { id: doc._id, created }
}

export interface RenewalCandidate {
  _id: string
  name: string
  tierTitle?: string
  assignedTo?: { _id: string; name: string; image?: string }
}

export interface PreviousEditionRenewals {
  /** `origin` is null when no domain derives a usable URL: hide the link. */
  edition: {
    _id: string
    title: string
    origin: string | null
    /** False until the edition is over; renewing is refused before that. */
    ended: boolean
  }
  candidates: RenewalCandidate[]
}

/**
 * The previous edition of `$orgId` before `$currentStartDate`, and its
 * closed-won sponsors with no deal (any status) in `$conferenceId`. A root of
 * its own, so the `/admin` dashboard composes it into its single query.
 */
export const PREVIOUS_EDITION_RENEWALS_ROOT = `*[_type == "conference" && organization._ref == $orgId && startDate < $currentStartDate && !(_id in path("drafts.**"))] | order(startDate desc)[0]{
  _id, title, domains, endDate,
  "candidates": *[_type == "sponsorForConference" && conference._ref == ^._id && conference->organization._ref == $orgId && status == "closed-won"
    && !(sponsor._ref in *[_type == "sponsorForConference" && conference._ref == $conferenceId].sponsor._ref)]{
    _id, "name": sponsor->name, "tierTitle": tier->title, assignedTo->{ _id, name, "image": coalesce(image.asset->url, imageURL) }
  }
}`

export type PreviousEditionRenewalsRow =
  (EditionRow & { endDate?: string; candidates?: RenewalCandidate[] }) | null

export function shapeRenewals(
  row: PreviousEditionRenewalsRow | undefined,
  now = new Date(),
): PreviousEditionRenewals | null {
  if (!row) return null
  return {
    edition: {
      _id: row._id,
      title: row.title,
      origin: findOutboundOrigin(row),
      ended: hasEnded(row.endDate, now),
    },
    candidates: row.candidates ?? [],
  }
}

/** ONE query, for the CRM board. Null outside the lead window. */
export async function getPreviousEditionRenewals(
  orgId: string,
  conference: { _id: string } & RenewalWindowConference,
  now = new Date(),
): Promise<PreviousEditionRenewals | null> {
  if (!orgId || !conference._id) return null // FAIL CLOSED: no tenant.
  if (!isRenewalWindowOpen(conference, now)) return null
  const row = await clientReadUncached.fetch<PreviousEditionRenewalsRow>(
    PREVIOUS_EDITION_RENEWALS_ROOT,
    {
      orgId,
      conferenceId: conference._id,
      currentStartDate: conference.startDate,
    },
  )
  return shapeRenewals(row, now)
}
