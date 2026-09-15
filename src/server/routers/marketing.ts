import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { adminProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { requireDocumentInCurrentConference } from '@/server/tenancy'
import {
  CampaignIdSchema,
  CompleteTaskSchema,
  CopyPlanSchema,
  SeedPlanSchema,
  SetPlanOwnerSchema,
  SetTaskAssigneeSchema,
  SetTaskDateSchema,
  SetTaskPrerequisitesSchema,
  SkipTaskSchema,
  TaskIdSchema,
  UpdateTaskSchema,
} from '@/server/schemas/marketing'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import { expandTemplate, type SeedConference } from '@/lib/marketing/seed'
import {
  approveTask,
  commitSeedPlan,
  deleteTask,
  getCampaignLedger,
  getPlanView,
  getTaskEditorData,
  isConferenceOrganizer,
  setPlanOwner,
  setTaskDate,
  updateTaskFields,
} from '@/lib/marketing/sanity'
import { copyPlan } from '@/lib/marketing/copy'
import { getCopySource, getCopySources } from '@/lib/marketing/copy-sanity'
import {
  ceilingWarningsFor,
  channelCeilingWarnings,
} from '@/lib/marketing/ceiling-check'
import { taggedUrl } from '@/lib/marketing/link'
import { pagePickerOptions } from '@/lib/marketing/pages'
import type {
  CampaignLedgerView,
  PlanView,
  StoredTaskEditorData,
  TaskEditorData,
  TaskView,
} from '@/lib/marketing/types'
import {
  chargeSnapshotRefresh,
  conferenceOrgId,
  runConferenceSnapshots,
  snapshotDeps,
} from '@/lib/marketing/snapshots'
import {
  getSocialPostDefaultTime,
  getSocialPostEditorInputs,
  getSocialVariantEditorData,
} from '@/lib/social/sanity'
import { scheduleIssues } from '@/lib/social/schedule-check'
import { canOrganizerTransition } from '@/lib/social/state-machine'
import type { VariantStatus } from '@/lib/social/types'
import { getOrganizersByConference } from '@/lib/speaker/sanity'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'

/**
 * The Marketing Plan's organizer surface (spec §8). `adminProcedure` is the
 * authz waist; the conference is ALWAYS the request domain's — a client can
 * name which optional Campaigns it wants, never which edition it seeds.
 */

/** The domain conference, or NOT_FOUND — the same rule as `resolveConferenceId`. */
async function requireConference(): Promise<Conference> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference
}

/**
 * A conference that cannot anchor a plan (a required date missing or
 * malformed) is a settings problem the organizer can fix; say which field.
 */
function milestonesOrPrecondition(conference: Conference) {
  try {
    return resolveAllMilestones(conference)
  } catch (error) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'The conference dates cannot anchor a Marketing Plan',
    })
  }
}

/** The slice of the domain conference a new plan is built against. */
function seedConference(conference: Conference): SeedConference {
  return {
    _id: conference._id,
    title: conference.title,
    city: conference.city,
    venueName: conference.venueName,
    ticketCapacity: conference.ticketCapacity,
    baseUrl: conferenceBaseUrl(conference),
    cfpStartDate: conference.cfpStartDate,
    cfpEndDate: conference.cfpEndDate,
    cfpNotifyDate: conference.cfpNotifyDate,
    programDate: conference.programDate,
    startDate: conference.startDate,
    endDate: conference.endDate,
    earlyBirdEndDate: conference.earlyBirdEndDate,
    registrationCloseDate: conference.registrationCloseDate,
    speakersAnnouncedDate: conference.speakersAnnouncedDate,
    sponsorDeadlineDate: conference.sponsorDeadlineDate,
    recordingsLiveDate: conference.recordingsLiveDate,
    ticketTargets: conference.ticketTargets,
  }
}

function planExists(): TRPCError {
  return new TRPCError({
    code: 'CONFLICT',
    message: 'This edition already has a Marketing Plan',
  })
}

/** The organization a conference belongs to, or NOT_FOUND (fails closed). */
function requireOrganization(conference: Conference): string {
  const orgId = conference.organization?._ref
  if (!orgId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'This conference belongs to no organization',
    })
  }
  return orgId
}

/**
 * The Task the client named, guarded BEFORE it is read (the id is proven to
 * be a marketingTask of the request's conference), with its variant's
 * editor data when it is a publishing Task. NOT_FOUND for a foreign id and
 * for a missing one alike: no existence oracle.
 */
async function loadTask(taskId: string): Promise<{
  conferenceId: string
  data: StoredTaskEditorData
}> {
  const conferenceId = await requireDocumentInCurrentConference(
    taskId,
    'marketingTask',
  )
  const data = await getTaskEditorData(taskId, conferenceId)
  if (!data) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' })
  }
  if (data.task.kind === 'publishing' && data.task.variantId) {
    // The Task read followed the variant only when it is ours; the by-id
    // read below is therefore admitted.
    data.variant = await getSocialVariantEditorData(data.task.variantId)
  }
  return { conferenceId, data }
}

function conflict(): TRPCError {
  return new TRPCError({
    code: 'CONFLICT',
    message: 'The Task changed while you were editing. Reload and retry.',
  })
}

/** Statuses in which a publishing Task's time may still be moved by hand. */
const RETIMABLE: readonly VariantStatus[] = ['draft', 'scheduled', 'failed']

/** The Kinds whose completion is a tick (spec §2.3). */
const TICKABLE = ['checklist', 'eventPageUpdate'] as const

/**
 * Would `taskId` depending on `proposed` close a loop? Follows the existing
 * Prerequisite edges of the Campaign (siblings) from each proposed id.
 */
function closesCycle(
  taskId: string,
  proposed: string[],
  siblings: TaskView[],
): boolean {
  const edges = new Map(siblings.map((s) => [s._id, s.prerequisiteIds]))
  const seen = new Set<string>()
  const stack = [...proposed]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(edges.get(id) ?? []))
  }
  return false
}

export const marketingRouter = router({
  plan: router({
    /** The edition's plan on the Milestone timeline, or null before seeding. */
    get: adminProcedure.query(async (): Promise<PlanView | null> => {
      const conference = await requireConference()
      const stored = await getPlanView(conference._id)
      if (!stored) return null
      const milestones = milestonesOrPrecondition(conference)
      const [{ speakers }, ceilings] = await Promise.all([
        getOrganizersByConference(conference._id),
        channelCeilingWarnings(conference._id),
      ])
      return {
        ...stored,
        milestones,
        today: osloTodayDateString(),
        ceilingWarnings: ceilings,
        organizers: (speakers ?? []).map((s) => ({ _id: s._id, name: s.name })),
      }
    }),

    /**
     * Seed the edition's plan from the built-in Template (spec §3.1). One
     * plan per edition: a second seed is refused, and a concurrent one loses
     * the transaction on the deterministic plan id.
     */
    seed: adminProcedure
      .input(SeedPlanSchema)
      .mutation(async ({ ctx, input }) => {
        const conference = await requireConference()
        if (await getPlanView(conference._id)) throw planExists()
        // Resolve first so a missing required date is reported as such
        // rather than as a generic expansion failure.
        milestonesOrPrecondition(conference)
        const seed = expandTemplate({
          template: BUILTIN_TEMPLATE,
          conference: seedConference(conference),
          includeOptional: input.includeOptional,
          ownerId: ctx.speaker._id,
          now: getCurrentDateTime(),
          newId: (type) => `${type}.${randomUUID()}`,
        })
        const result = await commitSeedPlan(seed)
        if (!result.committed) throw planExists()
        return {
          planId: seed.plan._id,
          campaigns: seed.campaigns.length,
          tasks: seed.tasks.length,
        }
      }),

    /** The organization's other editions that have a plan to copy (#1017). */
    copySources: adminProcedure.query(async () => {
      const conference = await requireConference()
      return getCopySources(requireOrganization(conference), conference._id)
    }),

    /**
     * Copy a previous edition's plan (spec §3.1, #1017): re-anchored by
     * Milestone and offset, Trigger and expansion Tasks left behind, Triggers
     * kept. The source must be a plan of ANOTHER edition of this
     * organization; one plan per edition, as for seeding.
     */
    copy: adminProcedure
      .input(CopyPlanSchema)
      .mutation(async ({ ctx, input }) => {
        const conference = await requireConference()
        if (await getPlanView(conference._id)) throw planExists()
        milestonesOrPrecondition(conference)
        const source = await getCopySource(
          input.fromPlanId,
          requireOrganization(conference),
          conference._id,
        )
        if (!source) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'That plan was not found in this organization',
          })
        }
        const copy = copyPlan({
          source,
          template: BUILTIN_TEMPLATE,
          conference: seedConference(conference),
          ownerId: ctx.speaker._id,
          now: getCurrentDateTime(),
          newId: (type) => `${type}.${randomUUID()}`,
        })
        const result = await commitSeedPlan(copy)
        if (!result.committed) throw planExists()
        return {
          planId: copy.plan._id,
          campaigns: copy.campaigns.length,
          tasks: copy.tasks.length,
        }
      }),

    /**
     * Delegate the plan (spec §3.1): any organizer may hand it to another
     * organizer of this conference. The owner is the default assignee of
     * Tasks created from now on.
     */
    setOwner: adminProcedure
      .input(SetPlanOwnerSchema)
      .mutation(async ({ input }) => {
        const conference = await requireConference()
        if (!(await isConferenceOrganizer(conference._id, input.ownerId))) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The owner must be an organizer of this conference.',
          })
        }
        const landed = await setPlanOwner(conference._id, input.ownerId)
        if (!landed) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'This edition has no Marketing Plan',
          })
        }
        return { success: true as const }
      }),
  }),

  /**
   * The Task editor (#1012, spec §7 "Task editor", §8). Every write is
   * compare-and-set on the revision the editor loaded, and Prerequisites
   * are never consulted by any of them (§3.2: shown, never enforced).
   */
  task: router({
    get: adminProcedure
      .input(TaskIdSchema)
      .query(async ({ input }): Promise<TaskEditorData> => {
        const [{ conferenceId, data }, conference] = await Promise.all([
          loadTask(input.taskId),
          requireConference(),
        ])
        const baseUrl = conferenceBaseUrl(conference)
        const { task } = data
        const { speakers } = await getOrganizersByConference(conferenceId)
        let taggedLink: string | null = null
        if (task.kind === 'publishing' && task.channel && task.targetPage) {
          try {
            taggedLink = taggedUrl({
              baseUrl,
              targetPage: task.targetPage,
              channel: task.channel,
              campaignKey: data.campaign.key,
              taskKey: task.key,
            })
          } catch {
            // A stored page that no longer derives (hand-edited) shows as
            // "no link" and the picker asks for a page again.
            taggedLink = null
          }
        }
        return {
          ...data,
          baseUrl,
          taggedLink,
          pages: pagePickerOptions(task.subject),
          organizers: (speakers ?? []).map((s) => ({
            _id: s._id,
            name: s.name,
          })),
        }
      }),

    update: adminProcedure
      .input(UpdateTaskSchema)
      .mutation(async ({ input }) => {
        const { data } = await loadTask(input.taskId)
        const fields: Record<string, unknown> = {}
        const unset: string[] = []
        if (input.title !== undefined) fields.title = input.title
        for (const key of ['instructions', 'externalUrl'] as const) {
          const value = input[key]
          if (value === undefined) continue
          if (value === null) unset.push(key)
          else fields[key] = value
        }
        if (
          !(await updateTaskFields(
            data.task._id,
            input.rev ?? data.task._rev,
            fields,
            unset,
          ))
        ) {
          throw conflict()
        }
        return { success: true as const }
      }),

    /** The assignee must be one of this conference's organizers (§2.3). */
    setAssignee: adminProcedure
      .input(SetTaskAssigneeSchema)
      .mutation(async ({ input }) => {
        const { conferenceId, data } = await loadTask(input.taskId)
        if (!(await isConferenceOrganizer(conferenceId, input.assigneeId))) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The assignee must be an organizer of this conference.',
          })
        }
        const landed = await updateTaskFields(data.task._id, data.task._rev, {
          assignee: { _type: 'reference', _ref: input.assigneeId, _weak: true },
        })
        if (!landed) throw conflict()
        return { success: true as const }
      }),

    /**
     * Prerequisites are Tasks of the SAME Campaign (§2.3), never the Task
     * itself, and never a loop. Informational only: nothing here or in
     * `approve` reads them to decide anything.
     */
    setPrerequisites: adminProcedure
      .input(SetTaskPrerequisitesSchema)
      .mutation(async ({ input }) => {
        const { data } = await loadTask(input.taskId)
        const siblingIds = new Set(data.siblings.map((s) => s._id))
        const foreign = input.prerequisiteIds.filter(
          (id) => !siblingIds.has(id),
        )
        if (foreign.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'A Prerequisite must be another Task of the same Campaign.',
          })
        }
        if (closesCycle(data.task._id, input.prerequisiteIds, data.siblings)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That would make the Tasks wait on each other in a loop.',
          })
        }
        const rev = input.rev ?? data.task._rev
        const landed = await updateTaskFields(data.task._id, rev, {
          prerequisites: input.prerequisiteIds.map((id) => ({
            _key: randomUUID(),
            _type: 'reference',
            _ref: id,
            _weak: true,
          })),
        })
        if (!landed) throw conflict()
        return { success: true as const }
      }),

    /** Move a Task by hand: the variant's time, or `dueAt` (§3.2). */
    setDate: adminProcedure
      .input(SetTaskDateSchema)
      .mutation(async ({ input }) => {
        const { conferenceId, data } = await loadTask(input.taskId)
        const { task, variant } = data
        let variantRef: { id: string; rev: string } | null = null
        if (task.kind === 'publishing') {
          if (!variant) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'This Task has no post variant to schedule.',
            })
          }
          if (!RETIMABLE.includes(variant.variant.status)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `A ${variant.variant.status} post can no longer be re-timed.`,
            })
          }
          variantRef = { id: variant.variant._id, rev: variant.variant._rev }
        }
        const landed = await setTaskDate({
          taskId: task._id,
          taskRev: task._rev,
          at: input.at,
          variant: variantRef,
        })
        if (!landed) throw conflict()
        return {
          success: true as const,
          ceilingWarnings: variantRef
            ? await ceilingWarningsFor(conferenceId, {
                variantIds: [variantRef.id],
              })
            : [],
        }
      }),

    /**
     * Approve (§3.2): a publishing Task's variant goes `draft → scheduled`
     * — validated the way `social.scheduleVariant` validates — and the
     * approval is recorded on the Task; any other Kind only records it.
     * Open Prerequisites do not enter into it. A post pulled back to draft
     * is approved again (the approval IS the transition, so it is
     * re-recorded); a non-publishing Task is approved once.
     */
    approve: adminProcedure
      .input(TaskIdSchema)
      .mutation(async ({ ctx, input }) => {
        const { conferenceId, data } = await loadTask(input.taskId)
        const { task, variant } = data
        if (task.kind !== 'publishing') {
          if (task.approvedAt) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'This Task is already approved.',
            })
          }
          if (task.status !== 'open') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `A ${task.status} Task is not approved.`,
            })
          }
        }
        let variantStep: {
          id: string
          rev: string
          scheduledAt: string
          link: string
        } | null = null
        if (task.kind === 'publishing') {
          if (!task.targetPage || !task.channel) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Pick a target page and save the post before approving.',
            })
          }
          if (!variant) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'This Task has no post variant to approve.',
            })
          }
          const v = variant.variant
          if (
            v.status !== 'draft' ||
            !canOrganizerTransition(v.status, 'scheduled')
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `A ${v.status} post cannot be approved.`,
            })
          }
          const scheduledAt =
            v.scheduledAt ??
            (await getSocialPostDefaultTime(v.postId, v.conferenceId))
          if (!scheduledAt) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Set a time before approving.',
            })
          }
          // The tagged link is re-derived here (spec §3.4) and written with
          // the approval, so a stale or hand-edited variant never goes out
          // without the attribution the Task is measured by.
          let link: string
          try {
            link = taggedUrl({
              baseUrl: conferenceBaseUrl(await requireConference()),
              targetPage: task.targetPage,
              channel: task.channel,
              campaignKey: data.campaign.key,
              taskKey: task.key,
            })
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                error instanceof Error
                  ? error.message
                  : 'The target page is not valid',
            })
          }
          const post = await getSocialPostEditorInputs(v.postId, v.conferenceId)
          const issues = await scheduleIssues(
            { ...v, link },
            post.attachments,
            { taskOwned: true },
          )
          if (issues.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
            })
          }
          variantStep = { id: v._id, rev: v._rev, scheduledAt, link }
        }
        const landed = await approveTask({
          taskId: task._id,
          taskRev: task._rev,
          by: ctx.speaker._id,
          at: getCurrentDateTime(),
          variant: variantStep,
        })
        if (!landed) throw conflict()
        return {
          success: true as const,
          ceilingWarnings: variantStep
            ? await ceilingWarningsFor(conferenceId, {
                variantIds: [variantStep.id],
              })
            : [],
        }
      }),

    /** Tick a checklist / event-page-update Task done (§2.3). */
    complete: adminProcedure
      .input(CompleteTaskSchema)
      .mutation(async ({ input }) => {
        const { data } = await loadTask(input.taskId)
        const { task } = data
        if (!(TICKABLE as readonly string[]).includes(task.kind)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'This Kind of Task is completed by its own tool, not a tick.',
          })
        }
        if (task.status !== 'open') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `A ${task.status} Task cannot be marked done.`,
          })
        }
        const fields: Record<string, unknown> = { status: 'done' }
        const unset: string[] = []
        // The pasted URL belongs to an event-page update only (§2.3); an
        // explicit null clears one that was stored earlier.
        if (task.kind === 'eventPageUpdate') {
          if (input.externalUrl) fields.externalUrl = input.externalUrl
          else if (input.externalUrl === null) unset.push('externalUrl')
        }
        if (!(await updateTaskFields(task._id, task._rev, fields, unset))) {
          throw conflict()
        }
        return { success: true as const }
      }),

    /** Skip a non-publishing Task, with the reason (§3.2). */
    skip: adminProcedure.input(SkipTaskSchema).mutation(async ({ input }) => {
      const { data } = await loadTask(input.taskId)
      const { task } = data
      if (task.kind === 'publishing') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'A post is not skipped; delete the Task or leave it in draft.',
        })
      }
      if (task.status !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A ${task.status} Task cannot be skipped.`,
        })
      }
      const landed = await updateTaskFields(task._id, task._rev, {
        status: 'skipped',
        skipReason: input.reason,
      })
      if (!landed) throw conflict()
      return { success: true as const }
    }),

    /**
     * Delete the Task and, for a publishing Task, its variant and post
     * (§2.3). Refused while the variant is in flight or published: the
     * posting core keeps the record of a post that went out.
     */
    delete: adminProcedure.input(TaskIdSchema).mutation(async ({ input }) => {
      const { conferenceId, data } = await loadTask(input.taskId)
      const { task, variant } = data
      let variantRef: { id: string; rev: string; postId: string } | null = null
      if (variant) {
        const v = variant.variant
        if (v.status === 'publishing' || v.status === 'published') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              v.status === 'publishing'
                ? 'The post is being published right now. Try again in a minute.'
                : 'The post has been published; the record is kept.',
          })
        }
        variantRef = { id: v._id, rev: v._rev, postId: v.postId }
      }
      const landed = await deleteTask({
        taskId: task._id,
        taskRev: task._rev,
        conferenceId,
        variant: variantRef,
        dependantIds: data.siblings
          .filter((s) => s.prerequisiteIds.includes(task._id))
          .map((s) => s._id),
      })
      if (!landed) throw conflict()
      return { success: true as const }
    }),
  }),

  campaign: router({
    /**
     * The Campaign ledger (spec §7, #1018): the funnel against its Target and
     * the Campaign's Task table with per-Task numbers. Reads the stored
     * Snapshot only — the vendors are asked by the cron and by
     * `refreshSnapshots`, never by a page load.
     */
    get: adminProcedure
      .input(CampaignIdSchema)
      .query(async ({ input }): Promise<CampaignLedgerView> => {
        // GUARD BEFORE FETCH: prove the id is a Campaign of THIS conference
        // before reading anything, so a foreign id cannot be told apart from a
        // nonexistent one.
        const conferenceId = await requireDocumentInCurrentConference(
          input.campaignId,
          'marketingCampaign',
        )
        const stored = await getCampaignLedger(input.campaignId, conferenceId)
        if (!stored) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Campaign not found',
          })
        }
        const { speakers } = await getOrganizersByConference(conferenceId)
        return {
          ...stored,
          // Specified in §7, but slice 1 has no previous edition to compare
          // against: the ledger shows the slot and says the comparison is not
          // available yet rather than inventing one.
          previousEdition: null,
          organizers: (speakers ?? []).map((s) => ({
            _id: s._id,
            name: s.name,
          })),
        }
      }),
  }),

  /**
   * Re-run the snapshot engine for this edition, on demand (spec §6.4). The
   * SAME engine the daily cron runs — the button exists for "we just posted,
   * show me now", so it is metered per conference: every run is a PostHog
   * query and a Bluesky sweep against a quota.
   */
  refreshSnapshots: adminProcedure.mutation(async () => {
    const conference = await requireConference()
    if (!(await chargeSnapshotRefresh(conference._id))) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message:
          'The ledger was refreshed a moment ago. The daily run keeps it current; try again shortly.',
      })
    }
    const orgId = await conferenceOrgId(conference._id)
    const run = await runConferenceSnapshots(
      conference._id,
      snapshotDeps(orgId),
      new Date(getCurrentDateTime()),
    )
    return {
      date: run.date,
      written: run.written,
      source: run.source,
      notes: run.notes,
      ...(run.skipped ? { skipped: run.skipped } : {}),
    }
  }),
})
