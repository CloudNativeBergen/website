import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch, scopedQuery } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import type { MilestoneSource } from './milestones'
import { commitOrConflict } from './sanity'
import {
  isRedatableTask,
  type RedatableCampaign,
  type RedatableTask,
  type RedatePlan,
} from './redate'

export interface RedatablePlanSnapshot {
  planId: string
  planRev: string
  conference: MilestoneSource | null
  tasks: RedatableTask[]
  campaigns: RedatableCampaign[]
}

const TASK_FIELDS = groq`
  _id, _rev, kind, channel, milestone, offsetDays, provisional,
  plannedAt, dueAt, status, approvedAt,
  "variant": select(
    variant->conference._ref == conference._ref &&
    variant->post->conference._ref == conference._ref => variant->{
      _id, _rev, status, scheduledAt, usesCustomTime,
      "postId": post._ref, "postRev": post->_rev
    }, null
  )
`

/** Conference source and every compare-and-set revision share one snapshot. */
export async function getRedatablePlan(
  conferenceId: string,
): Promise<RedatablePlanSnapshot | null> {
  // groq-global-scoped: scopedQuery injects CONFERENCE_FILTER with the server-resolved conferenceId before this fragment is fetched.
  const tasksQuery = groq`*[_type == "marketingTask" && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{${TASK_FIELDS}}`
  const tasks = scopedQuery({ conferenceId }, tasksQuery)
  // groq-global-scoped: scopedQuery injects CONFERENCE_FILTER with the server-resolved conferenceId before this fragment is fetched.
  const campaignsQuery = groq`*[_type == "marketingCampaign" && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
    _id, _rev, startMilestone, startOffsetDays, endMilestone, endOffsetDays,
    startDate, endDate, provisional
  }`
  const campaigns = scopedQuery({ conferenceId }, campaignsQuery)
  return scopedFetch(
    clientReadUncached,
    { conferenceId },
    `
    *[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      "planId": _id, "planRev": _rev,
      "conference": conference->{
        startDate, endDate, cfpStartDate, cfpEndDate, cfpNotifyDate, programDate,
        earlyBirdEndDate, registrationCloseDate, speakersAnnouncedDate,
        sponsorDeadlineDate, recordingsLiveDate, ticketTargets
      },
      "tasks": ${tasks},
      "campaigns": ${campaigns}
    }
  `,
    {},
    { cache: 'no-store' },
  )
}

/** One atomic write, including the plan CAS that serializes concurrent runs. */
export async function applyRedates(
  plan: RedatePlan,
  snapshot: Pick<RedatablePlanSnapshot, 'planId' | 'planRev'>,
  now = getCurrentDateTime(),
): Promise<boolean> {
  const tx = clientWrite
    .transaction()
    .patch(snapshot.planId, (p) =>
      p.ifRevisionId(snapshot.planRev).set({ lastRedatedAt: now }),
    )
  for (const task of plan.tasks) {
    if (task.variant) {
      tx.patch(task.variant.id, (p) =>
        p.ifRevisionId(task.variant!.rev).set({ scheduledAt: task.at }),
      )
      tx.patch(task.variant.postId, (p) =>
        p
          .ifRevisionId(task.variant!.postRev)
          .set({ defaultScheduledAt: task.at }),
      )
    }
    tx.patch(task.taskId, (p) =>
      p.ifRevisionId(task.taskRev).set({
        ...(!task.variant ? { dueAt: task.at } : {}),
        plannedAt: task.at,
        provisional: task.provisional,
      }),
    )
  }
  for (const campaign of plan.campaigns) {
    tx.patch(campaign.id, (p) =>
      p.ifRevisionId(campaign.rev).set({
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        provisional: campaign.provisional,
      }),
    )
  }
  return commitOrConflict(tx)
}

export interface RedateCandidate {
  planId: string
  conferenceId: string
  lastRedatedAt: string | null
}

/** The cron has its own work-based eligibility, including post-event editions. */
export async function getRedateCandidates(): Promise<RedateCandidate[]> {
  // groq-global: authenticated cron enumerates plans across conferences for fair re-date rotation.
  const plansQuery = groq`*[_type == "marketingPlan" && defined(conference._ref) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{"planId": _id, "conferenceId": conference._ref, lastRedatedAt}`
  // groq-global: authenticated cron enumerates anchored work; the same pure movable predicate as the planner determines eligibility.
  const tasksQuery = groq`*[_type == "marketingTask" && defined(milestone) && defined(offsetDays) && defined(plannedAt) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{${TASK_FIELDS}, "planId": plan._ref, "conferenceId": conference._ref}`
  // CAMPAIGNS COUNT AS WORK TOO. Filtering candidates on redatable Tasks alone
  // let a plan whose Tasks are all approved or published — the normal state of
  // an edition close to its conference — drop out of the rotation entirely
  // while its Campaign windows stayed on the old Milestone dates forever.
  // Campaign windows are not cosmetic: `strictWindow` counts `cfpSubmissions`
  // and `ticketsSoldInWindow` strictly inside them, so a stale window silently
  // changes what the Report measures. The planner moves a Campaign whenever its
  // resolved dates differ, with no movability predicate, so any anchored
  // Campaign is potential work; proving it is not would mean resolving every
  // conference's Milestones here. Over-selecting is the safe direction — the
  // run is a no-op commit when nothing differs, the per-run cap is far above
  // the number of editions, and `lastRedatedAt` rotation keeps it fair.
  // groq-global: authenticated cron enumerates anchored Campaign windows alongside the Tasks.
  const campaignsQuery = groq`*[_type == "marketingCampaign" && defined(startMilestone) && defined(endMilestone) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{"planId": plan._ref, "conferenceId": conference._ref}`
  const read = await clientReadUncached.fetch<{
    plans: RedateCandidate[]
    tasks: (RedatableTask & { planId: string; conferenceId: string })[]
    campaigns: { planId: string; conferenceId: string }[]
  }>(
    `{"plans": ${plansQuery}, "tasks": ${tasksQuery}, "campaigns": ${campaignsQuery}}`,
    {},
    { cache: 'no-store' },
  )
  const inPlan = (
    plan: RedateCandidate,
    row: { planId: string; conferenceId: string },
  ) => row.planId === plan.planId && row.conferenceId === plan.conferenceId
  return read.plans.filter(
    (plan) =>
      read.tasks.some((task) => inPlan(plan, task) && isRedatableTask(task)) ||
      read.campaigns.some((campaign) => inPlan(plan, campaign)),
  )
}
