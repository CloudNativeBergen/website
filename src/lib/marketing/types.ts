/**
 * MARKETING PLAN — domain vocabulary (docs/MARKETING_PLAN_SPEC.md §2,
 * CONTEXT.md "Marketing"). A Plan is the team-owned set of Campaigns for one
 * conference edition; a Campaign is a group of Tasks pursuing one Outcome over
 * a Milestone-anchored window; a Task is one unit of work of one Kind.
 */

import type { SocialVariantEditorData, VariantStatus } from '@/lib/social/types'
import type {
  Milestone,
  ResolvedMilestone,
  ResolvedMilestones,
} from './milestones'
import type { PagePickerOption, TaskSubjectRef } from './pages'
import type { TagByHandEntry } from './tag-by-hand'

/** The Channels a Task can be executed on in slice 1 (⊂ `SocialPlatform`). */
export const MARKETING_CHANNELS = ['linkedin', 'bluesky'] as const
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
}

/** What a Task is, which fixes its tool and its completion rule (§2.3). */
export const TASK_KINDS = [
  'publishing',
  'studioRender',
  'speakerOutreach',
  'sponsorOutreach',
  'eventPageUpdate',
  'checklist',
] as const
export type TaskKind = (typeof TASK_KINDS)[number]

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  publishing: 'Post',
  studioRender: 'Studio render',
  speakerOutreach: 'Speaker outreach',
  sponsorOutreach: 'Sponsor outreach',
  eventPageUpdate: 'Event page update',
  checklist: 'Checklist',
}

/** Status of a NON-publishing Task; publishing Tasks read `variant.status`. */
export const TASK_STATUSES = ['open', 'done', 'skipped'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_ORIGINS = [
  'template',
  'trigger',
  'expansion',
  'copy',
  'manual',
] as const
export type TaskOrigin = (typeof TASK_ORIGINS)[number]

/** The one primary measurable result a Campaign is judged against (§2.2). */
export const OUTCOMES = [
  'checkoutClickThrough',
  'ticketsSoldInWindow',
  'cfpSubmissions',
  'sponsorContactClicks',
  'attributedSessions',
  'blueskyInteractions',
] as const
export type Outcome = (typeof OUTCOMES)[number]

export const OUTCOME_LABELS: Record<Outcome, string> = {
  checkoutClickThrough: 'Checkout click-through',
  ticketsSoldInWindow: 'Tickets sold in window',
  cfpSubmissions: 'CFP submissions',
  sponsorContactClicks: 'Sponsor contact clicks',
  attributedSessions: 'Attributed sessions',
  blueskyInteractions: 'Bluesky interactions',
}

/** Outcomes that count a specific site path (`outcomeTargetPage` required). */
export const PAGE_OUTCOMES: readonly Outcome[] = [
  'attributedSessions',
  'sponsorContactClicks',
]

/** Domain events a Campaign Trigger listens on (§5.3). */
export const TRIGGER_EVENTS = ['sponsorSigned', 'speakerConfirmed'] as const
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number]

/** What a Task is about; drives placeholders and the studio preselection. */
export const SUBJECT_SOURCES = ['speaker', 'sponsor', 'talk', 'none'] as const
export type SubjectSource = (typeof SUBJECT_SOURCES)[number]

/** A Trigger as stored on a Campaign: `{ event, taskRecipeKey }` (§2.2). */
export interface CampaignTrigger {
  event: TriggerEvent
  taskRecipeKey: string
}

// ---------------------------------------------------------------------------
// What `marketing.plan.get` returns — the timeline's read model
// ---------------------------------------------------------------------------

export interface PlanSummary {
  structurallyEdited?: boolean
  _id: string
  ownerId: string | null
  ownerName: string | null
  /** The plan's origin as stored; read it with `planOrigin` (`origin.ts`). */
  templateVersion: string
  /** A copied plan: the edition it was copied from. */
  copiedFromTitle: string | null
  /** ISO datetime. */
  createdAt: string
}

export interface CampaignView {
  _id: string
  key: string
  title: string
  /** YYYY-MM-DD, materialized. */
  startDate: string
  endDate: string
  /** True when either end came from a Milestone fallback. */
  provisional: boolean
  startMilestone: Milestone
  endMilestone: Milestone
  primaryOutcome: Outcome
  target: number | null
  optional: boolean
}

/**
 * A Task as the timeline reads it. Publishing Tasks take `date` and `status`
 * from their variant (the source of truth); other Kinds carry their own.
 */
export interface TaskView {
  _id: string
  campaignId: string
  key: string
  title: string
  kind: TaskKind
  channel: MarketingChannel | null
  /** ISO datetime the chip sits on; null for an unscheduled publishing Task. */
  date: string | null
  provisional: boolean
  /** The Milestone the date is anchored to; null for a hand-moved Task. */
  milestone: Milestone | null
  status: TaskStatus | VariantStatus
  /** The Kind's completion rule, evaluated on the server (§2.3). */
  complete: boolean
  /** Saved studio output still needs delivery to publishing Tasks. */
  handoffPending?: boolean
  prerequisiteIds: string[]
  variantId: string | null
  assigneeId: string | null
  /** ISO datetime of the approval, or null while unapproved (§2.3). */
  approvedAt: string | null
}

export interface PlanView {
  viewerId: string | null
  plan: PlanSummary
  campaigns: CampaignView[]
  tasks: TaskView[]
  milestones: Record<Milestone, ResolvedMilestone>
  /** YYYY-MM-DD in the conference timezone. */
  today: string
  /**
   * Channel ceilings the edition's scheduled posts go over (§5.4), as
   * sentences. Warnings, never blocks.
   */
  ceilingWarnings: string[]
  /** Who the plan can be delegated to: this conference's organizers. */
  organizers: { _id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// What `marketing.task.get` returns — the Task editor's read model (#1012)
// ---------------------------------------------------------------------------

export interface TaskSubject extends TaskSubjectRef {
  _id: string
}

/** The Task as the editor reads it: the chip's view plus its editable fields. */
export interface TaskEditorTask extends TaskView {
  /** The revision every Task write is compare-and-set on. */
  _rev: string
  approvedByName: string | null
  assigneeName: string | null
  targetPage: string | null
  /**
   * Outreach Kinds: the `/go/<code>` code for the derived tagged link
   * (short-links spec §2.1). `null` until the first mutation that mints one.
   */
  shortCode: string | null
  instructions: string | null
  /**
   * The copy is a previous edition's literal text, carried by a Template that
   * was saved without rewriting it (Templates spec §6.2) — and nobody has
   * rewritten it here yet.
   */
  verbatimCopy: boolean
  externalUrl: string | null
  skipReason: string | null
  subject: TaskSubject | null
  /** Outreach completion, committed with its message. */
  messageId: string | null
  /** studioRender output, when attached. */
  assetUrl: string | null
  assetId?: string | null
  origin: TaskOrigin | null
}

export interface StoredTaskEditorData {
  task: TaskEditorTask
  campaign: { _id: string; key: string; title: string }
  planOwnerId: string | null
  /** The other Tasks of the same Campaign: the Prerequisites picker. */
  siblings: TaskView[]
  /** Publishing Kind: what the single-variant editor loads. */
  variant: SocialVariantEditorData | null
  /**
   * A LinkedIn publishing Task: the subject's people and company beside their
   * LinkedIn page, to tag by hand (tagging spec §5.1). Opted-out speakers
   * are left out on the server. Empty for every other Task.
   */
  tagByHand: TagByHandEntry[]
}

export interface TaskEditorData extends StoredTaskEditorData {
  /** The conference origin the tagged link is built on. */
  baseUrl: string
  /** Derived from the current target page (§3.4); null without one. */
  taggedLink: string | null
  outreachBody: string | null
  pages: PagePickerOption[]
  /** The assignee roster: this conference's organizers. */
  organizers: { _id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// What `marketing.campaign.get` returns — the Campaign ledger (#1018)
// ---------------------------------------------------------------------------

/** A Campaign with the one field the ledger needs beyond the timeline's. */
export interface LedgerCampaign extends CampaignView {
  /**
   * The site path the Outcome is about, for `attributedSessions` and
   * `sponsorContactClicks` (§2.2). Shown as context: slice 1 counts the whole
   * Campaign, because the attribution query groups by Campaign and Task only
   * and carries no page dimension.
   */
  outcomeTargetPage: string | null
}

/** One Task's row of numbers, lifted out of the Snapshot's `perTask[]`. */
export interface LedgerTaskNumbers {
  taskId: string
  sessions: number | null
  clicks: number | null
  /** Likes + reposts + replies + quotes; null when Bluesky was unavailable. */
  blueskyInteractions: number | null
}

/** The stored reading the ledger draws. Null when none has been taken yet. */
export interface LedgerSnapshot {
  /** The day the reading covers, YYYY-MM-DD. */
  date: string
  /**
   * The window the reading was measured in, when that is NOT the Campaign's
   * window any more — set after a window edit or a Milestone re-date. The
   * number is still true of the span it names, so the ledger shows it and says
   * which span, rather than blanking a figure the organizer can see is real.
   */
  measuredWindow: { startDate: string; endDate: string } | null
  /** ISO datetime the reading was taken. */
  takenAt: string | null
  source: {
    posthog: 'ok' | 'unavailable' | null
    bluesky: 'ok' | 'unavailable' | null
  }
  /**
   * The Outcome this reading's primary value measured, when that is NOT the
   * Campaign's Outcome any more. Set after an Outcome edit, and the primary
   * values are nulled alongside it: that number counted something else and is
   * not this Campaign's figure. Everything else in the reading survives — the
   * secondary funnel and the per-Task rows are computed from the attributed
   * window alone and never touch the Outcome.
   */
  measuredOutcome: Outcome | null
  /**
   * True when this reading was taken against a DIFFERENT Campaign document with
   * the same stable key — i.e. the plan was deleted and reseeded, or restored.
   * The campaign-level numbers are real history for that key and are kept and
   * labelled; the per-Task rows are dropped, because the Tasks they measured
   * are gone and reusing their numbers for the new Tasks would be fabrication.
   */
  measuredBeforeReseed: boolean
  primaryValue: number | null
  /** False for `ticketsSoldInWindow`: in window, NOT attributed (§6.3). */
  primaryAttributed: boolean
  /** `cfpSubmissions`: how many of the counted proposals carry this key. */
  primaryAttributedValue: number | null
  secondary: {
    attributedSessions: number | null
    checkoutClickThrough: number | null
    blueskyInteractions: number | null
  }
  perTask: LedgerTaskNumbers[]
}

/** What the ledger READ returns, before the router adds the roster. */
export interface StoredCampaignLedger {
  campaign: LedgerCampaign
  tasks: TaskView[]
  snapshot: LedgerSnapshot | null
}

export interface CampaignLedgerView extends StoredCampaignLedger {
  /**
   * The same Campaign key's Outcome in the previous edition. ALWAYS null in
   * slice 1 — the comparison is specified (§7) but the previous edition has no
   * Snapshots to compare against, so the ledger shows the slot and says so.
   */
  previousEdition: { editionTitle: string; value: number | null } | null
  /** The assignee roster, so the Task table shows names without a read each. */
  organizers: { _id: string; name: string }[]
  /**
   * What "Add task" anchors against. Null when a required conference date is
   * missing: the ledger still opens, and a new Task can only take a bare date.
   */
  milestones: ResolvedMilestones | null
}
