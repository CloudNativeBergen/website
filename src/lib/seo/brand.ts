import { headers } from 'next/headers'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { PLATFORM_NAME } from '@/lib/branding/platform'

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
