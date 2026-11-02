#!/usr/bin/env tsx

/**
 * Sanity -> conference D1 backfill (#1788, epic #1772). READ-ONLY: it reads
 * Sanity and writes one local SQL file. It lives here, not in
 * services/conference/, because services may not import Sanity (eslint,
 * #1800); the mapping itself is services/conference/scripts/backfill.ts.
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

  // groq-global: a platform-wide migration reads every tenant by design.
  const docs =
    await clientReadUncached.fetch(`*[_type == "conference" && !(_id in path("drafts.**"))]{
    _id, "orgId": organization._ref, title, tagline, description, city, country,
    venueName, venueAddress, startDate, endDate, visibility,
    logoBright, logoDark, logomarkBright, logomarkDark, backgroundPattern, theme,
    registrationLink, socialLinks, homepageSections
  }`)
  const b = mapBackfill(docs)

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
