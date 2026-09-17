import {
  campaignWindow,
  createCampaign,
  updateCampaign,
  readCampaignForEditing,
} from '@/lib/marketing/editing'
import {
  readDeletionTree,
  deletionPreview,
  deletePlanTree,
  DeletionRefusalError,
} from '@/lib/marketing/deletion'
import { PAGE_OUTCOMES } from '@/lib/marketing/types'
import { isOutreach, outreachBody } from '@/lib/marketing/outreach'
import {
  getOutreachCampaign,
  resolveOutreachSponsor,
} from '@/lib/marketing/outreach/sanity'
import {
  materializeTask,
  appendRecords,
  CHANNEL_SLOT,
  slotAt,
} from '@/lib/marketing/materialize'
import {
  addMessage,
  createGeneralConversation,
  ensureSponsorConversation,
  getConversationById,
} from '@/lib/messaging/sanity'
import { speakerHasStandingInConference } from '@/lib/messaging/standing'
import { getSponsorFanoutContext } from '@/lib/messaging/sponsor'
import { notifyNewMessage, notifySponsorMessage } from '@/lib/messaging/notify'
import { claimSendSlot } from '@/lib/messaging/send-rate'
import { runAfterResponse } from '@/server/runAfterResponse'
import { getStudioTask, getRenderSiblings } from '@/lib/marketing/render-sanity'
import {
  renderAlt,
  renderHandoffRecipients,
} from '@/lib/marketing/render-handoff'
import { handoffStudioAttachment } from '@/lib/social/sanity'
import { createHash, randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import { loadReport } from '@/lib/marketing/report'
import { buildReportCsv } from '@/lib/marketing/report-csv'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { requireDocumentInCurrentConference } from '@/server/tenancy'
import {
  AttachTaskAssetSchema,
  CreateTaskSchema,
  SendOutreachSchema,
  CampaignIdSchema,
  CreateCampaignSchema,
  UpdateCampaignSchema,
  DeleteCampaignSchema,
  MarketingReportSchema,
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
  createMarketingTask,
  deleteTask,
  getCampaignLedger,
  getPlanView,
  getPlanId,
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
import {
  getCurrentDateTime,
  osloTodayDateString,
  instantToOsloLocalInput,
} from '@/lib/time'

/**
 * The Marketing Plan's organizer surface (spec §8). `adminProcedure` is the
 * authz waist; the conference is ALWAYS the request domain's — a client can
 * name which optional Campaigns it wants, never which edition it seeds.
 */

/** Preview and acceptance use the identical scoped read and refusal. */
async function loadDeletion(conferenceId: string, campaignId?: string) {
  const tree = await readDeletionTree(conferenceId, campaignId)
  if (!tree || (campaignId && tree.campaigns.length === 0))
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Marketing plan or Campaign not found',
    })
  try {
    return { tree, preview: deletionPreview(tree) }
  } catch (error) {
    if (error instanceof DeletionRefusalError)
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
    throw error
  }
}

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
    /** All manual Kinds share the same atomic Task/post/variant writer. */
    create: adminProcedure
      .input(CreateTaskSchema)
      .mutation(async ({ ctx, input }) => {
        const conferenceId = await requireDocumentInCurrentConference(
          input.campaignId,
          'marketingCampaign',
        )
        const campaign = await getOutreachCampaign(
          input.campaignId,
          conferenceId,
        )
        if (!campaign)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Campaign not found',
          })
        const subject =
          input.kind === 'speakerOutreach'
            ? { _id: input.subjectId!, type: 'speaker' as const }
            : input.kind === 'sponsorOutreach'
              ? { _id: input.subjectId!, type: 'sponsor' as const }
              : undefined
        if (
          subject?.type === 'speaker' &&
          !(await speakerHasStandingInConference(subject._id, conferenceId))
        )
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'The speaker has no standing in this conference.',
          })
        if (
          subject?.type === 'sponsor' &&
          !(await resolveOutreachSponsor(subject._id, conferenceId))
        )
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'This sponsor has no sponsorForConference relationship in this conference.',
          })
        const conference = {
          _id: conferenceId,
          baseUrl: conferenceBaseUrl(await requireConference()),
        }
        const id = `marketingTask.${randomUUID()}`
        const buildTask = (
          taskId: string,
          channel: typeof input.channel,
          at: string,
        ) => {
          const records = materializeTask({
            recipe: {
              key: taskId,
              beat: id,
              title: input.title,
              kind: input.kind,
              channel,
              targetPage: input.targetPage,
              instructions: input.instructions,
              subjectSource: subject?.type ?? 'none',
            },
            taskId,
            key: `custom-${randomUUID()}`,
            campaign,
            planId: campaign.planId,
            conference,
            values: {},
            at,
            anchor: null,
            provisional: false,
            assigneeId: campaign.ownerId ?? ctx.speaker._id,
            prerequisiteIds: [],
            subject,
            origin: 'manual',
            body: '',
            alt: '',
            newId: (type) => `${type}.${randomUUID()}`,
          })
          // Publishing materialization owns copy and scheduling; manual
          // instructions are Task metadata for every Kind.
          if (input.instructions !== undefined)
            records.tasks[0].instructions = input.instructions
          return records
        }
        const records = buildTask(id, input.channel, input.dueAt)
        if (input.alsoCreateSibling) {
          const otherChannel =
            input.channel === 'linkedin' ? 'bluesky' : 'linkedin'
          const date = instantToOsloLocalInput(input.dueAt).slice(0, 10)
          appendRecords(
            records,
            buildTask(
              `marketingTask.${randomUUID()}`,
              otherChannel,
              slotAt(date, CHANNEL_SLOT[otherChannel]),
            ),
          )
        }
        if (!(await createMarketingTask(records, conferenceId)))
          throw conflict()
        return {
          taskId: id,
          ceilingWarnings: records.variants.length
            ? await ceilingWarningsFor(conferenceId, {
                variantIds: records.variants.map((v) => v._id),
              })
            : [],
        }
      }),

    sendOutreach: adminProcedure
      .input(SendOutreachSchema)
      .mutation(async ({ ctx, input }) => {
        const { conferenceId, data } = await loadTask(input.taskId)
        const { task } = data
        if (!isOutreach(task.kind))
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This Task is not outreach.',
          })
        if (task.messageId)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This outreach message has already been sent.',
          })
        if (task._rev !== input.rev) throw conflict()
        if (task.status !== 'open')
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only open outreach Tasks can send.',
          })
        const expectedType =
          task.kind === 'speakerOutreach' ? 'speaker' : 'sponsor'
        if (!task.subject || task.subject.type !== expectedType) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `This outreach Task requires a ${expectedType} subject.`,
          })
        }
        if (!task.targetPage)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Pick a destination before sending outreach.',
          })
        const conference = await requireConference()
        // Validate even hand-edited destinations before creating a conversation.
        try {
          taggedUrl({
            baseUrl: conferenceBaseUrl(conference),
            targetPage: task.targetPage,
            channel: 'outreach',
            campaignKey: data.campaign.key,
            taskKey: task.key,
          })
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'The outreach destination must be on this conference site.',
          })
        }
        let sponsor: Awaited<ReturnType<typeof resolveOutreachSponsor>> = null
        if (expectedType === 'speaker') {
          if (
            !(await speakerHasStandingInConference(
              task.subject._id,
              conferenceId,
            ))
          ) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'The speaker has no standing in this conference.',
            })
          }
        } else {
          sponsor = await resolveOutreachSponsor(task.subject._id, conferenceId)
          if (!sponsor)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'This sponsor has no sponsorForConference relationship in this conference.',
            })
        }
        if (!claimSendSlot(ctx.speaker._id))
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message:
              'You are sending messages too quickly. Please wait a moment and try again.',
          })
        const conversationId = sponsor
          ? await ensureSponsorConversation({
              conferenceId,
              sponsorForConferenceId: sponsor._id,
              sponsorName: sponsor.name,
              createdById: ctx.speaker._id,
            })
          : await createGeneralConversation({
              // A failed send may leave an empty thread. Bind retries to the
              // recipient too, so a later subject edit cannot reuse their thread.
              id: `conversation.marketing.${createHash('sha256')
                .update(
                  JSON.stringify([conferenceId, task._id, task.subject._id]),
                )
                .digest('hex')}`,
              conferenceId,
              createdById: ctx.speaker._id,
              subject: task.title,
              subjectSpeakerId: task.subject._id,
            })
        const conversation = await getConversationById(conversationId)
        if (!conversation)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to load conversation',
          })
        if (
          conversation.conferenceId !== conferenceId ||
          (sponsor
            ? conversation.conversationType !== 'sponsor' ||
              !conversation.participants?.some(
                (party) =>
                  party.partyType === 'sponsor' &&
                  party.sponsorForConferenceId === sponsor._id,
              )
            : conversation.conversationType !== 'general' ||
              conversation.subjectSpeakerId !== task.subject._id)
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'The conversation no longer matches this outreach recipient.',
          })
        let message
        try {
          message = await addMessage({
            conversationId,
            authorId: ctx.speaker._id,
            body: input.body,
            marketingTask: { id: task._id, rev: input.rev },
          })
        } catch (error) {
          if ((error as { statusCode?: number })?.statusCode === 409)
            throw conflict()
          throw error
        }
        // No later Task patch: delivery and completion have already committed together.
        const delivered = message
        const sfcId = sponsor?._id
        runAfterResponse(async () => {
          if (sfcId) {
            const sfc = await getSponsorFanoutContext(sfcId)
            if (sfc)
              await notifySponsorMessage({
                conversation,
                message: delivered,
                sfc,
                authorOrganizerId: ctx.speaker._id,
              })
          } else {
            await notifyNewMessage({
              conversation,
              message: delivered,
              conference,
              authorId: ctx.speaker._id,
            })
          }
        })
        return { messageId: message._id }
      }),

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
        if (
          task.targetPage &&
          ((task.kind === 'publishing' && task.channel) ||
            isOutreach(task.kind))
        ) {
          try {
            taggedLink = taggedUrl({
              baseUrl,
              targetPage: task.targetPage,
              channel: isOutreach(task.kind) ? 'outreach' : task.channel!,
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
          outreachBody: outreachBody(task, conference.title, taggedLink),
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
        if (input.targetPage !== undefined && !isOutreach(data.task.kind)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only outreach destinations are edited here.',
          })
        }
        if (
          input.targetPage !== undefined &&
          (data.task.messageId || data.task.status !== 'open')
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only unsent, open outreach Tasks can change destination.',
          })
        }
        const fields: Record<string, unknown> = {}
        if (input.targetPage !== undefined) fields.targetPage = input.targetPage
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
        const landed = await updateTaskFields(
          data.task._id,
          rev,
          {
            prerequisites: input.prerequisiteIds.map((id) => ({
              _key: randomUUID(),
              _type: 'reference',
              _ref: id,
              _weak: true,
            })),
          },
          [],
          { id: data.task.campaignId },
        )
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

    attachAsset: adminProcedure
      .input(AttachTaskAssetSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await requireDocumentInCurrentConference(
          input.taskId,
          'marketingTask',
        )
        const task = await getStudioTask(input.taskId, conferenceId)
        if (!task)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' })
        if (task.kind !== 'studioRender')
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only studio render Tasks accept a render.',
          })
        // Identical saved output is an idempotent handoff retry, even after its save changed the revision.
        if (task.assetId !== input.assetId) {
          if (task.pendingAssetId !== input.assetId)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Upload this image for this Task first.',
            })
          if (task._rev !== input.taskRev) throw conflict()
        }
        // Save first. Receipts belong to this image; a new render starts with none.
        const handoffDoneFor = new Set(
          task.assetId === input.assetId ? (task.handoffDoneFor ?? []) : [],
        )
        const saved = await updateTaskFields(
          task._id,
          task._rev,
          {
            asset: {
              _type: 'image',
              asset: { _type: 'reference', _ref: input.assetId },
            },
            handoffDoneFor: [...handoffDoneFor],
          },
          task.assetId !== input.assetId ? ['pendingStudioAsset'] : [],
        )
        if (!saved) throw conflict()
        const handoffFailures: string[] = []
        const handoffIssues: string[] = []
        try {
          const siblings = await getRenderSiblings(
            task.campaignId,
            conferenceId,
          )
          const recipients = renderHandoffRecipients(task._id, siblings)
          for (const recipient of recipients) {
            if (handoffDoneFor.has(recipient.variantId!)) continue
            try {
              const outcome = await handoffStudioAttachment(
                recipient.variantId!,
                conferenceId,
                {
                  assetId: input.assetId,
                  alt: renderAlt(task),
                },
              )
              if (typeof outcome === 'object') {
                handoffFailures.push(recipient._id)
                handoffIssues.push(
                  ...outcome.issues.map((issue) => issue.message),
                )
              } else if (outcome === 'unavailable')
                handoffFailures.push(recipient._id)
              else handoffDoneFor.add(recipient.variantId!)
            } catch (error) {
              console.error('Studio handoff failed', recipient._id, error)
              handoffFailures.push(recipient._id)
            }
          }
          // This read only improves the immediate response. Editor pending state
          // is derived from current recipients and receipts, never cleared here.
          const currentRecipients = renderHandoffRecipients(
            task._id,
            await getRenderSiblings(task.campaignId, conferenceId),
          )
          if (
            handoffFailures.length === 0 &&
            currentRecipients.some(
              (current) => !handoffDoneFor.has(current.variantId!),
            )
          )
            handoffFailures.push(task._id)
        } catch (error) {
          console.error('Studio handoff discovery failed', task._id, error)
          handoffFailures.push(task._id)
        }
        if (handoffDoneFor.size > 0 || handoffFailures.length === 0) {
          try {
            // Never associate an older image's receipts with a newer render.
            const current = await getStudioTask(task._id, conferenceId)
            if (
              !current ||
              current.assetId !== input.assetId ||
              !(await updateTaskFields(current._id, current._rev, {
                asset: {
                  _type: 'image',
                  asset: { _type: 'reference', _ref: input.assetId },
                },
                handoffDoneFor: [
                  ...new Set([
                    ...(current.handoffDoneFor ?? []),
                    ...handoffDoneFor,
                  ]),
                ],
              }))
            )
              handoffFailures.push(task._id)
          } catch (error) {
            console.error('Studio handoff receipt save failed', task._id, error)
            handoffFailures.push(task._id)
          }
        }
        return {
          success: true as const,
          handoffFailures,
          ...(handoffIssues.length > 0
            ? { handoffIssues: [...new Set(handoffIssues)] }
            : {}),
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

  // marketing.report.* — all formats share the same stored-observation model.
  report: router({
    get: adminProcedure
      .input(MarketingReportSchema)
      .query(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const conference = await requireConference()
        return loadReport({ ...conference, _id: conferenceId }, input)
      }),
    exportCsv: adminProcedure
      .input(MarketingReportSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const conference = await requireConference()
        const report = await loadReport(
          { ...conference, _id: conferenceId },
          input,
        )
        return { csv: buildReportCsv(report) }
      }),
    exportPdf: adminProcedure
      .input(MarketingReportSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const conference = await requireConference()
        const report = await loadReport(
          { ...conference, _id: conferenceId },
          input,
        )
        const { renderMarketingReportPdf } =
          await import('@/lib/marketing/report-pdf')
        return {
          pdf: (await renderMarketingReportPdf(report)).toString('base64'),
        }
      }),
  }),

  campaign: router({
    editing: adminProcedure.input(CampaignIdSchema).query(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.campaignId,
        'marketingCampaign',
      )
      const campaign = await readCampaignForEditing(
        input.campaignId,
        conferenceId,
      )
      if (!campaign)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        })
      return campaign
    }),
    create: adminProcedure
      .input(CreateCampaignSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const conference = await requireConference()
        const planId = await getPlanId(conferenceId)
        if (!planId)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'This edition has no Marketing Plan',
          })
        const window = campaignWindow(
          input.window,
          milestonesOrPrecondition(conference),
        )
        if (window.endDate < window.startDate)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The Campaign must end on or after its start.',
          })
        if (
          PAGE_OUTCOMES.includes(input.primaryOutcome) &&
          !input.outcomeTargetPage
        )
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Choose the page this Outcome measures.',
          })
        const campaignId = `marketingCampaign.${randomUUID()}`
        const landed = await createCampaign({
          _id: campaignId,
          planId,
          conferenceId,
          key: `custom-${randomUUID()}`,
          title: input.title,
          primaryOutcome: input.primaryOutcome,
          target: input.target ?? null,
          outcomeTargetPage: input.outcomeTargetPage ?? null,
          ...window,
          triggers: [],
          optional: false,
        })
        if (!landed) throw conflict()
        return { campaignId, ceilingWarnings: [] as string[] }
      }),
    update: adminProcedure
      .input(UpdateCampaignSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await requireDocumentInCurrentConference(
          input.campaignId,
          'marketingCampaign',
        )
        const campaign = await readCampaignForEditing(
          input.campaignId,
          conferenceId,
        )
        if (!campaign)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Campaign not found',
          })
        if (input.rev !== campaign._rev) throw conflict()
        const { campaignId, rev, window, ...fields } = input
        const resolved = window
          ? campaignWindow(
              window,
              milestonesOrPrecondition(await requireConference()),
            )
          : {}
        if (
          'endDate' in resolved &&
          'startDate' in resolved &&
          typeof resolved.endDate === 'string' &&
          typeof resolved.startDate === 'string' &&
          resolved.endDate < resolved.startDate
        )
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The Campaign must end on or after its start.',
          })
        const outcome = input.primaryOutcome ?? campaign.primaryOutcome
        const page =
          input.outcomeTargetPage === undefined
            ? campaign.outcomeTargetPage
            : input.outcomeTargetPage
        if (PAGE_OUTCOMES.includes(outcome) && !page)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Choose the page this Outcome measures.',
          })
        const changedWindow =
          window &&
          (Object.keys(window) as (keyof typeof window)[]).some(
            (key) => window[key] !== campaign[key],
          )
        const measurementWarning =
          changedWindow &&
          [campaign.primaryOutcome, outcome].some(
            (value) =>
              value === 'cfpSubmissions' || value === 'ticketsSoldInWindow',
          )
            ? 'This window change means future Snapshots will count a different set. Stored Snapshots keep their previous numbers.'
            : null
        if (
          !(await updateCampaign(campaignId, rev, campaign.planId, {
            ...fields,
            ...resolved,
          }))
        )
          throw conflict()
        return {
          success: true as const,
          measurementWarning,
          ceilingWarnings: [] as string[],
        }
      }),
    deletionPreview: adminProcedure
      .input(CampaignIdSchema)
      .query(async ({ input }) => {
        const conferenceId = await requireDocumentInCurrentConference(
          input.campaignId,
          'marketingCampaign',
        )
        const tree = await loadDeletion(conferenceId, input.campaignId)
        return {
          ...tree.preview,
          conferenceTitle: (await requireConference()).title,
        }
      }),
    delete: adminProcedure
      .input(DeleteCampaignSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await requireDocumentInCurrentConference(
          input.campaignId,
          'marketingCampaign',
        )
        const { tree, preview } = await loadDeletion(
          conferenceId,
          input.campaignId,
        )
        const conference = await requireConference()
        if (
          preview.requiresTypedConfirmation &&
          input.confirmTitle !== conference.title
        )
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Type the conference title to confirm deletion.',
          })
        if (!(await deletePlanTree({ conferenceId, tree, deletePlan: false })))
          throw conflict()
        return { success: true as const }
      }),

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
