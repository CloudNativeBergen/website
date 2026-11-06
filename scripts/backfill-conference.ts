#!/usr/bin/env tsx

/**
 * Sanity -> conference D1 backfill (#1788, epic #1772). READ-ONLY: it reads
 * Sanity and writes one local SQL file. It lives here, not in
 * services/conference/, because services may not import Sanity (eslint,
 * #1800); the mapping itself is services/conference/scripts/backfill.ts.
 * It writes rows only for conferences the tenant-directory backfill routes.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-conference.ts --dry-run
 *   pnpm tsx scripts/backfill-conference.ts [--out <dir>] [--only settings-phase1]
 *
 * WARNING: without --only, existing rows get EVERY column from Sanity, which
 * reverts D1-owned fields edited by d1_write tenants since the freeze (#2013).
 * `--only settings-phase1` updates only the #2019 columns on existing rows.
 *
 * Writes <dir>/conference.sql (default: .). Apply it with
 * `wrangler d1 execute --file`; this script never does.
 */

import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

/** Sanity, mapped exactly as the backfill writes it. Also used by parity. */
export async function loadBackfill() {
  const { clientReadUncached } = await import('../src/lib/sanity/client')
  const { mapBackfill, SETTINGS_PROJECTION } =
    await import('../services/conference/scripts/backfill')
  const directory =
    await import('../services/tenant-directory/scripts/backfill')

  // groq-global: a platform-wide migration reads every tenant by design.
  const { orgs, verifications, docs } = await clientReadUncached.fetch(`{
    "orgs": *[_type == "organization" && !(_id in path("drafts.**"))]{ _id, name, "slug": slug.current, plan },
    "verifications": *[_type == "domainVerification" && !(_id in path("drafts.**"))]{ hostname, "conferenceId": conference._ref, status },
    "docs": *[_type == "conference" && !(_id in path("drafts.**"))]{
    _id, "orgId": organization._ref, title, tagline, city, country,
    venueName, venueAddress, startDate, endDate, lifecycleStatus, domains, visibility,
    backgroundPattern, theme,
    registrationLink, socialLinks, ${SETTINGS_PROJECTION}
  }
  }`)
  const dir = directory.mapBackfill(orgs, docs, verifications)
  const routable = new Set(dir.conferences.map((c) => c.id))
  return { ...mapBackfill(docs, routable), domains: dir.domains }
}

async function main() {
  const args = process.argv.slice(2)
  const b = await loadBackfill()
  const { toSql, SETTINGS_PHASE1_COLUMNS } =
    await import('../services/conference/scripts/backfill')
  const o = args.indexOf('--only')
  const only = o >= 0 ? args[o + 1] : undefined
  if (only !== undefined && only !== 'settings-phase1')
    throw new Error(`unknown --only ${only}; use settings-phase1`)

  console.log(`conferences ${b.rows.length}, anomalies ${b.anomalies.length}`)
  for (const a of b.anomalies) console.log(`  ${a}`)
  if (args.includes('--dry-run')) return

  const i = args.indexOf('--out')
  const file = join(i >= 0 ? args[i + 1] : '.', 'conference.sql')
  writeFileSync(
    file,
    toSql(b.rows, only ? { only: SETTINGS_PHASE1_COLUMNS } : {}),
  )
  console.log(`wrote ${file}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
