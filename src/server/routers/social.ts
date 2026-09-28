import { TRPCError } from '@trpc/server'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import {
  notFoundMessage,
  requireDocumentInCurrentConference,
  requireDocumentInCurrentOrg,
} from '@/server/tenancy'
import { readMarketingAssetForPost } from '@/lib/marketing-asset/sanity'
import { NOT_ATTACHABLE_YET } from '@/lib/marketing-asset/post-attach'
import {
  AddSocialPostAttachmentFromAssetSchema,
  AddSocialPostAttachmentSchema,
  CreateSocialPostSchema,
  MarkSocialVariantPostedSchema,
  ScheduleSocialVariantSchema,
  SocialPostIdSchema,
  SocialVariantIdSchema,
  SocialVariantEditorReadSchema,
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
  getConferenceDomainsForRule,
  listSocialPostVariants,
  sanitySocialVariantStore,
  updateSocialPostDefaultTime,
  updateSocialVariantContent,
} from '@/lib/social/sanity'
import { getCurrentDateTime } from '@/lib/time'
import { canOrganizerTransition } from '@/lib/social/state-machine'
import { MAY_BE_LIVE_REFUSAL } from '@/lib/marketing/deletion'
import {
  isSocialPlatform,
  resolveSocialConnections,
} from '@/lib/social/provider'
import { postUrlIssue } from '@/lib/social/provider/manual'
import {
  getPlatformConstraints,
  needsOwnDomains,
  validatePublishInput,
} from '@/lib/social/provider/constraints'
import { offAspectOverrides, resolvePublishMedia } from '@/lib/social/media'
import { placeholderIssues, scheduleIssues } from '@/lib/social/schedule-check'
import {
  publishLinkFields,
  variantShortLinkOrigin,
} from '@/lib/social/publish-link'
import {
  checkTagsForApproval,
  checkTagsOnSave,
  manualPostBody,
  withManualBody,
} from '@/lib/marketing/tagging/verify'
import { mentionDocuments } from '@/lib/marketing/tagging/records'
import { tagIssuesError } from '@/server/errors'
import { ceilingWarningsFor } from '@/lib/marketing/ceiling-check'
import { getTaskForVariant, getTaskLinkInputs } from '@/lib/marketing/sanity'
import { taggedUrl } from '@/lib/marketing/link'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { shortCodeForMutation } from '@/lib/marketing/short-code-sanity'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import {
  expireShortLink,
  expireShortLinkIndex,
} from '@/lib/marketing/short-link-cache'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type {
  SocialPlatform,
  SocialPostAttachment,
  SocialPostVariant,
  SocialVariantAttachment,
  VariantStatus,
} from '@/lib/social/types'
import { SOCIAL_ALT_MAX_LENGTH } from '@/lib/social/types'
import type { VariantTransition } from '@/lib/social/store'
import type { PublishInput, ValidationIssue } from '@/lib/social/provider'

/** Statuses whose content an organizer may still edit. */
const EDITABLE_STATUSES: readonly VariantStatus[] = [
  'draft',
  'scheduled',
  'failed',
]

/**
 * The request conference's own `domains[]` — what the first-comment rule
 * (spec §3.1, #1134) compares a body's URLs against. `[]` when the conference
 * lists none, so the rule says nothing rather than refusing a body it cannot
 * judge; a FAILED read propagates and fails the mutation, as any other read
 * would.
 */
async function currentConferenceDomains(
  platform: SocialPlatform,
): Promise<readonly string[]> {
  // Only the first-comment rule reads them; every other platform's save must
  // not depend on (or fail with) this extra read. UNCACHED, by the resolved
  // id: see `getConferenceDomainsForRule`.
  if (!needsOwnDomains(platform)) return []
  return getConferenceDomainsForRule(await resolveConferenceId())
}

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
  variant: Pick<SocialPostVariant, 'platform' | 'body' | 'link' | 'shortCode'>,
  attachments: SocialVariantAttachment[],
  postAttachments: SocialPostAttachment[],
  shortLinkOrigin: string | null,
): PublishInput {
  const constraints = getPlatformConstraints(variant.platform)
  const media = resolvePublishMedia(attachments, postAttachments, constraints)
  if (!media) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'An attachment is no longer on the post. Reload and retry.',
    })
  }
  return {
    text: variant.body,
    media,
    ...publishLinkFields(variant, shortLinkOrigin),
  }
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
 * The origin the request conference builds a variant's `/go/<code>` link on
 * (short-links spec §2.3), so a validation sees the link the publish tick
 * will post. A variant with no code never reads the conference. A conference
 * that does not resolve REFUSES the mutation, as `requireConference` does in
 * the marketing router — never a silent fall back to the long link.
 */
async function currentShortLinkOrigin(
  shortCode: string | null | undefined,
): Promise<string | null> {
  // Skips the read only; the gate itself is `variantShortLinkOrigin`'s.
  if (!normalizeShortCode(shortCode)) return null
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve the conference to build the short link',
    })
  }
  return variantShortLinkOrigin(shortCode, conference)
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
              : result.reason === 'may-be-live'
                ? MAY_BE_LIVE_REFUSAL
                : result.reason === 'referenced'
                  ? 'Something still links to this post that deleting it would not remove — an unpublished Studio edit, a scheduled release, or a variant on another edition. Open it in the Studio and clear that first.'
                  : 'A variant of this post has been published; the record is kept.',
        })
      }
      return result
    }),

  /**
   * Whether each platform publishes automatically for the REQUEST's
   * organization, or is posted by hand (#1130, spec §4) — derived from its
   * secrets the way the publish cron derives it, and carrying no secret.
   * An organization that cannot be resolved is refused rather than shown as
   * "manual", which would be a claim about a connection nobody looked up.
   */
  connections: adminProcedure.query(async ({ ctx }) => {
    // THE org the authz waist gated on, never a second resolution that could
    // answer differently between the two reads.
    if (!ctx.orgId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Could not resolve the organization from the domain',
      })
    }
    return resolveSocialConnections(ctx.orgId)
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
      const taskOwned = !!(await getTaskForVariant(
        variant._id,
        variant.conferenceId,
      ))
      // §2.2: a Task variant that predates the field gets its code in the
      // first MUTATION that needs its link — scheduling queues it to be
      // posted, so it is one. Minted before validating, so validation sees the
      // `/go/<code>` link the tick will post, and written by the same
      // compare-and-set as the transition below. A standalone post never gets
      // a code (§1).
      const code = taskOwned
        ? await shortCodeForMutation(variant.conferenceId, variant.shortCode)
        : null
      const coded = code ? { ...variant, shortCode: code.code } : variant
      const issues = await scheduleIssues(coded, post.attachments, {
        conferenceDomains: await currentConferenceDomains(variant.platform),
        shortLinkOrigin: await currentShortLinkOrigin(coded.shortCode),
        taskOwned,
      })
      if (issues.length > 0) throw issuesToError(issues)
      // Scheduling is one of the three approval paths (tagging spec §4.4).
      const tags =
        variant.platform === 'bluesky'
          ? await checkTagsForApproval({
              conferenceId: variant.conferenceId,
              variantId: variant._id,
              body: variant.body,
            })
          : null
      if (tags && tags.issues.length > 0) throw tagIssuesError(tags.issues)

      // A fresh scheduling cycle: the retry cap counts from zero again while
      // `attempts[]` keeps the history.
      const result = await applyOrConflict(variant, {
        status: 'scheduled',
        scheduledAt,
        attemptCount: 0,
        usesCustomTime,
        ...(code?.minted ? { shortCode: code.code } : {}),
      })
      // A new code changes the conference's membership set (§2.4), after the
      // write has committed.
      if (code?.minted) expireShortLinkIndex(variant.conferenceId)
      return {
        ...result,
        ceilingWarnings: await ceilingWarningsFor(variant.conferenceId, {
          variantIds: [variant._id],
        }),
        tagWarnings: tags?.warnings.map((w) => w.message) ?? [],
      }
    }),

  /** What the single-variant editor loads (#1007). */
  getVariantEditor: adminProcedure
    .input(SocialVariantEditorReadSchema)
    .query(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.variantId,
        'socialPostVariant',
      )
      const data = await getSocialVariantEditorData(input.variantId)
      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' })
      }
      // Posted by hand: the approval check runs as the view opens (tagging
      // spec §4.4), so a late opt-out is honoured there too. ONLY for a manual
      // view's read, which sends `opening` (`useFreshManualCheck`): the
      // ordinary editor — say, editing a failed post — never shows the checked
      // body and must not pay for the reads and lookups (round 4, T3).
      return input.opening ? withManualBody(data, conferenceId) : data
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
      // A Task-owned variant carries a `/go/<code>` code; a standalone post's
      // variant never does — its `link` is typed by the organizer and may
      // point anywhere, so it is not ours to shorten (§1). A Task-owned
      // variant that predates the field is backfilled HERE, in the mutation
      // that rewrites its link — never in a query and never client-side.
      const taskOwned = Boolean(task || owned)
      const shortCode = taskOwned
        ? await shortCodeForMutation(variant.conferenceId, variant.shortCode)
        : undefined
      const content = {
        ...variant,
        body: input.body,
        link,
        shortCode: shortCode?.code ?? null,
      }
      const publishInput = publishInputFor(
        content,
        input.attachments,
        post.attachments,
        await currentShortLinkOrigin(content.shortCode),
      )
      const constraints = getPlatformConstraints(variant.platform)
      const issues = constraints
        ? validatePublishInput(constraints, publishInput, {
            conferenceDomains: await currentConferenceDomains(variant.platform),
          })
        : []
      // A queued post keeps the scheduling rule: no placeholder goes out.
      // Only a Task's post carries placeholders in the first place.
      if (variant.status === 'scheduled' && (task || owned)) {
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
      // A Bluesky body's tags (tagging spec §4.3, §4.4): `mentions[]` is
      // rebuilt from the body on EVERY save, so a handle typed by hand is
      // checked like a generated one; a scheduled variant also gets the
      // approval check. Standalone posts included: any Bluesky body could
      // tag an opted-out speaker.
      const tags =
        variant.platform === 'bluesky'
          ? await checkTagsOnSave({
              conferenceId: variant.conferenceId,
              variantId: variant._id,
              body: input.body,
              scheduled: variant.status === 'scheduled',
            })
          : null
      if (tags && tags.issues.length > 0) throw tagIssuesError(tags.issues)

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
          ...(tags ? { mentions: mentionDocuments(tags.mentions) } : {}),
        },
        {
          ifRevision: input.rev,
          ...(input.timing.mode === 'default' && post.rev
            ? { followsPost: { id: variant.postId, rev: post.rev } }
            : {}),
          ...(shortCode ? { shortCode: shortCode.code } : {}),
          ...(task
            ? {
                task: {
                  id: task.taskId,
                  rev: task.rev,
                  targetPage: task.targetPage,
                },
              }
            : {}),
          // Whoever owns this post, a changed body is an organizer's own
          // words: the next edition's copy keeps them (spec §3.1).
          ...(input.body !== variant.body && (task || owned)
            ? { copyEditedTaskId: task ? task.taskId : (owned as string) }
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
      // The save may have rewritten `link`, so what `/go/<code>` resolves to
      // has changed. EXPIRE the lookup entry rather than serving it stale
      // (§2.5); a variant with no code matches no tag and this is a no-op.
      if (taskOwned) {
        expireShortLink(variant._id)
        // ONLY when this save actually MINTED a code. A variant that already
        // had one leaves the membership set identical, and expiring it there
        // would drop the conference's cached index on every save (§2.4).
        if (shortCode?.minted) expireShortLinkIndex(variant.conferenceId)
      }
      return {
        success: true as const,
        ceilingWarnings: await ceilingWarningsFor(variant.conferenceId, {
          variantIds: [variant._id],
        }),
        tagWarnings: tags?.warnings.map((w) => w.message) ?? [],
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
   * Pick a marketing asset into the post (#1163, assets spec §5): its image
   * REFERENCE and alt text are copied onto the post, no re-upload, so
   * deleting the asset later never breaks the post.
   *
   * The generic attach refuses an image no document of THIS conference
   * references, and an organization-wide logo is exactly that. Here the
   * ownership is proven instead from the asset id: the asset must be this
   * organization's, checked by the guard BEFORE the asset is read, so a
   * foreign id and a nonexistent one get the guard's one answer.
   */
  addPostAttachmentFromAsset: adminProcedure
    .input(AddSocialPostAttachmentFromAssetSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.postId,
        'socialPost',
      )
      const notFound = () =>
        new TRPCError({
          code: 'NOT_FOUND',
          message: notFoundMessage('marketingAsset'),
        })
      // Published ids only, as the gallery lists them: a Studio draft or a
      // release copy is never picked on its own.
      if (input.marketingAssetId.includes('.')) throw notFound()
      const orgId = await requireDocumentInCurrentOrg(
        input.marketingAssetId,
        'marketingAsset',
      )
      const asset = await readMarketingAssetForPost(
        orgId,
        input.marketingAssetId,
      )
      if (!asset) throw notFound()
      // The attachment schema would take a GIF's image id: the picker's mark
      // alone would be decoration (spec §5).
      if (!asset.attachable || !asset.imageAssetId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: NOT_ATTACHABLE_YET,
        })
      }
      const alt = asset.alt.trim()
      // Studio sets no maximum; a post's alt text has one.
      if (alt.length > SOCIAL_ALT_MAX_LENGTH) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This asset's alt text is longer than ${SOCIAL_ALT_MAX_LENGTH} characters. Shorten it in the asset gallery first.`,
        })
      }
      if (!alt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'This asset has no alt text. Add one in the asset gallery first.',
        })
      }
      const added = await addSocialPostAttachment(
        input.postId,
        conferenceId,
        {
          assetId: asset.imageAssetId,
          alt,
          hotspot: asset.hotspot,
          crop: asset.crop,
        },
        { heldBy: { id: input.marketingAssetId, rev: asset.rev } },
      )
      if ('refused' in added) {
        throw added.refused === 'holder-changed'
          ? new TRPCError({
              code: 'CONFLICT',
              message:
                'The asset changed or was deleted while it was being added. Reload and retry.',
            })
          : new TRPCError({
              code: 'NOT_FOUND',
              message: 'The post is gone. Reload and retry.',
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
      // `published → published` is allowed ONLY to supply a missing address
      // (#1128): an asynchronous confirmation may name a post without a URL,
      // and a publishing Task reads `publishResult.url` to know it is done.
      // Overwriting an address we already hold is a different thing entirely
      // — it would rewrite where a live post is recorded to point — so the
      // state machine opens the transition and this refuses the rest of it.
      if (variant.status === 'published' && variant.publishResult?.url) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'This post already has an address. Edit it in the Studio if it is wrong.',
        })
      }
      // The record says what went out (final round, T5): a Bluesky post
      // posted by hand was copied from the CHECKED body, so that is what the
      // same compare-and-set records. The check never blocks recording a live
      // post — if it cannot run, the stored text stays and the error is logged.
      let checkedBody: string | undefined
      if (
        variant.platform === 'bluesky' &&
        (variant.status === 'awaiting-manual' || variant.status === 'failed')
      ) {
        try {
          const checked = await manualPostBody({
            conferenceId: variant.conferenceId,
            variantId: variant._id,
            body: variant.body,
          })
          if (checked && checked.body !== variant.body)
            checkedBody = checked.body
        } catch (error) {
          console.error(
            `[social] markPosted: tag check failed for ${variant._id}; the stored text is kept:`,
            error,
          )
        }
      }
      return applyOrConflict(variant, {
        status: 'published',
        ...(checkedBody !== undefined ? { body: checkedBody } : {}),
        // MERGED, not replaced. The store applies this with `patch.set`, so
        // `{ url }` alone would overwrite the whole object — and on the
        // `published → published` path that deletes the `externalId` an
        // asynchronous confirmation recorded: the platform's own receipt, and
        // the id marketing snapshots project. Supplying a missing address must
        // add to what we know, never trade one fact for another.
        publishResult: { ...variant.publishResult, url: input.url },
        // A URL-only update on an already-published variant is NOT a manual
        // publication: the vendor published it, and an `attempts[]` entry
        // saying `manual` would misstate who put the post live. The audit
        // entry is for the two paths that actually complete a post by hand.
        ...(variant.status === 'published'
          ? {}
          : {
              attempt: {
                at: getCurrentDateTime(),
                outcome: 'manual' as const,
                by: ctx.speaker._id,
              },
            }),
      })
    }),
})
