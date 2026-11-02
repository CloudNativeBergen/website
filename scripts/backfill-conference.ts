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
 *   pnpm tsx scripts/backfill-conference.ts [--out <dir>]
 *
 * Writes <dir>/conference.sql (default: .). Apply it with
 * `wrangler d1 execute --file`; this script never does.
 */

import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join, resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

async function main() {
  const args = process.argv.slice(2)
  const { clientReadUncached } = await import('../src/lib/sanity/client')
  const { mapBackfill, toSql } =
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
    logoBright, logoDark, logomarkBright, logomarkDark, backgroundPattern, theme,
    registrationLink, socialLinks
  }
  }`)
  const routable = new Set(
    directory
      .mapBackfill(orgs, docs, verifications)
      .conferences.map((c) => c.id),
  )
  const b = mapBackfill(docs, routable)

  console.log(`conferences ${b.rows.length}, anomalies ${b.anomalies.length}`)
  for (const a of b.anomalies) console.log(`  ${a}`)
  if (args.includes('--dry-run')) return

  const i = args.indexOf('--out')
  const file = join(i >= 0 ? args[i + 1] : '.', 'conference.sql')
  writeFileSync(file, toSql(b.rows))
  console.log(`wrote ${file}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
