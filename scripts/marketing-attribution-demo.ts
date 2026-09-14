#!/usr/bin/env tsx

/**
 * Attribution read-back demo (#1009, spec §6.2).
 *
 * Prints sessions, pageviews and CTA clicks grouped by `utm_campaign` and
 * `utm_content` for one conference and one date range, straight from the
 * organization's PostHog project through `PostHogAnalyticsProvider`.
 *
 * It reads NOTHING from Sanity. Credentials come from the same env variables
 * the `analytics` secret family resolves in the app, read here at the script
 * boundary (the provider itself stays credential-injected):
 *
 *   --slug <SECRET_ENV_SLUG>  TENANT_<SLUG>_ANALYTICS_PROJECT_ID / _API_KEY
 *                             (the organization's `secretEnvSlug`: A–Z and
 *                             digits only, as the document field enforces)
 *   (no --slug)               POSTHOG_PROJECT_ID / POSTHOG_API_KEY
 *
 * USAGE
 *   pnpm tsx scripts/marketing-attribution-demo.ts \
 *     --conference <conferenceId> [--slug CNDN] \
 *     [--from 2026-09-01] [--to 2026-09-14] [--host https://eu.posthog.com]
 *
 *   `--to` is EXCLUSIVE and defaults to the start of today (UTC); the provider
 *   refuses anything later, so a tagged URL you visited today shows up
 *   tomorrow. Dates are `YYYY-MM-DD` at midnight UTC.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { parseArgs } from 'node:util'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parseDay(
  value: string,
  flag: string,
  isCalendarDate: (value: string) => boolean,
): Date {
  // `isCalendarDate` refuses what `new Date` would silently normalise
  // (2026-02-30 → March 2), which would move the window without a word.
  if (!isCalendarDate(value)) fail(`${flag} must be a real YYYY-MM-DD date`)
  return new Date(`${value}T00:00:00Z`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      conference: { type: 'string' },
      slug: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      host: { type: 'string' },
    },
  })
  if (!values.conference) fail('--conference <conferenceId> is required')

  // Imported from the MODULES, not the package barrel. The barrel's resolver
  // pulls in the secrets store and with it `server-only`, which throws
  // outside a Server Component — same reasoning and fix as
  // `scripts/backfill-domain-verification.ts`. The provider is still built
  // with injected credentials; only the lookup is done here, at the boundary.
  const { PostHogAnalyticsProvider } =
    await import('../src/lib/marketing/analytics/posthog')
  const { startOfTodayUtc, UNATTRIBUTED } =
    await import('../src/lib/marketing/analytics/types')
  const { isCalendarDate } = await import('../src/lib/time')
  const { secretEnvSlugProblem } = await import('../sanity/lib/secretEnvSlug')

  // The same rule the organization document enforces, so the demo can only
  // prove a configuration the app's per-org store would actually resolve.
  // `!== undefined`, not truthiness: `--slug ""` (an empty shell expansion)
  // must be refused, never quietly read as "use the platform credentials".
  const slugProblem =
    values.slug !== undefined ? secretEnvSlugProblem(values.slug) : null
  if (slugProblem) fail(`--slug ${slugProblem}`)

  const prefix =
    values.slug !== undefined ? `TENANT_${values.slug}_ANALYTICS` : 'POSTHOG'
  const projectId = process.env[`${prefix}_PROJECT_ID`]?.trim()
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim()
  if (!projectId || !apiKey) {
    fail(`${prefix}_PROJECT_ID and ${prefix}_API_KEY must both be set`)
  }

  const to = values.to
    ? parseDay(values.to, '--to', isCalendarDate)
    : startOfTodayUtc()
  const from = values.from
    ? parseDay(values.from, '--from', isCalendarDate)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

  const provider = new PostHogAnalyticsProvider(
    { projectId, apiKey },
    values.host ? { host: values.host } : {},
  )
  console.log(
    `project ${projectId} · conference ${values.conference} · ` +
      `[${from.toISOString()}, ${to.toISOString()})`,
  )

  const result = await provider.campaignBreakdown({
    conference: values.conference,
    from,
    to,
  })
  if (!result.ok) {
    fail(
      `${result.kind}: ${result.message}` +
        (result.retryAfter
          ? ` (retry after ${result.retryAfter.toISOString()})`
          : ''),
    )
  }

  if (result.rows.length === 0) {
    console.log('no events for this conference in the range')
    return
  }
  if (result.truncated) {
    console.log('note: the row cap was hit; the smallest groups may be missing')
  }
  console.table(
    result.rows.map((row) => ({
      campaign: row.campaign === UNATTRIBUTED ? '—' : row.campaign,
      task: row.task === UNATTRIBUTED ? '—' : row.task,
      sessions: row.sessions,
      pageviews: row.pageviews,
      cfp: row.cfpClicks,
      sponsor: row.sponsorClicks,
      checkout: row.checkoutClicks,
    })),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
