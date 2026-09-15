/**
 * Sanity and vendor wiring for the snapshot engine. Everything here is the
 * `SnapshotDeps` the engine is handed; the engine itself knows none of it.
 *
 * TENANCY: every read carries the conference predicate, on the root AND on the
 * nested roots, and follows a Task's variant only when the variant belongs to
 * the same conference — the pattern `getPlanView` established. The one
 * deliberately global read is the cron's conference SELECTION, which is a
 * cross-tenant sweep by construction and hands each edition to a scoped run.
 */

import 'server-only'
import { CONFERENCE_TIME_ZONE } from '@/lib/time'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { resolveTicketingAdminAccess } from '@/lib/tickets/admin-access'
import { parseTicketAmount } from '@/lib/tickets/amount'
import type { ConferenceTicketingBinding } from '@/lib/tickets/provider'
import { getSocialEngagementProvider } from '@/lib/social/provider'
import type { EngagementResult } from '@/lib/social/provider'
import type { AttemptOutcome, VariantStatus } from '@/lib/social/types'
import { resolveMarketingAnalyticsProvider } from '../analytics'
import type { CampaignBreakdownResult } from '../analytics'
import type { OutcomeProposal, OutcomeTicket } from '../outcomes'
import type { MarketingChannel, Outcome, TaskKind } from '../types'
import { postUriOf } from './engine'
import type {
  SnapshotCampaign,
  SnapshotDeps,
  SnapshotDocument,
  SnapshotPlan,
  SnapshotTask,
} from './types'

/**
 * How long the whole ticket read may take. A ticketing vendor paginates, and
 * the provider interface exposes no deadline of its own, so an event with many
 * orders is an unbounded number of sequential requests inside ONE await —
 * enough, on a bad day, to outlast the snapshot cron's function budget and
 * take the editions queued behind it with it. Running out yields no reading
 * (the Snapshot stores `null`), which is the honest answer and costs one day.
 */
export const TICKET_READ_BUDGET_MS = 60_000

/**
 * Resolve `work`, or reject once `budgetMs` has passed. The underlying request
 * is NOT cancelled — the provider gives us no handle to cancel with — so this
 * bounds how long the RUN waits, not how long the vendor takes.
 */
export async function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`${label} ran out of budget after ${budgetMs}ms`)),
          budgetMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    // The losing promise must not surface as an unhandled rejection when the
    // vendor eventually fails long after we stopped waiting for it.
    void work.catch(() => {})
  }
}

/** How many editions one cron run will serve. Bounded by the function timeout. */
export const MAX_CONFERENCES_PER_RUN = 20

/** At most 50 mutations per Sanity transaction (spec §6.4). */
export const MAX_MUTATIONS_PER_TRANSACTION = 50

/** The attempt outcomes that mean the post actually went out. */
const PUBLISHED_OUTCOMES: readonly AttemptOutcome[] = ['published', 'manual']

interface RawCampaign {
  _id: string
  key: string | null
  title: string | null
  startDate: string | null
  endDate: string | null
  primaryOutcome: Outcome | null
  outcomeTargetPage: string | null
  target: number | null
}

interface RawTask {
  _id: string
  key: string | null
  kind: TaskKind | null
  channel: MarketingChannel | null
  campaignId: string | null
  variantStatus: VariantStatus | null
  externalId: string | null
  attempts: { at: string | null; outcome: AttemptOutcome | null }[] | null
}

interface RawPlan {
  _id: string
  campaigns: RawCampaign[] | null
  tasks: RawTask[] | null
}

/**
 * The plan, its Campaigns and its Tasks in ONE tenant-scoped round trip. A
 * Campaign with no key or no dates cannot be counted and is dropped here
 * rather than producing a Snapshot of nulls.
 */
export async function readSnapshotPlan(
  conferenceId: string,
): Promise<SnapshotPlan | null> {
  const row = await scopedFetch<RawPlan | null>(
    clientReadUncached,
    { conferenceId },
    // A plain literal, not a `groq` tag: the tenancy rule credits the builder's
    // splice only when the text is the argument itself.
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(startDate asc){
        _id, key, title, startDate, endDate, primaryOutcome, outcomeTargetPage, target
      },
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
        _id, key, kind, channel,
        "campaignId": campaign._ref,
        "variantStatus": select(variant->conference._ref == conference._ref => variant->status),
        "externalId": select(variant->conference._ref == conference._ref => variant->publishResult.externalId),
        "attempts": select(variant->conference._ref == conference._ref => variant->attempts[]{ at, outcome })
      }
    }`,
    {},
    { cache: 'no-store' },
  )
  if (!row) return null

  const campaigns: SnapshotCampaign[] = (row.campaigns ?? [])
    .filter(
      (
        c,
      ): c is RawCampaign & {
        key: string
        startDate: string
        endDate: string
      } => !!c.key && !!c.startDate && !!c.endDate,
    )
    .map((c) => ({
      _id: c._id,
      key: c.key,
      title: c.title ?? c.key,
      startDate: c.startDate,
      endDate: c.endDate,
      primaryOutcome: c.primaryOutcome ?? 'attributedSessions',
    }))

  const tasks: SnapshotTask[] = (row.tasks ?? [])
    .filter((t): t is RawTask & { campaignId: string } => !!t.campaignId)
    .map((t) => ({
      _id: t._id,
      campaignId: t.campaignId,
      key: t.key ?? '',
      kind: t.kind ?? 'checklist',
      channel: t.channel ?? null,
      variantStatus: t.variantStatus ?? null,
      publishedAt: firstPublishedAt(t.attempts),
      postUri: postUriOf(t.externalId),
    }))

  return { planId: row._id, conferenceId, campaigns, tasks }
}

/**
 * When the post actually went out: the EARLIEST successful attempt. A variant
 * carries every attempt it ever made, including the failures before the one
 * that worked, so "the last attempt" would be wrong for a retried post and
 * `scheduledAt` would be wrong for a delayed one.
 */
export function firstPublishedAt(
  attempts: { at: string | null; outcome: AttemptOutcome | null }[] | null,
): string | null {
  const times = (attempts ?? [])
    .filter(
      (attempt) =>
        !!attempt.at &&
        !!attempt.outcome &&
        PUBLISHED_OUTCOMES.includes(attempt.outcome),
    )
    .map((attempt) => attempt.at as string)
    .sort()
  return times[0] ?? null
}

/**
 * Statuses that mean a proposal was actually SUBMITTED. A `draft` was never
 * sent, and a `deleted` one is gone — counting either would credit a Campaign
 * with work nobody finished. A `withdrawn` proposal WAS submitted and is kept:
 * the Campaign did its job, and what happened afterwards is a different story.
 */
const SUBMITTED_STATUSES = [
  'submitted',
  'accepted',
  'waitlisted',
  'confirmed',
  'rejected',
  'withdrawn',
] as const

/** The edition's SUBMITTED proposals with their first-touch UTM (§6.3). */
export async function readProposalOutcomes(
  conferenceId: string,
): Promise<OutcomeProposal[]> {
  const rows = await scopedFetch<
    { createdAt: string | null; utmCampaign: string | null }[] | null
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "talk" && status in $statuses && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
      "createdAt": _createdAt,
      "utmCampaign": utm.campaign
    }`,
    { statuses: SUBMITTED_STATUSES },
    { cache: 'no-store' },
  )
  return (rows ?? [])
    .filter(
      (row): row is { createdAt: string; utmCampaign: string | null } =>
        !!row.createdAt,
    )
    .map((row) => ({
      createdAt: row.createdAt,
      utmCampaign: row.utmCampaign ?? null,
    }))
}

/**
 * The edition's ticket orders, for `ticketsSoldInWindow`.
 *
 * BY CONFERENCE ID, never by request domain. The cron sweeps every edition in
 * one request, so `getConferenceForCurrentDomain()` here would resolve the
 * DEPLOYMENT's conference and hand one tenant's ticket sales to all of them.
 * The binding is read by id and passed to the ticketing ACCESS resolver, which
 * is what keeps an unbound, uncredentialed or switched-off edition to "no
 * reading" rather than someone else's numbers.
 */
export async function readTicketOutcomes(
  conferenceId: string,
): Promise<OutcomeTicket[]> {
  const binding =
    await clientReadUncached.fetch<ConferenceTicketingBinding | null>(
      // groq-global-scoped: the tenant predicate IS `_id == $conferenceId` — this
      // reads the conference document itself, which carries no `conference` ref.
      `*[_type == "conference" && _id == $conferenceId][0]{
      ticketingProvider, checkinCustomerId, checkinEventId,
      titoAccountSlug, titoEventSlug, organization
    }`,
      { conferenceId },
      { cache: 'no-store' },
    )
  if (!binding) {
    throw new Error(`Conference ${conferenceId} could not be read`)
  }
  const access = await resolveTicketingAdminAccess(binding)
  if (access.state !== 'ready') {
    throw new Error(`Ticketing is ${access.state} for this edition`)
  }
  const tickets = await withinBudget(
    access.provider.fetchEventTickets(access.eventRef),
    TICKET_READ_BUDGET_MS,
    'the ticket read',
  )
  // PAID tickets only, by the platform's own definition of a sale
  // (`calculateTicketStatistics`, and the admin tickets page, both split on
  // `parseTicketAmount(sum) > 0`). Complimentary speaker and sponsor
  // registrations are issued in bulk and would otherwise show up as a
  // Campaign selling a hundred tickets in the week the speakers were
  // confirmed.
  return tickets
    .filter(
      (ticket) => !!ticket.order_date && parseTicketAmount(ticket.sum) > 0,
    )
    .map((ticket) => ({ orderDate: ticket.order_date }))
}

/** What is already stored for these Snapshot ids — the stale-write guard. */
export async function readExistingSnapshots(
  conferenceId: string,
  ids: string[],
): Promise<{ _id: string; takenAt: string | null }[]> {
  if (ids.length === 0) return []
  const rows = await scopedFetch<
    { _id: string; takenAt: string | null }[] | null
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingSnapshot" && _id in $ids]{ _id, takenAt }`,
    { ids },
    { cache: 'no-store' },
  )
  return rows ?? []
}

/**
 * Write the readings. `createOrReplace` on the deterministic id is what makes
 * a re-run of the same day REPLACE rather than accumulate, and the batches
 * hold the transaction to its documented ceiling.
 */
export async function writeSnapshots(
  documents: SnapshotDocument[],
): Promise<void> {
  for (let i = 0; i < documents.length; i += MAX_MUTATIONS_PER_TRANSACTION) {
    const batch = documents.slice(i, i + MAX_MUTATIONS_PER_TRANSACTION)
    const transaction = clientWrite.transaction()
    for (const document of batch) transaction.createOrReplace(document)
    await transaction.commit({ visibility: 'sync' })
  }
}

/**
 * Stamp the plan, whether or not anything was written: the cron orders by this,
 * so a plan it has just served goes to the back of the queue. BEST-EFFORT —
 * queue bookkeeping must not fail the reading it precedes.
 */
export async function markPlanSnapshotted(
  planId: string,
  at: string,
): Promise<void> {
  try {
    await clientWrite.patch(planId).set({ lastSnapshotAt: at }).commit()
  } catch (error) {
    console.error(`Could not stamp ${planId} as snapshotted`, error)
  }
}

export interface SnapshotConference {
  planId: string
  conferenceId: string
}

/**
 * The editions this run will serve: every conference with a plan, the ones
 * waiting longest first (a plan the cron has never served waits the longest of
 * all), capped so one run stays inside the function timeout.
 */
export async function resolveSnapshotConferences(): Promise<
  SnapshotConference[]
> {
  const rows = await clientReadUncached.fetch<
    {
      planId: string
      conferenceId: string | null
      lastSnapshotAt: string | null
    }[]
  >(
    // groq-global: the cron runs across every tenant and hands each conference
    // to its own scoped run.
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
      "planId": _id,
      "conferenceId": conference._ref,
      lastSnapshotAt
    }`,
    {},
    { cache: 'no-store' },
  )
  return (rows ?? [])
    .filter(
      (row): row is typeof row & { conferenceId: string } => !!row.conferenceId,
    )
    .sort((a, b) =>
      (a.lastSnapshotAt ?? '').localeCompare(b.lastSnapshotAt ?? ''),
    )
    .slice(0, MAX_CONFERENCES_PER_RUN)
    .map((row) => ({ planId: row.planId, conferenceId: row.conferenceId }))
}

/**
 * The production dependency bag. `orgId` decides whose PostHog project is
 * read — an organization without an `analytics` secret has no attribution, and
 * the run says so rather than showing another tenant's numbers.
 */
export function snapshotDeps(orgId: string | null | undefined): SnapshotDeps {
  // Through the FACTORY, never the vendor class (docs/INTEGRATION_ADAPTERS.md):
  // call sites depend on the interface and the factory only.
  const engagementProvider = getSocialEngagementProvider('bluesky')
  return {
    readPlan: readSnapshotPlan,
    async breakdown({
      conferenceId,
      from,
      to,
    }): Promise<CampaignBreakdownResult> {
      const analytics = await resolveMarketingAnalyticsProvider(orgId)
      if (!analytics) {
        return {
          ok: false,
          kind: 'unauthorized',
          message: 'This organization has no PostHog project configured',
        }
      }
      return analytics.campaignBreakdown({
        conference: conferenceId,
        from,
        to,
        // Days in the CONFERENCE zone, because that is the calendar a Campaign
        // window is expressed in (spec §2.2).
        grain: 'day',
        timeZone: CONFERENCE_TIME_ZONE,
      })
    },
    engagement(uris: string[]): Promise<EngagementResult> {
      // No provider for the platform means no readable engagement, which the
      // engine records as `source.bluesky = 'unavailable'` — not as zeros.
      return engagementProvider
        ? engagementProvider.engagement(uris)
        : Promise.resolve({
            ok: false,
            kind: 'rejected',
            message: 'No engagement provider is registered for bluesky',
          })
    },
    readProposals: readProposalOutcomes,
    readTickets: readTicketOutcomes,
    readExisting: readExistingSnapshots,
    writeSnapshots,
    markSnapshotted: markPlanSnapshotted,
  }
}
