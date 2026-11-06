#!/usr/bin/env tsx

/**
 * Sanity -> conference D1 backfill (#1788, epic #1772). READ-ONLY: it reads
 * Sanity and writes one local SQL file. It lives here, not in
 * services/conference/, because services may not import Sanity (eslint,
 * #1800); the mapping itself is services/conference/scripts/backfill.ts.
 * It writes rows only for conferences the tenant-directory backfill routes.
 *
 * Usage (see also docs/DATA_OWNERSHIP.md, "Running the conference backfill"):
 *   pnpm backfill:conference -- --dry-run
 *   pnpm backfill:conference -- --only settings-phase2 [--out <dir>]
 *   pnpm backfill:conference -- --all-columns [--out <dir>]
 *
 * Needs SANITY_API_TOKEN_READ (`fnox exec -- pnpm backfill:conference ...`).
 * Writing requires `--only <phase>` or `--all-columns`. `--all-columns` sets
 * EVERY column on existing rows from Sanity, which reverts D1-owned fields
 * edited by d1_write tenants since the freeze (#2013). Before writing it
 * prints the conference count and the exact ON CONFLICT UPDATE columns.
 *
 * Flow: generate, review the printed columns, apply with
 * `wrangler d1 execute <db> --remote --file <dir>/conference.sql` (this
 * script never applies), run `pnpm tsx scripts/parity-conference.ts --all`,
 * then delete conference.sql: it can hold Slack invite URLs.
 */

import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

const TOKEN_HELP = `SANITY_API_TOKEN_READ is not set. Without it the Sanity client sends
'invalid' and fails with an opaque 401 ("Session not found"). Set it with either:
  fnox exec -- <your command>
  export SANITY_API_TOKEN_READ=$(npx sanity debug --secrets | awk '/Auth token/{print $NF}')`

/** Fails before any Sanity call when the read token is missing. */
export function requireReadToken(
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.SANITY_API_TOKEN_READ) throw new Error(TOKEN_HELP)
}

export const ALL_COLUMNS_WARNING =
  'WARNING: --all-columns overwrites EVERY column of existing rows with the frozen Sanity values, reverting D1-owned fields edited since the freeze (#2013). Prefer --only <phase>.'

/** Parses the CLI. `only` undefined with `dryRun` false means --all-columns. */
export function parseArgs<P extends string, C>(
  args: string[],
  phases: Record<P, readonly C[]>,
) {
  const names = Object.keys(phases).join(' or ')
  const value = (flag: string) => {
    const i = args.indexOf(flag)
    if (i < 0) return undefined
    const v = args[i + 1]
    if (v === undefined || v.startsWith('--'))
      throw new Error(`${flag} needs a value`)
    return v
  }
  const dryRun = args.includes('--dry-run')
  const allColumns = args.includes('--all-columns')
  const phase = value('--only')
  const outDir = value('--out') ?? '.'
  if (phase !== undefined && !Object.hasOwn(phases, phase))
    throw new Error(`unknown --only ${phase}; use ${names}`)
  if (phase !== undefined && allColumns)
    throw new Error('use --only or --all-columns, not both')
  if (phase === undefined && !allColumns && !dryRun)
    throw new Error(
      `pass --only <phase> (${names}) or, to overwrite every column, --all-columns`,
    )
  return {
    dryRun,
    outDir,
    only: phase === undefined ? undefined : phases[phase as P],
    warning: allColumns ? ALL_COLUMNS_WARNING : undefined,
  }
}

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
  const {
    toSql,
    updateColumns,
    SETTINGS_PHASE1_COLUMNS,
    SETTINGS_PHASE2_COLUMNS,
  } = await import('../services/conference/scripts/backfill')
  const opts = parseArgs(process.argv.slice(2), {
    'settings-phase1': SETTINGS_PHASE1_COLUMNS,
    'settings-phase2': SETTINGS_PHASE2_COLUMNS,
  })
  requireReadToken()
  if (opts.warning) console.warn(`\n${opts.warning}\n`)
  const b = await loadBackfill()

  console.log(`conferences ${b.rows.length}, anomalies ${b.anomalies.length}`)
  for (const a of b.anomalies) console.log(`  ${a}`)
  if (opts.dryRun) return

  if (b.rows.length > 0)
    console.log(
      `ON CONFLICT UPDATE columns: ${updateColumns(b.rows[0], opts.only).join(', ')}`,
    )
  mkdirSync(opts.outDir, { recursive: true })
  const file = join(opts.outDir, 'conference.sql')
  writeFileSync(file, toSql(b.rows, { only: opts.only }))
  console.log(
    `wrote ${file} (delete it after applying: may hold Slack invite URLs)`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
