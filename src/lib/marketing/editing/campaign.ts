import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { commitOrConflict } from '../sanity'
import { resolveAnchor } from '../materialize'
import type { Milestone, ResolvedMilestone } from '../milestones'
import type { SeedCampaign } from '../seed'

export interface CampaignWindow {
  startMilestone: Milestone
  startOffsetDays: number
  endMilestone: Milestone
  endOffsetDays: number
}
export type EditableCampaign = Omit<
  SeedCampaign,
  'conferenceId' | 'triggers' | 'optional'
> & { _rev: string }
export function campaignWindow(
  window: CampaignWindow,
  milestones: Record<Milestone, ResolvedMilestone>,
) {
  const start = resolveAnchor(
    { milestone: window.startMilestone, offsetDays: window.startOffsetDays },
    milestones,
  )
  const end = resolveAnchor(
    { milestone: window.endMilestone, offsetDays: window.endOffsetDays },
    milestones,
  )
  return {
    ...window,
    startDate: start.date,
    endDate: end.date,
    provisional: start.provisional || end.provisional,
  }
}
export function readCampaignForEditing(
  campaignId: string,
  conferenceId: string,
) {
  return scopedFetch<EditableCampaign | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingCampaign" && _id == $campaignId && plan->conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id, _rev, "planId": plan._ref, key, title, primaryOutcome, target, outcomeTargetPage,
      startMilestone, startOffsetDays, endMilestone, endOffsetDays, startDate, endDate, provisional
    }`,
    { campaignId },
    { cache: 'no-store' },
  )
}
export async function createCampaign(campaign: SeedCampaign) {
  const { planId, conferenceId, ...fields } = campaign
  const tx = clientWrite.transaction().create({
    ...fields,
    _type: 'marketingCampaign',
    conference: { _type: 'reference', _ref: conferenceId },
    plan: { _type: 'reference', _ref: planId },
  })
  tx.patch(planId, (p) =>
    p.set({ structurallyEdited: true, updatedAt: getCurrentDateTime() }),
  )
  return commitOrConflict(tx)
}
/** Structural patches never query, re-anchor, or write Task documents. */
export async function updateCampaign(
  campaignId: string,
  rev: string,
  planId: string,
  fields: Partial<Omit<EditableCampaign, '_id' | '_rev' | 'key' | 'planId'>>,
) {
  const tx = clientWrite.transaction()
  tx.patch(campaignId, (p) =>
    p.ifRevisionId(rev).set({ ...fields, updatedAt: getCurrentDateTime() }),
  )
  tx.patch(planId, (p) =>
    p.set({ structurallyEdited: true, updatedAt: getCurrentDateTime() }),
  )
  return commitOrConflict(tx)
}
