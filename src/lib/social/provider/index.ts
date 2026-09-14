import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { SecretFamily } from '@/lib/secrets/types'
import { SOCIAL_PLATFORMS, type SocialPlatform } from '../types'
import type { AdapterResolver } from '../publish-engine'
import { BlueskyPublishAdapter } from './bluesky'
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

/** A factory returns `null` when the bag lacks what the platform needs. */
type AdapterFactory = (
  credentials: AdapterCredentials,
) => SocialPublishAdapter | null

/**
 * The per-platform registry. Bluesky (#1005) publishes with the `bluesky`
 * secret family's app password; the LinkedIn manual provider (#1006)
 * registers here next.
 */
const ADAPTERS: Partial<Record<SocialPlatform, AdapterFactory>> = {
  bluesky: ({ identifier, appPassword }) =>
    identifier && appPassword
      ? new BlueskyPublishAdapter({ identifier, appPassword })
      : null,
}

/**
 * Which secret family carries a platform's connection. A platform absent
 * here has no integrated channel: its variants are always manual.
 */
const CONNECTION_FAMILY: Partial<Record<SocialPlatform, SecretFamily>> = {
  bluesky: 'bluesky',
}

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

/** The org-scoped secret lookup the connection is derived from; injectable for tests. */
export type SecretsLookup = (
  orgId: string,
  family: SecretFamily,
) => Promise<object | null>

/**
 * The connection lookup (#787/#788): the credentials this ORGANIZATION holds
 * for this platform, or `null` when it has no active connection. Connections
 * ARE the tenant secrets — an organization whose `bluesky` family resolves
 * (`TENANT_<SLUG>_BLUESKY_*`, the JSON blob, or the platform env for the
 * platform org) is connected; nothing is stored on any document. Manual mode
 * is DERIVED from this answer, never stored.
 */
export async function resolveSocialCredentials(
  orgId: string,
  platform: SocialPlatform,
  secrets: SecretsLookup = resolveTenantSecrets,
): Promise<AdapterCredentials | null> {
  const family = Object.hasOwn(CONNECTION_FAMILY, platform)
    ? CONNECTION_FAMILY[platform]
    : undefined
  if (!family) return null
  const bag = await secrets(orgId, family)
  if (!bag) return null
  // The opaque bag carries strings only; a family's non-string flags (badge
  // `rsaOnly`) are not adapter credentials.
  return Object.fromEntries(
    Object.entries(bag).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
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
