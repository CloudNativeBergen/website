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
 * The per-platform registry. EMPTY in the posting core: every platform is
 * manual until its adapter lands (Bluesky and the LinkedIn manual provider in
 * spec §9 step 2). Register a platform here and the cron dispatches to it.
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
 * The request-boundary resolver the cron hands the engine. Manual mode is
 * DERIVED here, never stored (#788): a variant is manual iff no adapter can
 * be built for its platform. When per-conference connections and the
 * `bluesky` secret family arrive (step 2), this is the one place that reads
 * them — `resolveTenantSecrets(orgId, family)` — and hands them to the factory.
 */
export const resolveSocialPublishAdapter: AdapterResolver = async (variant) =>
  getSocialPublishAdapter(variant.platform, {})
