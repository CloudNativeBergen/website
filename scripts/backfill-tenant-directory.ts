#!/usr/bin/env tsx

/**
 * Sanity -> tenant-directory D1 backfill (#1825, epic #1772). READ-ONLY: it
 * reads Sanity and writes two local SQL files. It lives here, not in
 * services/tenant-directory/, because services may not import Sanity
 * (eslint, #1800); the mapping itself is services/tenant-directory/scripts/backfill.ts.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-tenant-directory.ts --dry-run
 *   pnpm tsx scripts/backfill-tenant-directory.ts [--out <dir>]
 *
 * Writes <dir>/tenant-directory.sql and <dir>/identity.sql (default: .).
 * Apply them with `wrangler d1 execute --file`; this script never does.
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
    await import('../services/tenant-directory/scripts/backfill')

  // groq-global: a platform-wide migration reads every tenant by design.
  const { orgs, confs, verifications } = await clientReadUncached.fetch(`{
    "orgs": *[_type == "organization" && !(_id in path("drafts.**"))]{ _id, name, "slug": slug.current, plan },
    "confs": *[_type == "conference" && !(_id in path("drafts.**"))]{ _id, title, "orgId": organization._ref, startDate, lifecycleStatus, domains },
    "verifications": *[_type == "domainVerification" && !(_id in path("drafts.**"))]{ hostname, "conferenceId": conference._ref, status }
  }`)
  const b = mapBackfill(orgs, confs, verifications)

  console.log(
    `orgs ${b.orgs.length}, conferences ${b.conferences.length}, domains ${b.domains.length}, anomalies ${b.anomalies.length}`,
  )
  for (const a of b.anomalies) console.log(`  ${a}`)
  if (args.includes('--dry-run')) return

  const i = args.indexOf('--out')
  const dir = i >= 0 ? args[i + 1] : '.'
  const sql = toSql(b)
  writeFileSync(join(dir, 'tenant-directory.sql'), sql.directory)
  writeFileSync(join(dir, 'identity.sql'), sql.identity)
  console.log(
    `wrote ${join(dir, 'tenant-directory.sql')} and ${join(dir, 'identity.sql')}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
