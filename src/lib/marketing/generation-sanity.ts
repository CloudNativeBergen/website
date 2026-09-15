import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'
import { speakerSubject, type GenerationSubject } from './expansion'
import type { TaskRecords } from './materialize'
import type { SubjectList } from './template/types'
import type { CampaignTrigger, MarketingChannel } from './types'
import { postDocument, taskDocument, variantDocument } from './sanity'

/**
 * Sanity reads and writes for the Tasks Triggers and the recurring expansion
 * create (`generation.ts`). Every read is tenant-scoped to one conference.
 */

/** The slice of a conference generation needs: Milestones, copy, base URL. */
export type GenerationConference = Pick<
  Conference,
  | '_id'
  | 'title'
  | 'city'
  | 'venueName'
  | 'domains'
  | 'startDate'
  | 'endDate'
  | 'cfpStartDate'
  | 'cfpEndDate'
  | 'cfpNotifyDate'
  | 'programDate'
  | 'earlyBirdEndDate'
  | 'registrationCloseDate'
  | 'speakersAnnouncedDate'
  | 'sponsorDeadlineDate'
  | 'recordingsLiveDate'
  | 'ticketTargets'
>

export interface GenerationCampaign {
  _id: string
  _rev: string
  key: string
  triggers: CampaignTrigger[]
  generatedKeys: string[]
}

/** A dated publishing Task of the plan, for slot occupancy. */
export interface GeneratedTaskRow {
  campaignId: string
  key: string
  channel: MarketingChannel | null
  /** ISO instant: the variant's time or `dueAt`; null when unscheduled. */
  at: string | null
}

export interface GenerationContext {
  plan: { _id: string; ownerId: string | null }
  conference: GenerationConference
  campaigns: GenerationCampaign[]
  tasks: GeneratedTaskRow[]
}

/**
 * The plan, its Campaigns (with their revisions and generation markers) and
 * the subject Tasks already on them, in ONE round trip. Null without a plan.
 */
export async function getGenerationContext(
  conferenceId: string,
): Promise<GenerationContext | null> {
  const row = await scopedFetch<{
    _id: string
    ownerId: string | null
    conference: GenerationConference | null
    campaigns:
      | {
          _id: string
          _rev: string
          key: string | null
          triggers: CampaignTrigger[] | null
          generatedKeys: string[] | null
        }[]
      | null
    tasks: GeneratedTaskRow[] | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      "ownerId": owner._ref,
      "conference": conference->{
        _id, title, city, venueName, domains, startDate, endDate,
        cfpStartDate, cfpEndDate, cfpNotifyDate, programDate,
        earlyBirdEndDate, registrationCloseDate, speakersAnnouncedDate,
        sponsorDeadlineDate, recordingsLiveDate, ticketTargets
      },
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
        _id, _rev, key, "triggers": triggers[]{ event, taskRecipeKey }, generatedKeys
      },
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && kind == "publishing" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
        "campaignId": campaign._ref, key, channel,
        "at": coalesce(select(variant->conference._ref == conference._ref => variant->scheduledAt), dueAt)
      }
    }`,
    {},
    { cache: 'no-store' },
  )
  if (!row?.conference?._id) return null
  return {
    plan: { _id: row._id, ownerId: row.ownerId ?? null },
    conference: row.conference,
    campaigns: (row.campaigns ?? [])
      .filter((c): c is typeof c & { key: string } => !!c.key)
      .map((c) => ({
        _id: c._id,
        _rev: c._rev,
        key: c.key,
        triggers: (c.triggers ?? []).filter((t) => t?.event && t.taskRecipeKey),
        generatedKeys: c.generatedKeys ?? [],
      })),
    tasks: row.tasks ?? [],
  }
}

interface RawTalk {
  _id: string
  title: string | null
  speakers:
    ({ _id: string; name: string | null; title: string | null } | null)[] | null
}

const TALK_FIELDS = `_id, title, "speakers": speakers[]->{ _id, name, title }`

function talkSubject(talk: RawTalk): GenerationSubject {
  const first = (talk.speakers ?? []).find((s) => s?._id)
  return {
    _id: talk._id,
    type: 'talk',
    values: {
      ...(talk.title ? { title: talk.title } : {}),
      ...(first?.name ? { name: first.name } : {}),
      ...(first?.title ? { company: first.title } : {}),
    },
  }
}

/** Speakers of confirmed talks, each once, with their first talk's title. */
function speakerSubjects(talks: RawTalk[]): GenerationSubject[] {
  const seen = new Map<string, GenerationSubject>()
  for (const talk of talks) {
    for (const s of talk.speakers ?? []) {
      if (!s?._id || seen.has(s._id)) continue
      seen.set(s._id, speakerSubject(s, talk.title))
    }
  }
  return [...seen.values()]
}

/**
 * The subject list a cadence expands over (spec §5.4), oldest first so the
 * round-robin order is stable from one run to the next.
 */
export async function getSubjectList(
  conferenceId: string,
  list: SubjectList,
): Promise<GenerationSubject[]> {
  switch (list) {
    case 'confirmedSpeakers': {
      const talks = await scopedFetch<RawTalk[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "talk" && status == "confirmed" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_createdAt asc){${TALK_FIELDS}}`,
        {},
        { cache: 'no-store' },
      )
      return speakerSubjects(talks ?? [])
    }
    case 'scheduledTalks': {
      const talks = await scopedFetch<RawTalk[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "talk" && status == "confirmed" && _id in *[_type == "schedule" && conference._ref == $conferenceId && (status == "official" || !defined(status)) && !(_id in path("drafts.**"))].tracks[].talks[].talk._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_createdAt asc){${TALK_FIELDS}}`,
        {},
        { cache: 'no-store' },
      )
      return (talks ?? []).map(talkSubject)
    }
    case 'recordedTalks': {
      const talks = await scopedFetch<RawTalk[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "talk" && status == "confirmed" && count(attachments[_type == "urlAttachment" && attachmentType == "recording"]) > 0 && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_createdAt asc){${TALK_FIELDS}}`,
        {},
        { cache: 'no-store' },
      )
      return (talks ?? []).map(talkSubject)
    }
  }
}

/**
 * A signed sponsor of this conference as a Trigger subject, or null when the
 * record is not ours or is not (or no longer) signed.
 */
export async function getSignedSponsorSubject(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<GenerationSubject | null> {
  const row = await scopedFetch<{
    signed: boolean | null
    sponsor: { _id: string; name: string | null } | null
    tier: string | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && _id == $id][0]{
      "signed": contractStatus == "contract-signed" || status == "closed-won",
      "sponsor": sponsor->{ _id, name },
      "tier": tier->title
    }`,
    { id: sponsorForConferenceId },
    { cache: 'no-store' },
  )
  if (!row?.signed || !row.sponsor?._id) return null
  return {
    _id: row.sponsor._id,
    type: 'sponsor',
    values: {
      ...(row.sponsor.name
        ? { name: row.sponsor.name, company: row.sponsor.name }
        : {}),
      ...(row.tier ? { tier: row.tier } : {}),
    },
  }
}

/**
 * Sponsors that became signed since `since`: the cron's safety net for a
 * `sponsor.status.changed` event whose handler failed or was deferred (a bulk
 * move). A signed contract is dated by `contractSignedAt`; a deal closed won
 * without one is caught by when the record last changed.
 */
export async function getRecentlySignedSponsorIds(
  conferenceId: string,
  since: string,
): Promise<string[]> {
  const ids = await scopedFetch<string[] | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && !(_id in path("drafts.**")) && ((contractStatus == "contract-signed" && dateTime(coalesce(contractSignedAt, _updatedAt)) >= dateTime($since)) || (status == "closed-won" && dateTime(_updatedAt) >= dateTime($since)))]._id`,
    { since },
    { cache: 'no-store' },
  )
  return ids ?? []
}

function isConflict(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    (message.includes('revision') && message.includes('mismatch')) ||
    message.includes('already exists')
  )
}

/**
 * Commit generated Tasks (with their posts and variants) and record their
 * keys on the Campaign in ONE transaction, compare-and-set on the Campaign
 * revision the generator read. A concurrent generator, or a Task id that
 * already exists, fails the whole transaction: false, re-read and retry.
 */
export async function commitGeneratedTasks(input: {
  conferenceId: string
  campaignId: string
  campaignRev: string
  records: TaskRecords
}): Promise<boolean> {
  const now = getCurrentDateTime()
  const conference = { _type: 'reference' as const, _ref: input.conferenceId }
  const tx = clientWrite.transaction()
  for (const p of input.records.posts)
    tx.create(postDocument(p, conference, now))
  for (const v of input.records.variants) {
    tx.create(variantDocument(v, conference, now))
  }
  for (const t of input.records.tasks) tx.create(taskDocument(t, conference))
  tx.patch(input.campaignId, (p) =>
    p
      .ifRevisionId(input.campaignRev)
      .setIfMissing({ generatedKeys: [] })
      .append(
        'generatedKeys',
        input.records.tasks.map((t) => t.key),
      ),
  )
  try {
    await tx.commit()
    return true
  } catch (error) {
    if (isConflict(error)) return false
    throw error
  }
}

/**
 * Conferences with a Marketing Plan, for the expansion cron. Plans are few
 * (one per edition), so the eligibility window is decided by the caller.
 */
export interface PlannedConference {
  /** The plan document itself: its id is not always the seeded one. */
  planId: string
  conferenceId: string
  startDate: string | null
  endDate: string | null
  recordingsLiveDate: string | null
  /** When the cron last ran for this plan; null before its first run. */
  lastExpandedAt: string | null
}

export async function getPlannedConferences(): Promise<PlannedConference[]> {
  // groq-global: the cron runs across every tenant and handles each conference separately.
  const query = `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
    "planId": _id,
    "conferenceId": conference._ref,
    "startDate": conference->startDate,
    "endDate": conference->endDate,
    "recordingsLiveDate": conference->recordingsLiveDate,
    lastExpandedAt
  }`
  const rows = await clientReadUncached.fetch<
    (Omit<PlannedConference, 'conferenceId'> & {
      conferenceId: string | null
    })[]
  >(query, {}, { cache: 'no-store' })
  return (rows ?? [])
    .filter((r): r is typeof r & { conferenceId: string } => !!r.conferenceId)
    .map((r) => ({ ...r, lastExpandedAt: r.lastExpandedAt ?? null }))
}

/**
 * Stamp a plan as expanded, whether or not anything was created: the cron
 * orders by this, so a plan it has just served goes to the back of the queue.
 * BEST-EFFORT: the stamp is queue bookkeeping, so a failed write is logged
 * and the expansion it precedes runs anyway.
 */
export async function markPlanExpanded(
  planId: string,
  at: string,
): Promise<void> {
  try {
    await clientWrite.patch(planId).set({ lastExpandedAt: at }).commit()
  } catch (error) {
    console.error(`Could not stamp ${planId} as expanded`, error)
  }
}
