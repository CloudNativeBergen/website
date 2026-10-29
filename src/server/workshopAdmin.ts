import { TRPCError } from '@trpc/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { adminProcedure } from './trpc'

/**
 * The ORGANIZER workshop surface, gated on the `workshops` feature (#689).
 * `adminProcedure` has already resolved the request org from the domain
 * conference and gated on organizer membership, so this only adds the feature
 * decision — and it asks `isWorkshopsEnabledForConference` rather than the
 * generic `requireFeature` middleware, because the workshop gate requires
 * working ticketing on top of the raw entitlement set (#1295): the API must not
 * disagree with the `/admin/workshops` page, the portal and the ticket-sold
 * email, which all go through that one resolver. It is asked with the domain
 * conference — the same one `ctx.orgId` was resolved from — because the answer
 * depends on that conference's ticketing vendor. An unresolvable conference or
 * org is DISABLED (the resolver fails closed), matching the waist's posture.
 *
 * ONE DEFINITION, outside the routers, for `workshop.admin` and for the
 * sponsor's early-access link (#1346): neither router imports the other.
 */
export const workshopAdminProcedure = adminProcedure.use(async ({ next }) => {
  await requireWorkshopsEnabled()
  return next()
})

/**
 * The gate itself, for a procedure that is an organizer workshop action for
 * ONE of its inputs only: `sponsor.crm.sendCommunication` creates a sponsor's
 * early-access link when it sends the "Workshop early access" kind (#1347),
 * and must refuse where creating the link on the sponsor's record is refused.
 */
export async function requireWorkshopsEnabled(): Promise<void> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (!(await isWorkshopsEnabledForConference(error ? null : conference))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'The "workshops" feature is not enabled for this organization',
    })
  }
}
