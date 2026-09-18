/**
 * The snapshot engine's vocabulary (spec §2.4, §6.4): what one run reads, what
 * it writes, and the injected dependencies that let it be tested with fakes.
 */

import type { CampaignBreakdownResult } from '../analytics'
import type {
  OutcomeCampaign,
  OutcomeProposal,
  OutcomeTask,
  OutcomeTicket,
} from '../outcomes'
import type { EngagementResult } from '@/lib/social/provider'

/** A Campaign as the engine reads it: what it counts, plus what it is called. */
export interface SnapshotCampaign extends OutcomeCampaign {
  _id: string
  title: string
  target?: number | null
}

/** A Task as the engine reads it, with the Campaign it belongs to. */
export interface SnapshotTask extends OutcomeTask {
  campaignId: string
  /** Historical publication contributes totals without inventing a live Task. */
  orphanedPublication?: boolean
}

export interface SnapshotPlan {
  planId: string
  conferenceId: string
  campaigns: SnapshotCampaign[]
  tasks: SnapshotTask[]
}

/** Whether a source answered. Mirrors the Snapshot's `source` object. */
export type SourceStatus = 'ok' | 'unavailable'

/** One `marketingSnapshot` document, ready to write. */
export interface SnapshotDocument {
  _id: string
  _type: 'marketingSnapshot'
  campaign: { _type: 'reference'; _ref: string; _weak: true }
  campaignKey: string
  campaignTitle: string
  campaignPrimaryOutcome: SnapshotCampaign['primaryOutcome']
  campaignTarget: number | null
  campaignStartDate: string
  campaignEndDate: string
  conference: { _type: 'reference'; _ref: string }
  date: string
  primaryOutcomeValue: number | null
  primaryOutcomeAttributed: boolean
  primaryOutcomeAttributedValue: number | null
  secondary: {
    attributedSessions: number | null
    checkoutClickThrough: number | null
    blueskyInteractions: number | null
  }
  perTask: {
    _key: string
    _type: 'marketingSnapshotTask'
    taskKey: string
    task: { _type: 'reference'; _ref: string; _weak: true }
    sessions: number | null
    clicks: number | null
    blueskyLikes: number | null
    blueskyReposts: number | null
    blueskyReplies: number | null
    blueskyQuotes: number | null
  }[]
  source: { posthog: SourceStatus; bluesky: SourceStatus }
  takenAt: string
}

/**
 * Everything the engine reaches outside itself. Injected whole so a test can
 * run the REAL engine over fakes, and so nothing inside reads `process.env`
 * (docs/INTEGRATION_ADAPTERS.md).
 */
export interface SnapshotDeps {
  /** The plan, its Campaigns and its Tasks; null when the edition has no plan. */
  readPlan(conferenceId: string): Promise<SnapshotPlan | null>
  /** One DAY-GRAIN attribution read for the whole plan range (spec §6.4). */
  breakdown(input: {
    conferenceId: string
    from: Date
    to: Date
  }): Promise<CampaignBreakdownResult>
  /** One batched, unauthenticated engagement sweep over the published posts. */
  engagement(uris: string[]): Promise<EngagementResult>
  /** The edition's proposals; only called when some Campaign counts them. */
  readProposals(conferenceId: string): Promise<OutcomeProposal[]>
  /** The edition's tickets; only called when some Campaign counts them. */
  readTickets(conferenceId: string): Promise<OutcomeTicket[]>
  /** Snapshots ALREADY stored for these ids, so a stale run cannot overwrite. */
  readExisting(
    conferenceId: string,
    ids: string[],
  ): Promise<{ _id: string; takenAt: string | null }[]>
  /** Write the documents, in transactions the caller bounds. */
  writeSnapshots(documents: SnapshotDocument[]): Promise<void>
  /** Queue bookkeeping: stamp the plan so it goes to the back of the line. */
  markSnapshotted(planId: string, at: string): Promise<void>
}

export interface SnapshotRunResult {
  conferenceId: string
  /** The day the reading covers (Oslo yesterday). */
  date: string
  written: number
  /** Present when the run had nothing to do. */
  skipped?: string
  source: { posthog: SourceStatus; bluesky: SourceStatus }
  /** Why a source was unavailable, for the operator reading the cron log. */
  notes: string[]
}
