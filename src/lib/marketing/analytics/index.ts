import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { AnalyticsCredentials } from '@/lib/secrets/types'
import {
  PostHogAnalyticsProvider,
  type PostHogAnalyticsOptions,
} from './posthog'
import type { MarketingAnalyticsProvider } from './types'

export type {
  BreakdownGrain,
  CampaignBreakdownFailureKind,
  CampaignBreakdownInput,
  CampaignBreakdownResult,
  CampaignBreakdownRow,
  MarketingAnalyticsProvider,
} from './types'
export { startOfTodayUtc, UNATTRIBUTED } from './types'
export { PostHogAnalyticsProvider } from './posthog'

/**
 * The factory (docs/INTEGRATION_ADAPTERS.md): one vendor today. `null` when
 * the bag lacks what the vendor needs. The env stores hand out a complete
 * bag or nothing, but the `TENANT_SECRETS_JSON` store returns whatever
 * non-empty object the blob holds for the family, unvalidated — so both
 * fields are checked HERE, as the Bluesky factory does, and a half-filled
 * or mistyped entry becomes "no provider" rather than a request to
 * `/api/projects/undefined/` with a real key.
 */
export function getMarketingAnalyticsProvider(
  credentials:
    Partial<Record<keyof AnalyticsCredentials, unknown>> | null | undefined,
  options?: PostHogAnalyticsOptions,
): MarketingAnalyticsProvider | null {
  const projectId = nonEmptyString(credentials?.projectId)
  const apiKey = nonEmptyString(credentials?.apiKey)
  if (!projectId || !apiKey) return null
  return new PostHogAnalyticsProvider({ projectId, apiKey }, options)
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** The org-scoped secret lookup; injectable for tests. */
export type AnalyticsSecretsLookup = (
  orgId: string,
  family: 'analytics',
) => Promise<AnalyticsCredentials | null>

/**
 * The request-boundary resolver: the provider for THIS organization's
 * PostHog project, or `null` when it holds no `analytics` secret (per-org
 * `TENANT_<SLUG>_ANALYTICS_*`, the JSON blob, or the platform env for the
 * platform org only). An organization without one has no Outcomes — the
 * report says so rather than showing another tenant's numbers.
 */
export async function resolveMarketingAnalyticsProvider(
  orgId: string | null | undefined,
  secrets: AnalyticsSecretsLookup = resolveTenantSecrets,
  options?: PostHogAnalyticsOptions,
): Promise<MarketingAnalyticsProvider | null> {
  if (!orgId) return null
  return getMarketingAnalyticsProvider(
    await secrets(orgId, 'analytics'),
    options,
  )
}
