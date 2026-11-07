import 'server-only'
import { apiHost } from '@/lib/konf-api/program'
import { fetchApiSponsors } from '@/lib/konf-api/sponsors'
import { getPublicSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import type { ConferenceSponsor } from './types'

/**
 * The conference's PUBLIC sponsors (#1772): from the gateway for an apiRead
 * tenant, else Sanity. Sanity also answers on any API error and under
 * KONF_API_DISABLED. The API rows carry logos as data URLs (`logoUrl`) and no
 * `_sfcId`, tier price or ticket entitlement: public pages only. The CRM,
 * sponsor admin, contracts, tickets and the portal read Sanity directly.
 */
export async function getPublicSponsors(
  conference: Parameters<typeof apiHost>[0],
): Promise<ConferenceSponsor[]> {
  const host = await apiHost(conference)
  if (host) {
    try {
      return await fetchApiSponsors(host, conference._id)
    } catch (err) {
      console.warn(
        `[konf-api] sponsors falling back to Sanity for ${host}:`,
        (err as Error).message,
      )
    }
  }
  return getPublicSponsorsForConference(conference._id)
}
