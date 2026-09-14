import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import { organizationTag } from '@/lib/cache/tags'
import { UpdateOrganizationAnalyticsSchema } from '../schemas/organization'

/**
 * Organizer-facing writes to the CURRENT organization (the one owning the
 * conference the request is served for). The target is the org the authz
 * waist resolved from the request host (`ctx.orgId`), NEVER client input, so
 * an organizer cannot address another tenant's document. Contrast `platform.updateEntitlements`, which is
 * platform-only and takes an explicit organization id.
 */
export const organizationRouter = router({
  /**
   * Set or clear the organization's public PostHog project token (issue
   * #1008). One field, one patch: the organization document is also written by
   * kontroll, whose allowlist does not include this field, so the two writers
   * never touch the same keys.
   */
  updateAnalytics: adminProcedure
    .input(UpdateOrganizationAnalyticsSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This conference is not attached to an organization',
        })
      }

      try {
        const patch = clientWrite.patch(orgId)
        await (
          input.analyticsPosthogToken === null
            ? patch.unset(['analyticsPosthogToken'])
            : patch.set({ analyticsPosthogToken: input.analyticsPosthogToken })
        ).commit()
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update organization analytics',
          cause: error,
        })
      }

      // Busts the cached org read the root layout's analytics gate and the
      // /privacy disclosure both run through.
      revalidateTag(organizationTag(orgId), 'default')
      return { success: true }
    }),
})
