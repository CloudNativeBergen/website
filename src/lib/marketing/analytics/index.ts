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
 * The factory (docs/INTEGRATION_ADAPTERS.md): one vendor today. `null` when
 * the bag lacks what the vendor needs, so a caller never holds a provider
 * that can only fail.
 */
export function getMarketingAnalyticsProvider(
  credentials: Partial<AnalyticsCredentials> | null | undefined,
  options?: PostHogAnalyticsOptions,
): MarketingAnalyticsProvider | null {
  const projectId = credentials?.projectId?.trim()
  const apiKey = credentials?.apiKey?.trim()
  if (!projectId || !apiKey) return null
  return new PostHogAnalyticsProvider({ projectId, apiKey }, options)
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
): Promise<MarketingAnalyticsProvider | null> {
  if (!orgId) return null
  return getMarketingAnalyticsProvider(await secrets(orgId, 'analytics'))
}
