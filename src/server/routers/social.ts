import { TRPCError } from '@trpc/server'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import { requireDocumentInCurrentConference } from '@/server/tenancy'
import {
  AddSocialPostAttachmentSchema,
  CreateSocialPostSchema,
  MarkSocialVariantPostedSchema,
  ScheduleSocialVariantSchema,
  SocialPostIdSchema,
  SocialVariantIdSchema,
  UpdateSocialPostDefaultTimeSchema,
  UpdateSocialVariantSchema,
} from '@/server/schemas/social'
import {
  addSocialPostAttachment,
  createSocialPost,
  deleteSocialPost,
  getSocialPostDefaultTime,
  getSocialPostEditorInputs,
  getSocialPostVariant,
  getSocialVariantEditorData,
  listSocialPostVariants,
  sanitySocialVariantStore,
  updateSocialPostDefaultTime,
  updateSocialVariantContent,
} from '@/lib/social/sanity'
import { getCurrentDateTime } from '@/lib/time'
import { canOrganizerTransition } from '@/lib/social/state-machine'
import { isSocialPlatform } from '@/lib/social/provider'
import { postUrlIssue } from '@/lib/social/provider/manual'
import {
  getPlatformConstraints,
  validatePublishInput,
} from '@/lib/social/provider/constraints'
import { offAspectOverrides, resolvePublishMedia } from '@/lib/social/media'
import { placeholderIssues, scheduleIssues } from '@/lib/social/schedule-check'
import { ceilingWarningsFor } from '@/lib/marketing/ceiling-check'
import { getTaskForVariant, getTaskLinkInputs } from '@/lib/marketing/sanity'
import { taggedUrl } from '@/lib/marketing/link'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type {
  SocialPostAttachment,
  SocialPostVariant,
  SocialVariantAttachment,
  VariantStatus,
} from '@/lib/social/types'
import type { VariantTransition } from '@/lib/social/store'
import type { PublishInput, ValidationIssue } from '@/lib/social/provider'

/** Statuses whose content an organizer may still edit. */
const EDITABLE_STATUSES: readonly VariantStatus[] = [
  'draft',
  'scheduled',
  'failed',
]

function issuesToError(issues: ValidationIssue[]): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
  })
}

/**
 * The publish input a variant's content resolves to, or a refusal when it
 * carries an attachment the post no longer has.
 */
function publishInputFor(
  variant: Pick<SocialPostVariant, 'platform' | 'body' | 'link'>,
  attachments: SocialVariantAttachment[],
  postAttachments: SocialPostAttachment[],
): PublishInput {
  const constraints = getPlatformConstraints(variant.platform)
  const media = resolvePublishMedia(attachments, postAttachments, constraints)
  if (!media) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'An attachment is no longer on the post. Reload and retry.',
    })
  }
  return { text: variant.body, media, link: variant.link ?? undefined }
}

/**
 * The posting core's organizer surface (spec §8: "variant editing goes through
 * the posting dashboard's own `social.*` procedures"). `adminProcedure` is the
 * authz waist; every client-supplied id is proven to belong to the request's
 * conference BEFORE it is read (guard before fetch, #730).
 */

/**
 * Load a variant the guard has admitted and check the machine allows the step.
 * The organizer-facing transitions are all compare-and-set on the revision we
 * read, so a cron tick claiming the variant underneath us surfaces as CONFLICT
 * rather than a silent overwrite.
 */
async function loadVariantFor(
  variantId: string,
  to: VariantStatus,
): Promise<SocialPostVariant> {
  await requireDocumentInCurrentConference(variantId, 'socialPostVariant')
  const variant = await getSocialPostVariant(variantId)
  if (!variant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' })
  }
  if (!canOrganizerTransition(variant.status, to)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `A ${variant.status} variant cannot move to ${to}`,
    })
  }
  return variant
}

async function applyOrConflict(
  variant: SocialPostVariant,
  transition: VariantTransition,
) {
  const landed = await sanitySocialVariantStore.transition(
    variant._id,
    transition,
    { ifRevision: variant._rev },
  )
  if (!landed) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'The variant changed while you were editing. Reload and retry.',
    })
  }
  return { success: true as const, status: transition.status }
}

/**
 * The tagged link a Task's variant carries (spec §3.4), derived from the
 * Channel, the Campaign key and the Task key — never from the client. The
 * Task is guarded before it is read, and it must be the publishing Task
 * that owns THIS variant.
 */
async function taskLinkFor(
  task: { taskId: string; rev: string; targetPage: string },
  variantId: string,
): Promise<{ taskId: string; rev: string; targetPage: string; link: string }> {
  const conferenceId = await requireDocumentInCurrentConference(
    task.taskId,
    'marketingTask',
  )
  const inputs = await getTaskLinkInputs(task.taskId, conferenceId)
  if (
    !inputs ||
    inputs.kind !== 'publishing' ||
    !inputs.channel ||
    inputs.variantId !== variantId
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This variant does not belong to that marketing Task.',
    })
  }
  const { conference } = await getConferenceForCurrentDomain()
  if (!conference) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conference not found' })
  }
  try {
    return {
      taskId: task.taskId,
      rev: task.rev,
      targetPage: task.targetPage,
      link: taggedUrl({
        baseUrl: conferenceBaseUrl(conference),
        targetPage: task.targetPage,
        channel: inputs.channel,
        campaignKey: inputs.campaignKey,
        taskKey: inputs.taskKey,
      }),
    }
  } catch (error) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        error instanceof Error ? error.message : 'The target page is not valid',
    })
  }
}

export const socialRouter = router({
  createPost: adminProcedure
    .input(CreateSocialPostSchema)
    .mutation(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      return createSocialPost({
        conferenceId,
        body: input.body,
        defaultScheduledAt: input.defaultScheduledAt ?? null,
        platforms: input.platforms,
        createdBy: ctx.speaker._id,
      })
    }),

  updatePostDefaultTime: adminProcedure
    .input(UpdateSocialPostDefaultTimeSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.postId,
        'socialPost',
      )
      const result = await updateSocialPostDefaultTime(
        input.postId,
        conferenceId,
        input.defaultScheduledAt,
      )
      if ('conflict' in result) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'A variant changed while the time was being updated. Reload and retry.',
        })
      }
      return {
        ...result,
        ceilingWarnings: await ceilingWarningsFor(conferenceId, {
          postIds: [input.postId],
        }),
      }
    }),

  /**
   * Delete a post and all its variants. Refused while any variant is being
   * published or has been published — a tidy-up must not erase the record
   * of a post that went out.
   */
  deletePost: adminProcedure
    .input(SocialPostIdSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.postId,
        'socialPost',
      )
      const result = await deleteSocialPost(input.postId, conferenceId)
      if (!result.deleted) {
        // Not an error: the caller shows the way to the Task (spec §2.3).
        if (result.reason === 'task') return result
        if (result.reason === 'changed') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A variant changed while deleting. Reload and retry.',
          })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            result.reason === 'in-flight'
              ? 'A variant is being published right now. Try again in a minute.'
              : 'A variant of this post has been published; the record is kept.',
        })
      }
      return result
    }),

  listVariants: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    return listSocialPostVariants(conferenceId)
  }),

  /**
   * `draft | failed → scheduled`. A supplied time becomes a per-variant
   * override; otherwise the variant RE-ATTACHES to the post's default time
   * (so a retry after an engine backoff follows the post again), falling back
   * to whatever time it carries. When an adapter exists for the platform its
   * `validate` blocks scheduling an invalid variant (#788).
   */
  scheduleVariant: adminProcedure
    .input(ScheduleSocialVariantSchema)
    .mutation(async ({ input }) => {
      const variant = await loadVariantFor(input.variantId, 'scheduled')
      const postDefault = input.scheduledAt
        ? null
        : await getSocialPostDefaultTime(variant.postId, variant.conferenceId)
      const scheduledAt =
        input.scheduledAt ?? postDefault ?? variant.scheduledAt
      if (!scheduledAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Set a time before scheduling',
        })
      }
      const usesCustomTime = input.scheduledAt
        ? true
        : postDefault
          ? false
          : variant.usesCustomTime

      const post = await getSocialPostEditorInputs(
        variant.postId,
        variant.conferenceId,
      )
      const issues = await scheduleIssues(variant, post.attachments)
      if (issues.length > 0) throw issuesToError(issues)

      // A fresh scheduling cycle: the retry cap counts from zero again while
      // `attempts[]` keeps the history.
      const result = await applyOrConflict(variant, {
        status: 'scheduled',
        scheduledAt,
        attemptCount: 0,
        usesCustomTime,
      })
      return {
        ...result,
        ceilingWarnings: await ceilingWarningsFor(variant.conferenceId, {
          variantIds: [variant._id],
        }),
      }
    }),

  /** What the single-variant editor loads (#1007). */
  getVariantEditor: adminProcedure
    .input(SocialVariantIdSchema)
    .query(async ({ input }) => {
      await requireDocumentInCurrentConference(
        input.variantId,
        'socialPostVariant',
      )
      const data = await getSocialVariantEditorData(input.variantId)
      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' })
      }
      return data
    }),

  /**
   * Save the editor (#1007): body, link, attachments with per-variant crop
   * and alt override, and the time. Refused once the variant is in flight
   * or done; validated against the platform's rules BEFORE the write, so a
   * saved variant is always one the platform would accept. Compare-and-set
   * on the revision the EDITOR LOADED (not the one this request just read),
   * so a colleague's save or a cron claim since the editor opened surfaces
   * as CONFLICT rather than a silent overwrite.
   */
  updateVariant: adminProcedure
    .input(UpdateSocialVariantSchema)
    .mutation(async ({ input }) => {
      await requireDocumentInCurrentConference(
        input.variantId,
        'socialPostVariant',
      )
      // The Task context (#1012, spec §3.4): guarded before anything is
      // read, and the link is DERIVED here — the client's `link` is ignored.
      const task = input.task
        ? await taskLinkFor(input.task, input.variantId)
        : null
      const variant = await getSocialPostVariant(input.variantId)
      if (!variant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' })
      }
      if (!EDITABLE_STATUSES.includes(variant.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A ${variant.status} variant can no longer be edited`,
        })
      }
      const post = await getSocialPostEditorInputs(
        variant.postId,
        variant.conferenceId,
      )
      // A Task-owned variant keeps its tagged link (spec §3.4) when edited
      // from the posts table, where no Task context is given.
      const owned =
        !task && (await getTaskForVariant(variant._id, variant.conferenceId))
      const link = task ? task.link : owned ? variant.link : input.link
      const content = { ...variant, body: input.body, link }
      const publishInput = publishInputFor(
        content,
        input.attachments,
        post.attachments,
      )
      const constraints = getPlatformConstraints(variant.platform)
      const issues = constraints
        ? validatePublishInput(constraints, publishInput)
        : []
      // A queued post keeps the scheduling rule: no placeholder goes out.
      if (variant.status === 'scheduled') {
        issues.push(...placeholderIssues(publishInput))
      }
      // The crop editor only produces windows of the platform's aspect; an
      // override arriving by API is held to the same rule.
      if (
        offAspectOverrides(input.attachments, post.attachments, constraints)
          .length > 0
      ) {
        issues.push({
          field: 'media',
          message: 'A crop does not match the platform image aspect.',
        })
      }
      if (issues.length > 0) throw issuesToError(issues)

      const scheduledAt =
        input.timing.mode === 'custom'
          ? input.timing.scheduledAt
          : post.defaultScheduledAt
      // A queued variant must keep a time: `scheduled` with no `scheduledAt`
      // is never due and never surfaces (`scheduleVariant` refuses the same).
      if (variant.status === 'scheduled' && !scheduledAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'The post has no default time. Set a custom time, or unschedule the variant first.',
        })
      }

      const landed = await updateSocialVariantContent(
        variant._id,
        {
          body: input.body,
          link,
          attachments: input.attachments,
          scheduledAt,
          usesCustomTime: input.timing.mode === 'custom',
        },
        {
          ifRevision: input.rev,
          ...(input.timing.mode === 'default' && post.rev
            ? { followsPost: { id: variant.postId, rev: post.rev } }
            : {}),
          ...(task
            ? {
                task: {
                  id: task.taskId,
                  rev: task.rev,
                  targetPage: task.targetPage,
                },
              }
            : {}),
        },
      )
      if (!landed) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The variant changed while you were editing. Reload and retry.',
        })
      }
      return {
        success: true as const,
        ceilingWarnings: await ceilingWarningsFor(variant.conferenceId, {
          variantIds: [variant._id],
        }),
      }
    }),

  /**
   * Put an image on the post (#1007): an upload, a gallery pick or a
   * share-card raster — every source is an asset reference by now. The
   * variant then picks it by key.
   */
  addPostAttachment: adminProcedure
    .input(AddSocialPostAttachmentSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.postId,
        'socialPost',
      )
      const added = await addSocialPostAttachment(input.postId, conferenceId, {
        assetId: input.assetId,
        alt: input.alt,
        hotspot: input.hotspot ?? null,
        crop: input.crop ?? null,
      })
      if ('refused' in added) {
        throw new TRPCError({
          code: added.refused === 'post-gone' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message:
            added.refused === 'post-gone'
              ? 'The post is gone. Reload and retry.'
              : 'That image belongs to another conference.',
        })
      }
      return added
    }),

  /**
   * `scheduled → draft`: pull a queued variant back before the cron takes it
   * (to stop it, or to re-time it via `scheduleVariant`). Compare-and-set on
   * the revision read, so a tick that has just claimed it wins with CONFLICT.
   */
  unscheduleVariant: adminProcedure
    .input(SocialVariantIdSchema)
    .mutation(async ({ input }) => {
      const variant = await loadVariantFor(input.variantId, 'draft')
      return applyOrConflict(variant, { status: 'draft' })
    }),

  /**
   * `awaiting-manual → published`: the organizer posted it by hand. The URL
   * is REQUIRED (spec §3.2), validated against the variant's platform
   * domain (`https://www.linkedin.com/...`) and lands in
   * `publishResult.url`; the audit trail records who did it. No adapter is
   * involved: a manual variant is never published from here.
   */
  markPosted: adminProcedure
    .input(MarkSocialVariantPostedSchema)
    .mutation(async ({ ctx, input }) => {
      const variant = await loadVariantFor(input.variantId, 'published')
      // A platform the registry does not know (a hand-edited document) has
      // no domain to validate against, so nothing can complete it by hand.
      if (!isSocialPlatform(variant.platform)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unknown platform "${String(variant.platform)}"; fix the variant in the Studio first.`,
        })
      }
      const issue = postUrlIssue(variant.platform, input.url)
      if (issue) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: issue })
      }
      return applyOrConflict(variant, {
        status: 'published',
        publishResult: { url: input.url },
        attempt: {
          at: getCurrentDateTime(),
          outcome: 'manual',
          by: ctx.speaker._id,
        },
      })
    }),
})
