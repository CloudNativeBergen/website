import type { SystemCheck } from '@/lib/system-status/types'

/**
 * Deterministic fixture registry for Storybook. Covers every status
 * (ok / warn / error / off), secret fingerprints, plain values, and a URL value
 * so the section renders realistically without a server round-trip.
 */
export const fixtureChecks: SystemCheck[] = [
  // build
  {
    id: 'build.commit',
    group: 'build',
    label: 'Git commit',
    status: 'ok',
    value: '9799258',
  },
  {
    id: 'build.cacheVersion',
    group: 'build',
    label: 'Service worker CACHE_VERSION',
    status: 'ok',
    value: 'cndn-9799258',
    detail: 'Stamped with the deploy SHA at build; drives PWA updates',
  },
  {
    id: 'build.appVersion',
    group: 'build',
    label: 'App version',
    status: 'ok',
    value: '2025.10.30',
  },
  {
    id: 'build.baseUrl',
    group: 'build',
    label: 'NEXT_PUBLIC_BASE_URL',
    status: 'warn',
    value: 'not set',
    detail: 'Absolute links fall back to http://localhost:3000',
  },
  {
    id: 'build.nodeEnv',
    group: 'build',
    label: 'NODE_ENV',
    status: 'ok',
    value: 'production',
  },

  // sanity
  {
    id: 'sanity.projectId',
    group: 'sanity',
    label: 'Project ID',
    status: 'ok',
    value: 'abc123xy',
  },
  {
    id: 'sanity.dataset',
    group: 'sanity',
    label: 'Dataset',
    status: 'ok',
    value: 'production',
  },
  {
    id: 'sanity.readToken',
    group: 'sanity',
    label: 'Read token (SANITY_API_TOKEN_READ)',
    status: 'ok',
    value: 'a1b2c3d4 (172 chars)',
  },
  {
    id: 'sanity.writeToken',
    group: 'sanity',
    label: 'Write token (SANITY_API_TOKEN_WRITE)',
    status: 'error',
    value: 'not set',
    detail: "Client falls back to the literal 'invalid' — writes will fail",
  },
  {
    id: 'sanity.readProbe',
    group: 'sanity',
    label: 'Live read probe',
    status: 'ok',
    value: '84 ms',
    detail: 'Read conference conf-2026',
  },

  // auth
  {
    id: 'auth.providers',
    group: 'auth',
    label: 'Enabled providers',
    status: 'ok',
    value: 'GitHub, LinkedIn',
  },
  {
    id: 'auth.github',
    group: 'auth',
    label: 'GitHub OAuth',
    status: 'ok',
    value: 'deadbeef (40 chars)',
    detail: 'Client id + secret set',
  },
  {
    id: 'auth.linkedin',
    group: 'auth',
    label: 'LinkedIn OAuth',
    status: 'warn',
    value: 'partial',
    detail: 'Only AUTH_LINKEDIN_ID is set — this provider is misconfigured',
  },
  {
    id: 'auth.secret',
    group: 'auth',
    label: 'AUTH_SECRET',
    status: 'ok',
    value: 'feedface (44 chars)',
  },

  // slack
  {
    id: 'slack.botToken',
    group: 'slack',
    label: 'SLACK_BOT_TOKEN',
    status: 'off',
    value: 'not set',
    detail:
      'Unset → messages are logged to the console in dev, skipped otherwise',
  },
  {
    id: 'slack.weeklyChannel',
    group: 'slack',
    label: 'Weekly-update channel',
    status: 'ok',
    value: '#cndn-updates',
    detail: 'conference.salesNotificationChannel',
  },

  // push
  {
    id: 'push.configured',
    group: 'push',
    label: 'VAPID key pair',
    status: 'ok',
    value: 'configured',
  },
  {
    id: 'push.vapidPublic',
    group: 'push',
    label: 'VAPID public key',
    status: 'ok',
    value: 'c0ffee12 (87 chars)',
  },
  {
    id: 'push.subscriptions',
    group: 'push',
    label: 'Active subscriptions',
    status: 'ok',
    value: '312',
    detail: 'Registered devices across all speakers',
  },

  // ops
  {
    id: 'ops.cronSecret',
    group: 'ops',
    label: 'CRON_SECRET',
    status: 'error',
    value: 'not set',
    detail: 'Cron endpoints reject Vercel invocations — scheduled jobs fail',
  },
  {
    id: 'ops.cron.weekly',
    group: 'ops',
    label: 'cron: weekly-update',
    status: 'ok',
    value: '0 9 * * 1',
  },
  {
    id: 'ops.migrationWorkflow',
    group: 'ops',
    label: 'Run-migration workflow',
    status: 'ok',
    value:
      'https://github.com/CloudNativeBergen/website/actions/workflows/run-migration.yml',
    detail: 'Trigger data migrations from GitHub Actions',
  },

  // misc
  {
    id: 'misc.exchangeRate',
    group: 'misc',
    label: 'NEXT_PUBLIC_EXCHANGE_RATE_API_KEY',
    status: 'warn',
    value: 'not set',
    detail: 'Free-tier fallback in effect (limited exchange-rate lookups)',
  },
  {
    id: 'misc.workos',
    group: 'misc',
    label: 'WORKOS_CLIENT_ID',
    status: 'off',
    value: 'not set',
    detail: 'Workshop (WorkOS) login unavailable',
  },
]
