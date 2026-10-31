import { z } from 'zod'
import { router, adminProcedure } from '../trpc'
import { requireCurrentOrgId } from '../tenancy'
import { planOrgErasure } from '@/lib/privacy/org-erasure'

// One address per request, bounded like any address field (RFC 5321: 254).
const EmailInput = z.object({ email: z.string().trim().email().max(254) })

/**
 * The admin Privacy page (#1045, #1310): an organizer previews one person's
 * erasure at this organization. A MUTATION although it writes nothing, so the
 * address travels in a POST body and never in a URL. The erase itself is
 * `POST /api/admin/privacy/erase`, which recomputes the plan — see
 * `@/lib/privacy/org-erasure`.
 */
export const privacyRouter = router({
  preview: adminProcedure.input(EmailInput).mutation(async ({ input }) => {
    const orgId = await requireCurrentOrgId()
    return (await planOrgErasure(input.email, orgId)).preview
  }),
})
