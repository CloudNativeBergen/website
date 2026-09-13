import type { SocialPlatform } from '../types'
import type { AdapterResolver } from '../publish-engine'
import type { SocialPublishAdapter } from './types'

export type {
  PlatformConstraints,
  PublishInput,
  PublishMedia,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './types'

/** Opaque credential bag a platform adapter is constructed with. */
export type AdapterCredentials = Record<string, string>

type AdapterFactory = (credentials: AdapterCredentials) => SocialPublishAdapter

/**
 * The per-platform registry. EMPTY in the posting core; Bluesky and the
 * LinkedIn manual provider register here in spec §9 step 2.
 */
const ADAPTERS: Partial<Record<SocialPlatform, AdapterFactory>> = {}

/**
 * The factory (docs/INTEGRATION_ADAPTERS.md): selects the platform class and
 * injects the credentials. `null` means "no adapter for this platform".
 */
export function getSocialPublishAdapter(
  platform: SocialPlatform,
  credentials: AdapterCredentials,
): SocialPublishAdapter | null {
  const make = ADAPTERS[platform]
  return make ? make(credentials) : null
}

/**
 * The connection lookup (#787/#788): the credentials this CONFERENCE holds for
 * this platform, or `null` when it has no active connection. Manual mode is
 * DERIVED from this answer, never stored. Step 2 replaces the body with the
 * `socialConnection` read plus `resolveTenantSecrets(orgId, family)`; the
 * signature is the seam. Until then no conference is connected anywhere.
 */
export async function resolveSocialCredentials(
  conferenceId: string,
  platform: SocialPlatform,
): Promise<AdapterCredentials | null> {
  void conferenceId
  void platform
  return null
}

/**
 * The request-boundary resolver the cron hands the engine: a variant is
 * manual iff its conference has no connection for the platform — a
 * registered adapter alone does not make a variant automatic.
 */
export const resolveSocialPublishAdapter: AdapterResolver = async (variant) => {
  const credentials = await resolveSocialCredentials(
    variant.conferenceId,
    variant.platform,
  )
  if (!credentials) return null
  return getSocialPublishAdapter(variant.platform, credentials)
}
