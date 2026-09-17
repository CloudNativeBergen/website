import type { Milestone } from '@/lib/marketing/milestones'
import type { Outcome } from '@/lib/marketing/types'

export interface CampaignFields {
  title: string
  primaryOutcome: Outcome
  target: number | null
  outcomeTargetPage: string | null
  window: {
    startMilestone: Milestone
    startOffsetDays: number
    endMilestone: Milestone
    endOffsetDays: number
  }
}
export type EditingCampaign = Omit<CampaignFields, 'window'> &
  CampaignFields['window'] & {
    _id: string
    _rev: string
    key: string
  }
export const emptyCampaign: CampaignFields = {
  title: '',
  primaryOutcome: 'attributedSessions',
  target: null,
  outcomeTargetPage: null,
  window: {
    startMilestone: 'CONFERENCE_START',
    startOffsetDays: -30,
    endMilestone: 'CONFERENCE_END',
    endOffsetDays: 0,
  },
}
export function campaignFields(campaign: EditingCampaign): CampaignFields {
  const {
    title,
    primaryOutcome,
    target,
    outcomeTargetPage,
    startMilestone,
    startOffsetDays,
    endMilestone,
    endOffsetDays,
  } = campaign
  return {
    title,
    primaryOutcome,
    target,
    outcomeTargetPage,
    window: { startMilestone, startOffsetDays, endMilestone, endOffsetDays },
  }
}
export function windowChanged(previous: CampaignFields, next: CampaignFields) {
  return (
    Object.keys(previous.window) as (keyof CampaignFields['window'])[]
  ).some((key) => previous.window[key] !== next.window[key])
}
export function needsMeasurementWarning(
  previous: CampaignFields,
  next: CampaignFields,
) {
  return (
    windowChanged(previous, next) &&
    [previous.primaryOutcome, next.primaryOutcome].some(
      (outcome) =>
        outcome === 'cfpSubmissions' || outcome === 'ticketsSoldInWindow',
    )
  )
}
