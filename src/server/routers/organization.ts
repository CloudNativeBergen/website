import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import { organizationTag } from '@/lib/cache/tags'
import {
  UpdateContentJudgementSchema,
  UpdateOrganizationAnalyticsSchema,
} from '../schemas/organization'

/**
 * Organizer-facing writes to the CURRENT organization (the one owning the
 * conference the request is served for). The target is the org the authz
 * waist resolved from the request host (`ctx.orgId`), NEVER client input, so
 * an organizer cannot address another tenant's document. Contrast `platform.updateEntitlements`, which is
 * platform-only and takes an explicit organization id.
 */

/**
 * Write the request's organization (`write` commits), then bust the cached org read that the
 * root layout's analytics gate, the settings page and the /privacy
 * disclosure all run through. `'default'` serves the stale page once while
 * it refreshes; `{ expire: 0 }` makes the next request wait for fresh data.
 */
async function patchCurrentOrganization(
  orgId: string | null | undefined,
  write: (orgId: string) => Promise<unknown>,
  failure: string,
  expiry: 'default' | { expire: 0 } = 'default',
): Promise<{ success: true }> {
  if (!orgId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This conference is not attached to an organization',
    })
  }
  try {
    await write(orgId)
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: failure,
      cause: error,
    })
  }
  revalidateTag(organizationTag(orgId), expiry)
  return { success: true }
}

export const organizationRouter = router({
  /**
   * Set or clear the organization's public PostHog project token (issue
   * #1008). One field, one patch: the organization document is also written by
   * kontroll, whose allowlist does not include this field, so the two writers
   * never touch the same keys.
   */
  updateAnalytics: adminProcedure
    .input(UpdateOrganizationAnalyticsSchema)
    .mutation(({ ctx, input }) =>
      patchCurrentOrganization(
        ctx.orgId,
        (orgId) =>
          input.analyticsPosthogToken === null
            ? clientWrite.patch(orgId).unset(['analyticsPosthogToken']).commit()
            : clientWrite
                .patch(orgId)
                .set({ analyticsPosthogToken: input.analyticsPosthogToken })
                .commit(),
        'Failed to update organization analytics',
      ),
    ),

  /**
   * Turn content judgement on or off (Content judgement spec §5), recording
   * which organizer changed it and when. Only the keys inside
   * `contentJudgement` it owns are set, so a later Enforce switch survives.
   * Turning it off stops new calls at once: the client's gate reads this
   * field live whenever a judge is made.
   */
  updateContentJudgement: adminProcedure
    .input(UpdateContentJudgementSchema)
    .mutation(({ ctx, input }) =>
      patchCurrentOrganization(
        ctx.orgId,
        // Two patches in one transaction, applied in order: within ONE
        // patch Sanity runs `set` before `setIfMissing`, so the parent
        // object must exist before the dotted paths are set.
        (orgId) =>
          clientWrite
            .transaction()
            .patch(orgId, (p) => p.setIfMissing({ contentJudgement: {} }))
            .patch(orgId, (p) =>
              p.set({
                'contentJudgement.enabled': input.enabled,
                'contentJudgement.changedAt': new Date().toISOString(),
                'contentJudgement.changedBy': {
                  _type: 'reference',
                  _ref: ctx.speaker._id,
                  _weak: true,
                },
              }),
            )
            .commit(),
        'Failed to update content judgement',
        // Never a stale /privacy: once it is on, content can be sent, so the
        // next view must already list OpenRouter (spec §13.1). A tRPC route
        // is not a Server Action, so `updateTag` is not available here.
        { expire: 0 },
      ),
    ),
})
