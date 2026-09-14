import { resolveTenantSecrets } from '@/lib/secrets/store'
import type { AnalyticsCredentials } from '@/lib/secrets/types'
import {
  PostHogAnalyticsProvider,
  type PostHogAnalyticsOptions,
} from './posthog'
import type { MarketingAnalyticsProvider } from './types'

export type {
  CampaignBreakdownFailureKind,
  CampaignBreakdownInput,
  CampaignBreakdownResult,
  CampaignBreakdownRow,
  MarketingAnalyticsProvider,
} from './types'
export { startOfTodayUtc, UNATTRIBUTED } from './types'
export { PostHogAnalyticsProvider } from './posthog'

/**
 * The factory (docs/INTEGRATION_ADAPTERS.md): one vendor today. The stores
 * already guarantee a complete, trimmed bag or `null`; this only turns that
 * `null` into "no provider".
 */
export function getMarketingAnalyticsProvider(
  credentials: AnalyticsCredentials | null | undefined,
  options?: PostHogAnalyticsOptions,
): MarketingAnalyticsProvider | null {
  return credentials ? new PostHogAnalyticsProvider(credentials, options) : null
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
