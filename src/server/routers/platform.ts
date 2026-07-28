import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import { organizationTag } from '@/lib/cache/tags'
import { ensureUniqueArrayKeys } from '@/lib/sanity/helpers'
import { isPlatformOrganization } from '@/lib/features/platform'
import {
  getAllOrganizations,
  getOrganizationById,
} from '@/lib/organization/sanity'
import { UpdateEntitlementsSchema } from '../schemas/platform'

/**
 * PLATFORM-scoped organization management (feature entitlements foundation).
 *
 * Every procedure here is CROSS-TENANT — it reads or writes OTHER
 * organizations' documents — so on top of the org-scoped admin waist
 * (`adminProcedure`) it is gated by the `PLATFORM_ORG_SLUG` contract
 * (`src/lib/features/platform.ts`): the request's own domain-resolved org must
 * BE the platform org. The client-side card being hidden for non-platform
 * tenants is presentation only; THIS gate is the security boundary. With the
 * env contract unset the whole router fails closed.
 */
const platformProcedure = adminProcedure.use(async ({ ctx, next }) => {
  // The waist already denies a null `ctx.orgId`, so this can only run with a
  // resolved org — but a null is never the platform org anyway, so this guard
  // fails closed independently.
  if (!(await isPlatformOrganization(ctx.orgId))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Platform administration is not available for this organization',
    })
  }
  return next()
})

export const platformRouter = router({
  /** Every organization (name-ordered) with its plan + overrides — the
   * management list for the platform card. Uncached so a just-saved change is
   * visible immediately. */
  listOrganizations: platformProcedure.query(async () => {
    return getAllOrganizations()
  }),

  /**
   * Replace an organization's plan and feature overrides in one patch. A
   * whole-array override write (not row-diffing) keeps the mutation idempotent
   * and the client's dirty-state model simple; the array is small (≤100) and
   * platform-only. Revalidates the org's tenant tag so the cached
   * entitlements read (`getOrganizationById`) busts immediately.
   */
  updateEntitlements: platformProcedure
    .input(UpdateEntitlementsSchema)
    .mutation(async ({ input }) => {
      const target = await getOrganizationById(input.organizationId)
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }

      const featureOverrides = ensureUniqueArrayKeys(
        input.overrides.map((override) => ({
          _type: 'featureOverride' as const,
          ...(override._key ? { _key: override._key } : {}),
          feature: override.feature,
          enabled: override.enabled,
          ...(override.note ? { note: override.note } : {}),
          ...(override.expiresAt ? { expiresAt: override.expiresAt } : {}),
        })),
        'override',
      )

      try {
        await clientWrite
          .patch(input.organizationId)
          .set({ plan: input.plan, featureOverrides })
          .commit()
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update organization entitlements',
          cause: error,
        })
      }

      revalidateTag(organizationTag(input.organizationId), 'default')
      return { success: true }
    }),
})
