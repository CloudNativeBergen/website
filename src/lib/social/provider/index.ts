import { SOCIAL_PLATFORMS, type SocialPlatform } from '../types'
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
  // OWN properties only: `platform` comes from a stored document, and a
  // malformed value such as "constructor" must not resolve an inherited
  // function and get called as a factory.
  if (!Object.hasOwn(ADAPTERS, platform)) return null
  const make = ADAPTERS[platform]
  return make ? make(credentials) : null
}

/** Runtime check for a value read from storage, not from the type system. */
export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (
    typeof value === 'string' &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  )
}

/**
 * The connection lookup (#787/#788): the credentials this ORGANIZATION holds
 * for this platform, or `null` when it has no active connection. Connections
 * and secrets are org-scoped (`resolveTenantSecrets(orgId, family)`), and the
 * variant slice carries `orgId` so the tick needs no extra read. Manual mode
 * is DERIVED from this answer, never stored. Step 2 replaces the body with
 * the `socialConnection` read plus the secret resolution; the signature is
 * the seam. Until then no organization is connected anywhere.
 */
export async function resolveSocialCredentials(
  orgId: string,
  platform: SocialPlatform,
): Promise<AdapterCredentials | null> {
  void orgId
  void platform
  return null
}

/**
 * The request-boundary resolver the cron hands the engine: a variant is
 * manual iff its organization has no connection for the platform — a
 * registered adapter alone does not make a variant automatic. A variant
 * with no resolvable organization is manual too (fail closed).
 */
export const resolveSocialPublishAdapter: AdapterResolver = async (variant) => {
  // A platform the registry does not know (a hand-edited document) is
  // manual, never a lookup against arbitrary property names.
  if (!isSocialPlatform(variant.platform)) return null
  if (!variant.orgId) return null
  const credentials = await resolveSocialCredentials(
    variant.orgId,
    variant.platform,
  )
  if (!credentials) return null
  return getSocialPublishAdapter(variant.platform, credentials)
}
