import { headers } from 'next/headers'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { formatDatesSafe } from '@/lib/time'

/**
 * The tenant brand name for per-page `generateMetadata` (go-live gate G2, E2).
 *
 * Resolves the current-domain conference title, falling back to the neutral
 * {@link PLATFORM_NAME} when no tenant resolves (apex/platform host, localhost,
 * a preview with no matching domain) or on any error. Use it to build page
 * titles / descriptions instead of hardcoding a single tenant's brand.
 */
export async function resolveMetadataBrand(): Promise<string> {
  try {
    const host = (await headers()).get('host') || ''
    const { conference } = await getConferenceForDomain(host)
    return conference?.title?.trim() || PLATFORM_NAME
  } catch {
    return PLATFORM_NAME
  }
}

/**
 * Title and description for a tenant page (#399): `"<Page> – <brand>"`, and
 * the description names the conference dates and city when the CMS has them,
 * so no two indexable pages share a title and each says when and where.
 */
export async function resolvePageMetadata(
  page: string,
  lead: string,
): Promise<{ title: string; description: string }> {
  let brand = PLATFORM_NAME
  let where = ''
  try {
    const host = (await headers()).get('host') || ''
    const { conference } = await getConferenceForDomain(host)
    brand = conference?.title?.trim() || PLATFORM_NAME
    if (conference) {
      const dates = formatDatesSafe(conference.startDate, conference.endDate)
      const parts = [
        dates === 'TBD' || dates === 'Invalid Date Range' ? '' : dates,
        conference.city ? `in ${conference.city}` : '',
      ].filter(Boolean)
      if (parts.length) where = `, ${parts.join(' ')}`
    }
  } catch {
    // Fall through to the neutral platform brand.
  }
  return {
    title: `${page} – ${brand}`,
    description: `${lead} ${brand}${where}.`,
  }
}
