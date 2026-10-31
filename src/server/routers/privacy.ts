import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { router, adminProcedure } from '../trpc'
import { requireCurrentOrgId } from '../tenancy'
import { normalizeEmail } from '@/lib/speaker/email'
import {
  OrgErasureConflictError,
  planOrgErasure,
  runOrgErasure,
} from '@/lib/privacy/org-erasure'

// One address per request, bounded like any address field (RFC 5321: 254).
const EmailInput = z.object({ email: z.string().trim().email().max(254) })

/**
 * The admin Privacy page (#1045, #1310): an organizer handles one person's
 * erasure request for this organization. Preview and erase are separate
 * procedures, and erase recomputes the plan itself — see
 * `@/lib/privacy/org-erasure`.
 */
export const privacyRouter = router({
  preview: adminProcedure.input(EmailInput).query(async ({ input }) => {
    const orgId = await requireCurrentOrgId()
    return (await planOrgErasure(input.email, orgId)).preview
  }),

  erase: adminProcedure
    .input(EmailInput.extend({ confirmEmail: z.string().max(254) }))
    .mutation(async ({ input, ctx }) => {
      if (normalizeEmail(input.confirmEmail) !== normalizeEmail(input.email)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Type the email address exactly to confirm.',
        })
      }
      const orgId = await requireCurrentOrgId()
      try {
        return await runOrgErasure(
          input.email,
          orgId,
          `organizer:${ctx.speaker._id}`,
          (tag, profile) => revalidateTag(tag, profile),
        )
      } catch (error) {
        if (error instanceof OrgErasureConflictError) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'Something changed while erasing. Run the preview again and retry.',
          })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }),
})
