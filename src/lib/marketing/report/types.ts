import type { CampaignView, PlanSummary, TaskView, Outcome } from '../types'
import type { Milestone, ResolvedMilestone } from '../milestones'
import type { SnapshotDocument } from '../snapshots/types'

export interface ReportInput {
  from?: string
  to?: string
  grain?: 'daily' | 'weekly'
}
/** Raw historical rows, including weak Task references that no longer resolve. */
type SnapshotMetadata =
  | 'campaignKey'
  | 'campaignTitle'
  | 'campaignPrimaryOutcome'
  | 'campaignTarget'
  | 'campaignStartDate'
  | 'campaignEndDate'
export type ReportSnapshot = Omit<
  SnapshotDocument,
  SnapshotMetadata | 'campaign' | 'perTask'
> &
  Partial<Pick<SnapshotDocument, SnapshotMetadata>> & {
    campaign: { _type: 'reference'; _ref: string; _weak?: true }
    perTask: (Omit<SnapshotDocument['perTask'][number], 'taskKey'> & {
      taskKey?: string
    })[]
  }
export interface ReportCampaign extends CampaignView {
  retired?: boolean
  value: number | null
  attributedValue: number | null
  observationDate: string | null
  stale: boolean
}
export interface ReportMeasurement {
  observationDate: string | null
  stale: boolean
}
export interface ReportTask {
  taskId: string
  title: string
  campaignId: string
  campaignTitle: string
  channel: string | null
  sessions: number | null
  clicks: number | null
  blueskyInteractions: number | null
  sessionsMeasurement: ReportMeasurement
  clicksMeasurement: ReportMeasurement
  blueskyInteractionsMeasurement: ReportMeasurement
}
export interface ReportPoint {
  date: string
  value: number | null
  stale: boolean
}
export interface ReportView {
  conference: { id: string; title: string }
  plan: PlanSummary | null
  range: {
    from: string
    to: string
    grain: 'daily' | 'weekly'
    defaultFrom: string
    defaultTo: string
  }
  semantics: string
  rankingMetric: string
  summary: ReportCampaign[]
  breakdown?: ReportCampaign[]
  channels: {
    channel: string
    sessions: number | null
    clicks: number | null
    sessionsMeasurement: ReportMeasurement
    clicksMeasurement: ReportMeasurement
  }[]
  unavailableStage: string
  timeline: {
    campaignId: string
    metricChanged?: boolean
    /** The window moved under a window-sensitive Outcome, so the series restarts. */
    windowChanged?: boolean
    measurement?: ReportMeasurement
    title: string
    outcome: Outcome
    points: ReportPoint[]
  }[]
  campaigns: CampaignView[]
  milestones: Partial<Record<Milestone, ResolvedMilestone>>
  topTasks: ReportTask[]
  previousEdition: {
    title: string
    campaigns: {
      key: string
      title: string
      current: number | null
      previous: number | null
      comparable: boolean
      reason: string | null
    }[]
  } | null
  health: {
    running: boolean
    total: number
    complete: number
    overdue: number
    waiting: number
    failed: number
    unassigned: number
  }
  snapshots: ReportSnapshot[]
  tasks: TaskView[]
}
