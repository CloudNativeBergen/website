import { TRPCError } from '@trpc/server'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import { requireDocumentInCurrentConference } from '@/server/tenancy'
import {
  CreateSocialPostSchema,
  MarkSocialVariantPostedSchema,
  ScheduleSocialVariantSchema,
  SocialVariantIdSchema,
  UpdateSocialPostDefaultTimeSchema,
} from '@/server/schemas/social'
import {
  createSocialPost,
  getSocialPostVariant,
  listSocialPostVariants,
  sanitySocialVariantStore,
  updateSocialPostDefaultTime,
} from '@/lib/social/sanity'
import { canOrganizerTransition } from '@/lib/social/state-machine'
import { resolveSocialPublishAdapter } from '@/lib/social/provider'
import { getCurrentDateTime } from '@/lib/time'
import type { SocialPostVariant, VariantStatus } from '@/lib/social/types'
import type { VariantTransition } from '@/lib/social/store'

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
      await requireDocumentInCurrentConference(input.postId, 'socialPost')
      return updateSocialPostDefaultTime(input.postId, input.defaultScheduledAt)
    }),

  listVariants: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    return listSocialPostVariants(conferenceId)
  }),

  /**
   * `draft | failed → scheduled`. A supplied time becomes a per-variant
   * override; otherwise the variant must already carry a time (the post
   * default). When an adapter exists for the platform its `validate` blocks
   * scheduling an invalid variant (#788).
   */
  scheduleVariant: adminProcedure
    .input(ScheduleSocialVariantSchema)
    .mutation(async ({ input }) => {
      const variant = await loadVariantFor(input.variantId, 'scheduled')
      const scheduledAt = input.scheduledAt ?? variant.scheduledAt
      if (!scheduledAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Set a time before scheduling',
        })
      }

      const adapter = await resolveSocialPublishAdapter(variant)
      const issues =
        adapter?.validate({
          text: variant.body,
          media: [],
          link: variant.link ?? undefined,
        }) ?? []
      if (issues.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
        })
      }

      return applyOrConflict(variant, {
        status: 'scheduled',
        scheduledAt,
        ...(input.scheduledAt ? { usesCustomTime: true } : {}),
      })
    }),

  /** `scheduled → draft`: pull a queued variant back before the cron takes it. */
  unscheduleVariant: adminProcedure
    .input(SocialVariantIdSchema)
    .mutation(async ({ input }) => {
      const variant = await loadVariantFor(input.variantId, 'draft')
      return applyOrConflict(variant, { status: 'draft' })
    }),

  /** `awaiting-manual → published`, recording who posted it by hand. */
  markPosted: adminProcedure
    .input(MarkSocialVariantPostedSchema)
    .mutation(async ({ ctx, input }) => {
      const variant = await loadVariantFor(input.variantId, 'published')
      return applyOrConflict(variant, {
        status: 'published',
        ...(input.url ? { publishResult: { url: input.url } } : {}),
        attempt: {
          at: getCurrentDateTime(),
          outcome: 'manual',
          by: ctx.speaker._id,
        },
      })
    }),
})
