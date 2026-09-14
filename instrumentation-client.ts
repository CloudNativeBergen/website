import { initTenantAnalytics } from '@/lib/posthog/init'

/**
 * Next.js client instrumentation entry: runs once per page load before the
 * app's client code. PostHog analytics (issue #1008) is initialised here,
 * gated on the config element the root layout renders only for organizations
 * with a token — see `src/lib/posthog/init.ts`.
 */
void initTenantAnalytics(window)
