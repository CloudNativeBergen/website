import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import type { CopySource, CopySourceTask } from './copy'
import type { Milestone } from './milestones'
import type { CampaignTrigger, Outcome } from './types'

/**
 * Reads for copying a previous edition's plan (#1017). A source is only ever
 * a plan of ANOTHER conference in the caller's organization: the organization
 * is resolved from the request domain, the conference list is read
 * org-scoped, and the source plan's Campaigns and Tasks are then read
 * scoped to that source conference.
 */

export interface CopySourceOption {
  planId: string
  conferenceId: string
  conferenceTitle: string
  /** YYYY-MM-DD */
  startDate: string | null
  campaigns: number
  /** Tasks a copy would carry (Trigger and expansion Tasks excluded). */
  tasks: number
}

/** The other conferences of an organization. */
async function otherConferenceIds(
  orgId: string,
  conferenceId: string,
): Promise<string[]> {
  const ids = await scopedFetch<string[] | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "conference" && _id != $currentId && !(_id in path("drafts.**"))]._id`,
    { currentId: conferenceId },
    { cache: 'no-store' },
  )
  return ids ?? []
}

/** Plans of the organization's other editions, newest edition first. */
export async function getCopySources(
  orgId: string,
  conferenceId: string,
): Promise<CopySourceOption[]> {
  const conferenceIds = await otherConferenceIds(orgId, conferenceId)
  if (conferenceIds.length === 0) return []
  // groq-global-scoped: `$conferenceIds` is the ORG-scoped conference list read
  // by `otherConferenceIds`, so every root below is inside this organization.
  const plans = `*[_type == "marketingPlan" && conference._ref in $conferenceIds && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(conference->startDate desc){
    "planId": _id,
    "conferenceId": conference._ref,
    "conferenceTitle": conference->title,
    "startDate": conference->startDate
  }`
  // groq-global-scoped: same org-scoped `$conferenceIds` as the plans read.
  const campaigns = `*[_type == "marketingCampaign" && conference._ref in $conferenceIds && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{ "planId": plan._ref }`
  // groq-global-scoped: same org-scoped `$conferenceIds` as the plans read.
  const tasks = `*[_type == "marketingTask" && conference._ref in $conferenceIds && !(origin in ["trigger", "expansion"]) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{ "planId": plan._ref }`
  const read = await clientReadUncached.fetch<{
    plans:
      | {
          planId: string
          conferenceId: string | null
          conferenceTitle: string | null
          startDate: string | null
        }[]
      | null
    campaigns: { planId: string | null }[] | null
    tasks: { planId: string | null }[] | null
  } | null>(
    `{ "plans": ${plans}, "campaigns": ${campaigns}, "tasks": ${tasks} }`,
    { conferenceIds },
    { cache: 'no-store' },
  )
  const count = (rows: { planId: string | null }[] | null, planId: string) =>
    (rows ?? []).filter((r) => r.planId === planId).length
  return (read?.plans ?? [])
    .filter((r): r is typeof r & { conferenceId: string } => !!r.conferenceId)
    .map((r) => ({
      planId: r.planId,
      conferenceId: r.conferenceId,
      conferenceTitle: r.conferenceTitle ?? 'Untitled edition',
      startDate: r.startDate ?? null,
      campaigns: count(read?.campaigns ?? null, r.planId),
      tasks: count(read?.tasks ?? null, r.planId),
    }))
}

interface RawSource {
  _id: string
  conference: CopySource['conference'] | null
  campaigns:
    | {
        _id: string
        key: string | null
        title: string | null
        startMilestone: Milestone | null
        startOffsetDays: number | null
        endMilestone: Milestone | null
        endOffsetDays: number | null
        primaryOutcome: Outcome | null
        outcomeTargetPage: string | null
        target: number | null
        triggers: CampaignTrigger[] | null
        optional: boolean | null
      }[]
    | null
  tasks:
    | (Omit<CopySourceTask, 'prerequisiteIds'> & {
        prerequisiteIds: (string | null)[] | null
      })[]
    | null
}

/**
 * The plan to copy, or null when the id is not a plan of another edition of
 * this organization (no existence oracle: foreign and missing look alike).
 */
export async function getCopySource(
  planId: string,
  orgId: string,
  conferenceId: string,
): Promise<CopySource | null> {
  const conferenceIds = await otherConferenceIds(orgId, conferenceId)
  if (conferenceIds.length === 0) return null
  // groq-global-scoped: `$conferenceIds` is the ORG-scoped conference list read
  // by `otherConferenceIds`; a plan of any other tenant simply does not match.
  const query = `*[_type == "marketingPlan" && _id == $planId && conference._ref in $conferenceIds && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0].conference._ref`
  const sourceConferenceId = await clientReadUncached.fetch<string | null>(
    query,
    { conferenceIds, planId },
    { cache: 'no-store' },
  )
  if (!sourceConferenceId) return null
  const row = await scopedFetch<RawSource | null>(
    clientReadUncached,
    { conferenceId: sourceConferenceId },
    `*[_type == "marketingPlan" && _id == $planId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      "conference": conference->{
        title, city, venueName, startDate, endDate,
        cfpStartDate, cfpEndDate, cfpNotifyDate, programDate,
        earlyBirdEndDate, registrationCloseDate, speakersAnnouncedDate,
        sponsorDeadlineDate, recordingsLiveDate, ticketTargets
      },
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(startDate asc){
        _id, key, title, startMilestone, startOffsetDays, endMilestone, endOffsetDays,
        primaryOutcome, outcomeTargetPage, target,
        "triggers": triggers[]{ event, taskRecipeKey }, optional
      },
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
        _id, "campaignId": campaign._ref, key, title, kind, channel,
        milestone, offsetDays, dueAt, origin,
        "prerequisiteIds": prerequisites[]._ref,
        targetPage, alt, instructions,
        "variant": select(variant->conference._ref == conference._ref => variant->{ body, link, scheduledAt })
      }
    }`,
    { planId },
    { cache: 'no-store' },
  )
  if (!row?.conference) return null
  return {
    plan: { _id: row._id },
    conference: row.conference,
    campaigns: (row.campaigns ?? []).flatMap((c) =>
      c.key && c.startMilestone && c.endMilestone && c.primaryOutcome
        ? [
            {
              _id: c._id,
              key: c.key,
              title: c.title ?? c.key,
              startMilestone: c.startMilestone,
              startOffsetDays: c.startOffsetDays ?? 0,
              endMilestone: c.endMilestone,
              endOffsetDays: c.endOffsetDays ?? 0,
              primaryOutcome: c.primaryOutcome,
              outcomeTargetPage: c.outcomeTargetPage ?? null,
              target: c.target ?? null,
              triggers: (c.triggers ?? []).filter(
                (t) => t?.event && t.taskRecipeKey,
              ),
              optional: c.optional === true,
            },
          ]
        : [],
    ),
    tasks: (row.tasks ?? []).flatMap((t) =>
      t.campaignId && t.key && t.kind
        ? [
            {
              ...t,
              title: t.title ?? t.key,
              channel: t.channel ?? null,
              milestone: t.milestone ?? null,
              offsetDays: t.offsetDays ?? null,
              dueAt: t.dueAt ?? null,
              origin: t.origin ?? null,
              prerequisiteIds: (t.prerequisiteIds ?? []).filter(
                (id): id is string => typeof id === 'string',
              ),
              targetPage: t.targetPage ?? null,
              alt: t.alt ?? null,
              instructions: t.instructions ?? null,
              variant: t.variant?.body != null ? t.variant : null,
            },
          ]
        : [],
    ),
  }
}
