/**
 * The admin dashboard's ONE composed read.
 *
 * WHY THIS EXISTS. Every dashboard widget used to call its own server action,
 * and every action re-ran the authorization gate, re-resolved the conference and
 * then issued 1-3 GROQ queries of its own. A default (7-widget) dashboard was
 * ~20 Sanity round-trips PER HUMAN PAGEVIEW, four of which each pulled the
 * ENTIRE proposal corpus through `getProposals({ returnAll: true })` — a
 * projection that dereferences speakers, the conference document, topics and
 * every co-speaker invitation — only to count rows by status.
 *
 * The shape here is the one `getConversationViewCounts`
 * (`src/lib/messaging/sanity.ts`) already proves: build ONE GROQ object
 * projection whose attributes are the roots the caller actually needs, and let
 * Sanity evaluate them all in a single request.
 *
 * TENANCY. Every root below carries an explicit `conference._ref ==
 * $conferenceId` predicate (or a `->` traversal to one). The tenant is ALWAYS a
 * GROQ parameter and always server-derived — {@link buildDashboardQuery} has no
 * way to express a tenant-free root, and the composed query is assembled from
 * the frozen literals in {@link DASHBOARD_ROOTS}, never from caller text.
 *
 * COST DISCIPLINE. `buildDashboardQuery` emits ONLY the roots it is asked for.
 * A widget that is not on the current dashboard contributes no source, so its
 * root is absent from the query — composing must not turn "read what this
 * dashboard shows" into "read everything".
 */

import { groq } from 'next-sanity'
import { Status } from '@/lib/proposal/types'
import type { TravelSupportStatus } from '@/lib/travel-support/types'
import { VolunteerStatus } from '@/lib/volunteer/types'
import { clientReadUncached } from '@/lib/sanity/client'

/*
 * Slice bounds are INTERPOLATED, not parameterised: GROQ rejects `[$a...$b]`
 * outright. Status values below are parameters — only the two numeric limits
 * here have to be spliced into the query text.
 */
/** Newest sponsor activities kept for the activity feed. */
export const RECENT_ACTIVITY_LIMIT = 15
/** Newest proposals mixed into the activity feed. */
export const RECENT_PROPOSALS_LIMIT = 5

/**
 * A GROQ root the composed query can carry. One key here == one attribute in
 * the emitted object projection == one root filter.
 */
export type DashboardGroqSource =
  | 'proposals'
  | 'reviews'
  | 'sponsors'
  | 'activities'
  | 'recentProposals'
  | 'travelSupports'
  | 'featuredSpeakerCount'
  | 'unassignedSponsorCount'
  | 'pendingVolunteerCount'

/* --------------------------------------------------------------------------
 * Row shapes
 * ------------------------------------------------------------------------ */

/**
 * The lean talk row that replaces four separate
 * `getProposals({ returnAll: true })` calls. Ordered `_updatedAt desc` because
 * review progress picks the FIRST unreviewed submitted proposal off this list
 * and that ordering is part of its contract; no other consumer depends on order.
 */
export interface DashboardProposalRow {
  _id: string
  title: string
  status: Status
  format: string
  _createdAt: string
  /**
   * Raw speaker REFERENCES (`speakers[]._ref`), not dereferenced speakers.
   * Proposal pipeline only ever needed the ids, and a dangling reference now
   * counts as the id it is instead of throwing on a `null` deref result.
   */
  speakerIds: string[] | null
}

/** A review score row, joined to its proposal in JS by `proposalId`. */
export interface DashboardReviewRow {
  proposalId: string | null
  score?: { content: number; relevance: number; speaker: number }
}

/** The sponsor fields the dashboard actually renders. */
export interface DashboardSponsorRow {
  _id: string
  status: string
  contractValue?: number
  sponsor?: { name?: string; logo?: string; logoBright?: string }
}

/** A sponsor CRM activity, flattened for the feed. */
export interface DashboardActivityRow {
  _id: string
  description: string
  createdAt?: string
  _createdAt: string
  sponsorName?: string
  createdByName?: string
}

/** Newest proposals for the activity feed (speaker NAMES, hence the deref). */
export interface DashboardRecentProposalRow {
  _id: string
  title: string
  _createdAt: string
  speakerNames: (string | null)[] | null
}

/** Travel support, reduced to the aggregate inputs (no banking details). */
export interface DashboardTravelSupportRow {
  _id: string
  _createdAt: string
  status: TravelSupportStatus
  totalAmount?: number
  approvedAmount?: number
  submittedAt?: string
  speakerName?: string
  expenseAmounts: (number | null)[] | null
}

/** The composed query's result, one attribute per requested source. */
export interface DashboardGroqResult {
  proposals?: DashboardProposalRow[] | null
  reviews?: DashboardReviewRow[] | null
  sponsors?: DashboardSponsorRow[] | null
  activities?: DashboardActivityRow[] | null
  recentProposals?: DashboardRecentProposalRow[] | null
  travelSupports?: DashboardTravelSupportRow[] | null
  featuredSpeakerCount?: number | null
  unassignedSponsorCount?: number | null
  pendingVolunteerCount?: number | null
}

/* --------------------------------------------------------------------------
 * The roots
 * ------------------------------------------------------------------------ */

/**
 * One frozen GROQ expression per source. Each is a standalone, parseable read
 * carrying its own tenant predicate, so `tenancy/no-unscoped-groq` judges every
 * root on its own — the composed query is only ever these literals joined into
 * an object projection by {@link buildDashboardQuery}.
 *
 * Status values ride in as PARAMETERS rather than interpolated enum members: an
 * interpolation inside a root filter is unreviewable (the text that runs is not
 * the text under review) and the rule reports it as such.
 */
const DASHBOARD_ROOTS: Record<DashboardGroqSource, string> = {
  // Serves CFP health, proposal pipeline, quick-action badges, review progress
  // and the schedule builder's "confirmed but unscheduled" count — one lean read
  // where there used to be four fat ones.
  proposals: groq`*[_type == "talk" && conference._ref == $conferenceId && status != $draftStatus] | order(_updatedAt desc){
    _id, title, status, format, _createdAt,
    "speakerIds": speakers[]._ref
  }`,

  // Scoped by traversal to the proposal's conference, and joined to `proposals`
  // in JS. Deliberately NOT a per-proposal correlated subquery: that shape ran
  // one nested read per talk and could only be scoped by correlation.
  reviews: groq`*[_type == "review" && proposal->conference._ref == $conferenceId]{
    "proposalId": proposal._ref, score
  }`,

  sponsors: groq`*[_type == "sponsorForConference" && conference._ref == $conferenceId] | order(status asc, _createdAt desc){
    _id, status, contractValue,
    sponsor->{ name, logo, logoBright }
  }`,

  activities: groq`*[_type == "sponsorActivity" && sponsorForConference->conference._ref == $conferenceId] | order(createdAt desc)[0...${RECENT_ACTIVITY_LIMIT}]{
    _id, description, createdAt, _createdAt,
    "sponsorName": sponsorForConference->sponsor->name,
    "createdByName": createdBy->name
  }`,

  recentProposals: groq`*[_type == "talk" && conference._ref == $conferenceId && status != $draftStatus] | order(_createdAt desc)[0...${RECENT_PROPOSALS_LIMIT}]{
    _id, title, _createdAt,
    "speakerNames": speakers[]->name
  }`,

  // The nested expense root carries its own tenant predicate rather than a
  // `^._id` correlation, so it is scoped on its own terms.
  travelSupports: groq`*[_type == "travelSupport" && conference._ref == $conferenceId] | order(_createdAt desc){
    _id, _createdAt, status, totalAmount, approvedAmount, submittedAt,
    "speakerName": speaker->name,
    "expenseAmounts": *[_type == "travelExpense" && travelSupport->conference._ref == $conferenceId && travelSupport._ref == ^._id].amount
  }`,

  // groq-global-scoped: point read of the domain-resolved conference document by
  // its server-derived `_id` (never client input) — the tenant IS the document.
  featuredSpeakerCount: groq`count(coalesce(*[_type == "conference" && _id == $conferenceId][0].featuredSpeakers, []))`,

  unassignedSponsorCount: groq`count(*[_type == "sponsorForConference" && conference._ref == $conferenceId && !defined(assignedTo)])`,

  pendingVolunteerCount: groq`count(*[_type == "volunteer" && conference._ref == $conferenceId && status == $pendingVolunteerStatus])`,
}

/** Deterministic emission order, so the built query is stable and diffable. */
const SOURCE_ORDER: DashboardGroqSource[] = [
  'proposals',
  'reviews',
  'sponsors',
  'activities',
  'recentProposals',
  'travelSupports',
  'featuredSpeakerCount',
  'unassignedSponsorCount',
  'pendingVolunteerCount',
]

/**
 * Compose the requested roots into ONE object-projection query.
 *
 * Returns `null` for an empty source set — a dashboard of purely
 * conference-derived widgets (deadlines) issues no read at all.
 */
export function buildDashboardQuery(
  sources: Iterable<DashboardGroqSource>,
): string | null {
  const wanted = new Set(sources)
  const fields = SOURCE_ORDER.filter((s) => wanted.has(s)).map(
    (s) => `"${s}": ${DASHBOARD_ROOTS[s]}`,
  )
  if (fields.length === 0) return null
  return `{${fields.join(',')}}`
}

/**
 * Parameters for the composed query. `conferenceId` is the tenant key and is
 * ALWAYS supplied by the caller from a server-side domain resolution.
 */
export function dashboardQueryParams(conferenceId: string) {
  return {
    conferenceId,
    draftStatus: Status.draft,
    pendingVolunteerStatus: VolunteerStatus.PENDING,
  }
}

/**
 * Run the composed query — ONE Sanity round-trip for every requested source.
 *
 * Uncached client and `no-store` on purpose: this is an admin surface whose
 * whole job is to show the organizer what is true right now.
 */
export async function fetchDashboardGroq(
  conferenceId: string,
  sources: Iterable<DashboardGroqSource>,
): Promise<DashboardGroqResult> {
  const query = buildDashboardQuery(sources)
  if (!query) return {}
  const result = await clientReadUncached.fetch<DashboardGroqResult | null>(
    query,
    dashboardQueryParams(conferenceId),
    { cache: 'no-store' },
  )
  return result ?? {}
}
