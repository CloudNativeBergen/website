import type { Milestone } from '@/lib/marketing/milestones'
import { PAGE_OUTCOMES, type Outcome } from '@/lib/marketing/types'

export interface CampaignFields {
  title: string
  primaryOutcome: Outcome
  target: number | null
  outcomeTargetPage: string | null
  /** A Template saved from this plan asks before creating this Campaign (§4.1). */
  optional: boolean
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
  optional: false,
  window: {
    startMilestone: 'CONFERENCE_START',
    startOffsetDays: -30,
    endMilestone: 'CONFERENCE_END',
    endOffsetDays: 0,
  },
}
/**
 * Whether the chosen Outcome needs a page and has none.
 *
 * `attributedSessions` is the form's default Outcome and one of the Outcomes
 * measured against a page, so the natural path — Add Campaign, type a title,
 * Save — always came back from the server as "Choose the page this Outcome
 * measures." The requirement is now stated on the field and the Save button
 * waits for it, instead of a round trip to find out.
 */
export function needsOutcomePage(fields: CampaignFields): boolean {
  return (
    PAGE_OUTCOMES.includes(fields.primaryOutcome) && !fields.outcomeTargetPage
  )
}

export function campaignFields(campaign: EditingCampaign): CampaignFields {
  const {
    title,
    primaryOutcome,
    target,
    outcomeTargetPage,
    optional,
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
    optional,
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
