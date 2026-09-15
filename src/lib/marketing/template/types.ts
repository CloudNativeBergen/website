/**
 * PLAN TEMPLATE — the typed shape of a curated, Milestone-relative set of
 * Campaigns, Task Recipes, Triggers, copy skeletons and default Targets that
 * seeds a Marketing Plan (spec §5). The built-in one is code (`builtin.ts`);
 * the `planTemplate` Sanity type mirrors this shape for organization-owned
 * Templates later.
 */

import type { Milestone } from '../milestones'
import type {
  CampaignTrigger,
  MarketingChannel,
  Outcome,
  SubjectSource,
  TaskKind,
} from '../types'

/** A point in the edition: a Milestone plus whole days. */
export interface Anchor {
  milestone: Milestone
  offsetDays: number
}

/**
 * The subject list a recurring recipe expands over (§5.4). A subject recipe
 * without one is declared but never expanded: there is no list to read.
 */
export type SubjectList =
  'confirmedSpeakers' | 'scheduledTalks' | 'recordedTalks'

/**
 * A recurring recipe expands into many dated Tasks once its Milestone and
 * subject list are known (§5.4, `../expansion.ts`).
 */
export interface Cadence {
  from: Anchor
  to: Anchor
  /** Posts per week per Channel; `daily` recipes say 7. */
  perWeek: Partial<Record<MarketingChannel, number>>
  /** Subject recipes only: the list the expansion reads. */
  subjects?: SubjectList
}

/** How a Template proposes a Campaign's Target (§5.1). */
export type TemplateTarget = {
  /** Fraction of the edition's `ticketCapacity`; null Target when unset. */
  shareOfCapacity: number
}

/**
 * One Task to create (§5.2). LinkedIn and Bluesky are SIBLING recipes of one
 * beat, never one cross-posted Task: each carries its own skeleton, and the
 * two share a `beat`.
 */
export interface TaskRecipe {
  /** Stable key; `<beat>:<channel>` for publishing recipes. Becomes `utm_content`. */
  key: string
  /** The beat the recipe belongs to (siblings share it). */
  beat: string
  title: string
  kind: TaskKind
  /** Required for `publishing`; an optional label for other Kinds. */
  channel?: MarketingChannel
  /** Absent for Trigger-created recipes (they are dated by the event). */
  anchor?: Anchor
  /** Recipe keys in the SAME Campaign that should complete first. */
  prerequisites?: string[]
  /** Site path the tagged link points at (publishing recipes). */
  targetPage?: string
  subjectSource: SubjectSource
  /** Copy skeleton for the recipe's Channel, with `{placeholders}`. */
  skeleton?: string
  /** Alt-text skeleton for the image the beat carries. */
  alt?: string
  /** Body for checklist / eventPageUpdate recipes. */
  instructions?: string
  cadence?: Cadence
}

export interface CampaignRecipe {
  /** Stable key (`cfp`, `earlyBird`, …); becomes `utm_campaign`. */
  key: string
  title: string
  start: Anchor
  end: Anchor
  primaryOutcome: Outcome
  /** Required for page-counting Outcomes (§2.2). */
  outcomeTargetPage?: string
  target?: TemplateTarget
  /** Seeding asks before creating an optional Campaign. */
  optional: boolean
  triggers: CampaignTrigger[]
  recipes: TaskRecipe[]
}

export interface PlanTemplate {
  name: string
  /** Recorded on the plan it seeds (`templateVersion`). */
  version: string
  campaigns: CampaignRecipe[]
}
