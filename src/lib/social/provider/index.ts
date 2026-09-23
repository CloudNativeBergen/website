import { isHostRoutable } from '@/lib/domain-verification/routing'
import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { SecretFamily } from '@/lib/secrets/types'
import { SOCIAL_PLATFORMS, type SocialPlatform } from '../types'
import type { AdapterResolver } from '../publish-engine'
import { BlueskyPublishAdapter } from './bluesky'
import { BlueskyEngagementProvider } from './bluesky-engagement'
import { BufferPublishAdapter } from './buffer'
import type { SocialEngagementProvider, SocialPublishAdapter } from './types'

export type {
  PlatformConstraints,
  PublishInput,
  PublishMedia,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './types'
export type {
  EngagementFailureKind,
  EngagementResult,
  PostEngagement,
  SocialEngagementProvider,
} from './types'
export { totalEngagement } from './types'
export {
  BLUESKY_APPVIEW_HOST,
  BLUESKY_GET_POSTS_BATCH,
} from './bluesky-engagement'

/** Opaque credential bag a platform adapter is constructed with. */
export type AdapterCredentials = Record<string, string>

/** What the request boundary knows about the tenant besides its secrets. */
export interface AdapterContext {
  /** The conference's own domains — the only hosts a link card is built for. */
  linkCardHosts: readonly string[]
}

/** A factory returns `null` when the bag lacks what the platform needs. */
type AdapterFactory = (
  credentials: AdapterCredentials,
  context: AdapterContext,
) => SocialPublishAdapter | null

/**
 * The per-platform registry. Bluesky (#1005) publishes with the `bluesky`
 * secret family's app password. LinkedIn (#1129) publishes THROUGH Buffer
 * with the `buffer` family's personal API key and pinned channel id — both
 * or nothing, so a half-filled bag builds no adapter and the variant takes
 * the manual path (#1006) exactly as an unconnected organization's does.
 */
const ADAPTERS: Partial<Record<SocialPlatform, AdapterFactory>> = {
  bluesky: ({ identifier, appPassword }, { linkCardHosts }) =>
    identifier && appPassword
      ? new BlueskyPublishAdapter(
          { identifier, appPassword },
          { linkCardHosts },
        )
      : null,
  linkedin: ({ apiKey, linkedinChannelId }) =>
    apiKey && linkedinChannelId
      ? new BufferPublishAdapter(
          { apiKey, channelId: linkedinChannelId },
          { platform: 'linkedin' },
        )
      : null,
}

/**
 * Which secret family carries a platform's connection. A platform absent
 * here has no integrated channel: its variants are always manual. Manual
 * mode is derived from THIS table at claim time, never stored on a
 * document. `linkedin → buffer` landed WITH the Buffer adapter (spec §2):
 * wired earlier it would have handed connected organizations the manual
 * provider, whose `publish` refuses.
 */
const CONNECTION_FAMILY: Partial<Record<SocialPlatform, SecretFamily>> = {
  bluesky: 'bluesky',
  linkedin: 'buffer',
}

/**
 * The factory (docs/INTEGRATION_ADAPTERS.md): selects the platform class and
 * injects the credentials. `null` means "no adapter for this platform".
 */
export function getSocialPublishAdapter(
  platform: SocialPlatform,
  credentials: AdapterCredentials,
  context: AdapterContext = { linkCardHosts: [] },
): SocialPublishAdapter | null {
  // OWN properties only: `platform` comes from a stored document, and a
  // malformed value such as "constructor" must not resolve an inherited
  // function and get called as a factory.
  if (!Object.hasOwn(ADAPTERS, platform)) return null
  const make = ADAPTERS[platform]
  return make ? make(credentials, context) : null
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
/**
 * The hosts a link card may be built for: the conference's `domains[]`
 * entries that the domain-verification gate would ROUTE — an entry is a
 * claim until its DNS proof resolves (#683), and an unverified claim must
 * not make the cron fetch it. `isHostRoutable` is a no-op while routing
 * enforcement is off; the link-card fetch still refuses address literals,
 * local names and ports on its own.
 */
export async function linkCardHostsFor(
  domains: readonly string[],
  routable: typeof isHostRoutable = isHostRoutable,
): Promise<string[]> {
  const allowed: string[] = []
  for (const domain of domains) {
    if (await routable(domain, domains)) allowed.push(domain)
  }
  return allowed
}

export const resolveSocialPublishAdapter = async (
  variant: Parameters<AdapterResolver>[0],
  secrets: SecretsLookup = resolveTenantSecrets,
): ReturnType<AdapterResolver> => {
  // A platform the registry does not know (a hand-edited document) is
  // manual, never a lookup against arbitrary property names.
  if (!isSocialPlatform(variant.platform)) return null
  if (!variant.orgId) return null
  const credentials = await resolveSocialCredentials(
    variant.orgId,
    variant.platform,
    secrets,
  )
  if (!credentials) return null
  return getSocialPublishAdapter(variant.platform, credentials, {
    linkCardHosts: await linkCardHostsFor(variant.conferenceDomains),
  })
}

/**
 * The ENGAGEMENT half of the registry (spec §4.1). Bluesky's counters are
 * public, so its provider takes no credentials and is built unconditionally;
 * LinkedIn has none yet — reading its metrics through Buffer is a later
 * slice (#1129 persists the Buffer post id for it) — so a caller gets
 * `null` rather than a stub that always answers nothing.
 *
 * A platform absent here simply has no readable engagement — the Snapshot
 * stores `null`, never `0`.
 */
const ENGAGEMENT_PROVIDERS: Partial<
  Record<SocialPlatform, () => SocialEngagementProvider>
> = {
  bluesky: () => new BlueskyEngagementProvider(),
}

export function getSocialEngagementProvider(
  platform: SocialPlatform,
): SocialEngagementProvider | null {
  return ENGAGEMENT_PROVIDERS[platform]?.() ?? null
}
