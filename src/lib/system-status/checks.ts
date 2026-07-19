import 'server-only'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { clientReadUncached } from '@/lib/sanity/client'
import {
  isPushConfigured,
  getVapidPublicKey,
  getConfiguredWebPush,
  getWebPushConfigError,
} from '@/lib/push/vapid'
import { checkinGraphQLClient } from '@/lib/tickets/graphql-client'
import { providerMap } from '@/lib/auth'
import type {
  CheckGroup,
  CheckStatus,
  ConferenceForSystemChecks,
  SystemCheck,
} from './types'

/**
 * Server-only registry of passive system checks for /admin/settings.
 *
 * DESIGN CONTRACT (do not break):
 *  - Read `process.env.X` DIRECTLY. Never import a module that asserts/throws at
 *    load when unconfigured (email/config asserts RESEND_API_KEY;
 *    cospeaker/server throws on INVITATION_TOKEN_SECRET; badge/config and
 *    adobe-sign/auth getters throw on missing keys). We only import modules that
 *    are provably import-safe: sanity/client (falls back to 'invalid'),
 *    push/vapid (returns '' when unset), tickets/graphql-client (warns, never
 *    throws at import), and auth (providers just get undefined ids).
 *  - SECRETS ARE NEVER ECHOED. A secret is surfaced only as a sha256 fingerprint
 *    plus its length, e.g. `a1b2c3d4 (32 chars)` — never the value itself.
 *    Non-secrets (dataset, project id, from-address, provider names, schedules,
 *    channels) are shown plain.
 *  - Status semantics: 'error' only when the absence breaks a LIVE feature;
 *    'warn' for degraded/fallback; 'off' for a deliberately-optional integration
 *    left unconfigured; 'ok' otherwise.
 */

const REPO_URL = 'https://github.com/CloudNativeBergen/website'

const VERCEL_CRONS: ReadonlyArray<{ path: string; schedule: string }> = [
  { path: '/api/cron/weekly-update', schedule: '0 9 * * 1' },
  { path: '/api/cron/cleanup-orphaned-blobs', schedule: '0 3 * * *' },
  { path: '/api/cron/contract-reminders', schedule: '0 9 * * *' },
  { path: '/api/cron/cleanup-notifications', schedule: '0 4 * * *' },
]

/** sha256 fingerprint (first 8 hex) + length. NEVER returns the raw value. */
function fingerprint(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 8)
  return `${hash} (${value.length} chars)`
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

interface CheckMeta {
  id: string
  group: CheckGroup
  label: string
}

/** Presence + fingerprint of a SECRET env var. Absent → `missingStatus`. */
function secretCheck(
  meta: CheckMeta,
  env: string,
  missingStatus: CheckStatus,
  detail?: { present?: string; missing?: string },
): SystemCheck {
  const value = process.env[env]
  if (value && value.length > 0) {
    return {
      ...meta,
      status: 'ok',
      value: fingerprint(value),
      detail: detail?.present,
    }
  }
  return {
    ...meta,
    status: missingStatus,
    value: 'not set',
    detail: detail?.missing,
  }
}

/** Presence-only of an env var (no fingerprint — e.g. large keys). */
function presenceCheck(
  meta: CheckMeta,
  env: string,
  missingStatus: CheckStatus,
  detail?: { present?: string; missing?: string },
): SystemCheck {
  const set = Boolean(process.env[env])
  return set
    ? { ...meta, status: 'ok', value: 'set', detail: detail?.present }
    : {
        ...meta,
        status: missingStatus,
        value: 'not set',
        detail: detail?.missing,
      }
}

/** Plain (non-secret) env value. Absent → `missingStatus`. */
function plainCheck(
  meta: CheckMeta,
  raw: string | number | undefined | null,
  missingStatus: CheckStatus,
  detail?: { present?: string; missing?: string },
): SystemCheck {
  const value =
    raw === undefined || raw === null || raw === '' ? undefined : String(raw)
  return value !== undefined
    ? { ...meta, status: 'ok', value, detail: detail?.present }
    : {
        ...meta,
        status: missingStatus,
        value: 'not set',
        detail: detail?.missing,
      }
}

function readFileSafe(relative: string): string | null {
  try {
    return readFileSync(path.join(process.cwd(), relative), 'utf8')
  } catch {
    return null
  }
}

function buildChecks(conference: ConferenceForSystemChecks): SystemCheck[] {
  const checks: SystemCheck[] = []

  // ---- BUILD & RUNTIME ------------------------------------------------------
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  checks.push(
    sha
      ? {
          id: 'build.commit',
          group: 'build',
          label: 'Git commit',
          status: 'ok',
          value: sha.slice(0, 7),
        }
      : {
          id: 'build.commit',
          group: 'build',
          label: 'Git commit',
          status: 'off',
          value: 'not set',
          detail: 'Only injected on the Vercel build runtime',
        },
  )

  const swSrc = readFileSafe('public/sw.js')
  const cacheMatch = swSrc?.match(
    /const\s+CACHE_VERSION\s*=\s*['"]([^'"]*)['"]/,
  )
  checks.push(
    cacheMatch
      ? {
          id: 'build.cacheVersion',
          group: 'build',
          label: 'Service worker CACHE_VERSION',
          status: 'ok',
          value: cacheMatch[1],
          detail: 'Stamped with the deploy SHA at build; drives PWA updates',
        }
      : {
          id: 'build.cacheVersion',
          group: 'build',
          label: 'Service worker CACHE_VERSION',
          status: 'warn',
          value: 'unavailable',
          detail: 'Could not read CACHE_VERSION from public/sw.js',
        },
  )

  const pkgSrc = readFileSafe('package.json')
  let pkgVersion: string | undefined
  try {
    pkgVersion = pkgSrc ? (JSON.parse(pkgSrc).version as string) : undefined
  } catch {
    pkgVersion = undefined
  }
  checks.push(
    plainCheck(
      { id: 'build.appVersion', group: 'build', label: 'App version' },
      pkgVersion,
      'warn',
      { missing: 'Could not read version from package.json' },
    ),
  )

  checks.push(
    plainCheck(
      { id: 'build.baseUrl', group: 'build', label: 'NEXT_PUBLIC_BASE_URL' },
      process.env.NEXT_PUBLIC_BASE_URL,
      'warn',
      { missing: 'Absolute links fall back to http://localhost:3000' },
    ),
  )

  checks.push(
    plainCheck(
      { id: 'build.nodeEnv', group: 'build', label: 'NODE_ENV' },
      process.env.NODE_ENV,
      'warn',
    ),
  )

  // ---- SANITY ---------------------------------------------------------------
  checks.push(
    plainCheck(
      { id: 'sanity.projectId', group: 'sanity', label: 'Project ID' },
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
      'error',
      { missing: 'Sanity cannot be reached without a project id' },
    ),
    plainCheck(
      { id: 'sanity.dataset', group: 'sanity', label: 'Dataset' },
      process.env.NEXT_PUBLIC_SANITY_DATASET,
      'error',
      { missing: 'No dataset configured' },
    ),
    plainCheck(
      { id: 'sanity.apiVersion', group: 'sanity', label: 'API version' },
      process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? '2023-05-03',
      'warn',
    ),
    secretCheck(
      {
        id: 'sanity.readToken',
        group: 'sanity',
        label: 'Read token (SANITY_API_TOKEN_READ)',
      },
      'SANITY_API_TOKEN_READ',
      'error',
      {
        missing: "Client falls back to the literal 'invalid' — reads will fail",
      },
    ),
    secretCheck(
      {
        id: 'sanity.writeToken',
        group: 'sanity',
        label: 'Write token (SANITY_API_TOKEN_WRITE)',
      },
      'SANITY_API_TOKEN_WRITE',
      'error',
      {
        missing:
          "Client falls back to the literal 'invalid' — writes will fail",
      },
    ),
  )

  // ---- AUTH -----------------------------------------------------------------
  const providerNames = providerMap.map((p) => p.name).join(', ')
  checks.push(
    providerMap.length > 0
      ? {
          id: 'auth.providers',
          group: 'auth',
          label: 'Enabled providers',
          status: 'ok',
          value: providerNames,
        }
      : {
          id: 'auth.providers',
          group: 'auth',
          label: 'Enabled providers',
          status: 'error',
          value: 'none',
          detail: 'No OAuth providers registered — sign-in is impossible',
        },
  )
  checks.push(
    pairedProvider(
      'github',
      'GitHub OAuth',
      'AUTH_GITHUB_ID',
      'AUTH_GITHUB_SECRET',
    ),
  )
  checks.push(
    pairedProvider(
      'linkedin',
      'LinkedIn OAuth',
      'AUTH_LINKEDIN_ID',
      'AUTH_LINKEDIN_SECRET',
    ),
  )
  checks.push(
    secretCheck(
      { id: 'auth.secret', group: 'auth', label: 'AUTH_SECRET' },
      'AUTH_SECRET',
      'error',
      { missing: 'JWT signing/verification breaks — no one can sign in' },
    ),
  )
  // NOTE: AUTH_COOKIE_DOMAIN (the prod subdomain-cookie fix) is NOT read as an
  // env var anywhere in the codebase today, so there is nothing to surface.
  // If it is later wired as a `process.env.AUTH_COOKIE_DOMAIN` read, add a plain
  // check here that warns when unset.

  // ---- EMAIL ----------------------------------------------------------------
  checks.push(
    secretCheck(
      { id: 'email.resendKey', group: 'email', label: 'RESEND_API_KEY' },
      'RESEND_API_KEY',
      'error',
      { missing: 'All outbound email (CFP, badges, broadcasts) fails' },
    ),
    plainCheck(
      { id: 'email.from', group: 'email', label: 'CFP from-address' },
      conference.cfpEmail,
      'warn',
      {
        present: 'Used as the From address for speaker email',
        missing: 'conference.cfpEmail is unset',
      },
    ),
  )

  // ---- SLACK ----------------------------------------------------------------
  checks.push(
    secretCheck(
      { id: 'slack.botToken', group: 'slack', label: 'SLACK_BOT_TOKEN' },
      'SLACK_BOT_TOKEN',
      'off',
      {
        present: 'Messages are posted to Slack',
        missing:
          'Unset → messages are logged to the console in dev, skipped otherwise',
      },
    ),
    plainCheck(
      {
        id: 'slack.weeklyChannel',
        group: 'slack',
        label: 'Weekly-update channel',
      },
      conference.salesNotificationChannel,
      'off',
      {
        present: 'conference.salesNotificationChannel',
        missing: 'Weekly update has nowhere to post',
      },
    ),
    plainCheck(
      {
        id: 'slack.cfpChannel',
        group: 'slack',
        label: 'CFP notification channel',
      },
      conference.cfpNotificationChannel,
      'off',
      { present: 'conference.cfpNotificationChannel' },
    ),
  )

  // ---- PUSH -----------------------------------------------------------------
  const pushOn = isPushConfigured()
  // Exercise the REAL web-push configuration: keys can be present but
  // MALFORMED (bare-email VAPID_SUBJECT, wrong-length key) — setVapidDetails
  // rejects those synchronously, and until surfaced here that only appeared
  // as an opaque failure on the push test button.
  if (pushOn) getConfiguredWebPush()
  const vapidError = getWebPushConfigError()
  checks.push({
    id: 'push.configured',
    group: 'push',
    label: 'VAPID key pair',
    status: vapidError ? 'error' : pushOn ? 'ok' : 'off',
    value: vapidError ? 'invalid' : pushOn ? 'configured' : 'not set',
    detail: vapidError
      ? `web-push rejected the configuration: ${vapidError}`
      : pushOn
        ? undefined
        : 'Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set',
  })
  const vapidPublic = getVapidPublicKey()
  checks.push(
    vapidPublic
      ? {
          id: 'push.vapidPublic',
          group: 'push',
          label: 'VAPID public key',
          status: 'ok',
          value: fingerprint(vapidPublic),
        }
      : {
          id: 'push.vapidPublic',
          group: 'push',
          label: 'VAPID public key',
          status: 'off',
          value: 'not set',
        },
  )
  checks.push(
    plainCheck(
      { id: 'push.vapidSubject', group: 'push', label: 'VAPID_SUBJECT' },
      process.env.VAPID_SUBJECT ?? 'mailto:hei@cloudnativedays.no',
      'warn',
    ),
  )

  // ---- TICKETS --------------------------------------------------------------
  const checkinOn = checkinGraphQLClient.isConfigured()
  checks.push({
    id: 'tickets.apiCreds',
    group: 'tickets',
    label: 'Checkin.no API credentials',
    status: checkinOn ? 'ok' : 'off',
    value: checkinOn ? 'configured' : 'not set',
    detail: checkinOn
      ? undefined
      : 'CHECKIN_API_KEY and CHECKIN_API_SECRET are required for ticket sync',
  })
  checks.push(
    plainCheck(
      {
        id: 'tickets.customerId',
        group: 'tickets',
        label: 'Checkin customer ID',
      },
      conference.checkinCustomerId,
      'off',
      { present: 'conference.checkinCustomerId' },
    ),
    plainCheck(
      { id: 'tickets.eventId', group: 'tickets', label: 'Checkin event ID' },
      conference.checkinEventId,
      'off',
      { present: 'conference.checkinEventId' },
    ),
    secretCheck(
      {
        id: 'tickets.webhookSecret',
        group: 'tickets',
        label: 'CHECKIN_WEBHOOK_SECRET',
      },
      'CHECKIN_WEBHOOK_SECRET',
      'off',
      { missing: 'Inbound ticket-sold webhooks cannot be verified' },
    ),
  )

  // ---- CONTRACTS ------------------------------------------------------------
  const provider = process.env.CONTRACT_SIGNING_PROVIDER ?? 'self-hosted'
  checks.push({
    id: 'contracts.provider',
    group: 'contracts',
    label: 'Signing provider',
    status: 'ok',
    value: provider,
  })
  if (provider === 'adobe-sign') {
    checks.push(
      presenceCheck(
        {
          id: 'contracts.adobeAppId',
          group: 'contracts',
          label: 'ADOBE_SIGN_APPLICATION_ID',
        },
        'ADOBE_SIGN_APPLICATION_ID',
        'error',
        { missing: 'Adobe Sign is selected but the application id is unset' },
      ),
      secretCheck(
        {
          id: 'contracts.adobeAppSecret',
          group: 'contracts',
          label: 'ADOBE_SIGN_APPLICATION_SECRET',
        },
        'ADOBE_SIGN_APPLICATION_SECRET',
        'error',
        {
          missing: 'Adobe Sign is selected but the application secret is unset',
        },
      ),
      plainCheck(
        {
          id: 'contracts.adobeShard',
          group: 'contracts',
          label: 'ADOBE_SIGN_SHARD',
        },
        process.env.ADOBE_SIGN_SHARD ?? 'eu2',
        'warn',
      ),
    )
  }

  // ---- BADGES (presence only — large keys) ----------------------------------
  checks.push(
    presenceCheck(
      {
        id: 'badges.rsaPrivate',
        group: 'badges',
        label: 'BADGE_ISSUER_RSA_PRIVATE_KEY',
      },
      'BADGE_ISSUER_RSA_PRIVATE_KEY',
      'off',
      { missing: 'RSA badge signing unavailable' },
    ),
    presenceCheck(
      {
        id: 'badges.rsaPublic',
        group: 'badges',
        label: 'BADGE_ISSUER_RSA_PUBLIC_KEY',
      },
      'BADGE_ISSUER_RSA_PUBLIC_KEY',
      'off',
    ),
    presenceCheck(
      {
        id: 'badges.ed25519Seed',
        group: 'badges',
        label: 'BADGE_ISSUER_ED25519_SEED',
      },
      'BADGE_ISSUER_ED25519_SEED',
      'off',
      { missing: 'Ed25519 badge signing unavailable' },
    ),
  )

  // ---- INVITES --------------------------------------------------------------
  checks.push(
    presenceCheck(
      {
        id: 'invites.tokenSecret',
        group: 'invites',
        label: 'INVITATION_TOKEN_SECRET',
      },
      'INVITATION_TOKEN_SECRET',
      'off',
      { missing: 'Co-speaker invitation tokens cannot be signed or verified' },
    ),
  )

  // ---- CRON / OPS -----------------------------------------------------------
  checks.push(
    secretCheck(
      { id: 'ops.cronSecret', group: 'ops', label: 'CRON_SECRET' },
      'CRON_SECRET',
      'error',
      {
        missing:
          'Cron endpoints reject Vercel invocations — scheduled jobs fail',
      },
    ),
  )
  for (const cron of VERCEL_CRONS) {
    checks.push({
      id: `ops.cron.${cron.path}`,
      group: 'ops',
      label: cron.path.replace('/api/cron/', 'cron: '),
      status: 'ok',
      value: cron.schedule,
    })
  }
  checks.push(
    secretCheck(
      { id: 'ops.blobToken', group: 'ops', label: 'BLOB_READ_WRITE_TOKEN' },
      'BLOB_READ_WRITE_TOKEN',
      'warn',
      { missing: 'Vercel Blob storage (uploads, badge assets) unavailable' },
    ),
  )
  checks.push({
    id: 'ops.migrationWorkflow',
    group: 'ops',
    label: 'Run-migration workflow',
    status: 'ok',
    value: `${REPO_URL}/actions/workflows/run-migration.yml`,
    detail: 'Trigger data migrations from GitHub Actions',
  })

  // ---- MISC -----------------------------------------------------------------
  checks.push(
    secretCheck(
      {
        id: 'misc.exchangeRate',
        group: 'misc',
        label: 'NEXT_PUBLIC_EXCHANGE_RATE_API_KEY',
      },
      'NEXT_PUBLIC_EXCHANGE_RATE_API_KEY',
      'warn',
      {
        missing: 'Free-tier fallback in effect (limited exchange-rate lookups)',
      },
    ),
    presenceCheck(
      { id: 'misc.workos', group: 'misc', label: 'WORKOS_CLIENT_ID' },
      'WORKOS_CLIENT_ID',
      'off',
      { missing: 'Workshop (WorkOS) login unavailable' },
    ),
  )

  return checks
}

function pairedProvider(
  key: string,
  label: string,
  idEnv: string,
  secretEnv: string,
): SystemCheck {
  const id = process.env[idEnv]
  const secret = process.env[secretEnv]
  const meta = { id: `auth.${key}`, group: 'auth' as const, label }
  if (id && secret) {
    return {
      ...meta,
      status: 'ok',
      value: fingerprint(secret),
      detail: 'Client id + secret set',
    }
  }
  if (id || secret) {
    return {
      ...meta,
      status: 'warn',
      value: 'partial',
      detail: `Only ${id ? idEnv : secretEnv} is set — this provider is misconfigured`,
    }
  }
  return {
    ...meta,
    status: 'off',
    value: 'not set',
    detail: 'Provider disabled',
  }
}

/** Live uncached Sanity read probe with latency. */
async function sanityReadProbe(): Promise<SystemCheck> {
  const meta = {
    id: 'sanity.readProbe',
    group: 'sanity' as const,
    label: 'Live read probe',
  }
  const start = Date.now()
  try {
    const id = await clientReadUncached.fetch<string | null>(
      `*[_type == "conference"][0]._id`,
    )
    const ms = Date.now() - start
    return {
      ...meta,
      status: 'ok',
      value: `${ms} ms`,
      detail: id
        ? `Read conference ${id}`
        : 'Connected, but no conference document found',
    }
  } catch (err) {
    return {
      ...meta,
      status: 'error',
      value: `${Date.now() - start} ms`,
      detail: errMsg(err),
    }
  }
}

/** Total active web-push subscriptions across all speakers (count only). */
async function pushSubscriptionCount(): Promise<SystemCheck> {
  const meta = {
    id: 'push.subscriptions',
    group: 'push' as const,
    label: 'Active subscriptions',
  }
  try {
    const count = await clientReadUncached.fetch<number>(
      `count(*[_type == "speaker"].pushSubscriptions[])`,
    )
    return {
      ...meta,
      status: 'ok',
      value: String(count ?? 0),
      detail: 'Registered devices across all speakers',
    }
  } catch (err) {
    return { ...meta, status: 'warn', value: 'unknown', detail: errMsg(err) }
  }
}

/**
 * Full registry: synchronous env/file/conference checks PLUS the live Sanity
 * read probe and the push-subscription count. The live probes are appended into
 * their groups so the UI renders them alongside the static rows.
 */
export async function buildSystemChecks(
  conference: ConferenceForSystemChecks,
): Promise<SystemCheck[]> {
  const staticChecks = buildChecks(conference)
  const [readProbe, pushCount] = await Promise.all([
    sanityReadProbe(),
    pushSubscriptionCount(),
  ])
  return [...staticChecks, readProbe, pushCount]
}

/** Exposed for unit tests: the synchronous, side-effect-light checks only. */
export { buildChecks as collectStaticChecks }
