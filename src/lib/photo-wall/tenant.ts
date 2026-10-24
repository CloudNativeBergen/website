import 'server-only'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

type Conference = NonNullable<
  Awaited<ReturnType<typeof getConferenceForCurrentDomain>>['conference']
>

/**
 * The request's conference for a Photo Wall write or export (spec §10): the
 * tenant from the domain (the cached read the authz waist resolves), its
 * document read LIVE, not from the CDN, so the caller sees the end date and
 * domain Settings just wrote. Never from the client. The live document must
 * still be that conference and still belong to `orgId`, the organization the
 * caller was checked against: a conference moved to another organization
 * meanwhile is refused to the old one's organizers. Null when any of that
 * fails; the caller refuses.
 */
export async function liveConferenceInOrg(
  orgId: string | null,
): Promise<Conference | null> {
  if (!orgId) return null
  const tenant = await getConferenceForCurrentDomain()
  if (tenant.error || !tenant.conference?._id) return null
  const live = await getConferenceForCurrentDomain({ uncached: true })
  if (
    live.error ||
    live.conference?._id !== tenant.conference._id ||
    live.conference.organization?._ref !== orgId
  )
    return null
  return live.conference
}
