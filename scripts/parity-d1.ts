#!/usr/bin/env tsx
/**
 * D1 vs Sanity parity for conferences, run by hand (#1879). The same comparison
 * as the conference Worker's daily sweep (#1986), for an operator who wants
 * the answer now. READ-ONLY on both sides. Prints ids and column names only.
 *
 *   SANITY_API_TOKEN_READ=$(fnox get SANITY_API_TOKEN_READ_PROD) \
 *     pnpm tsx scripts/parity-d1.ts [--env production|preview] [--id <conferenceId>]
 *
 * Exit 0: in_sync. Exit 1: drift. Exit 2: unknown (a read failed or was empty).
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@sanity/client'
import { findDrift, QUERY } from '../services/conference/src/data/parity-core'
import type {
  Row,
  SanityConference,
} from '../services/conference/scripts/backfill'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const env = arg('env') ?? 'production'
const only = arg('id')
const db = env === 'production' ? 'konf-conference' : 'konf-conference-preview'
const dataset = env === 'production' ? 'production' : 'development'

function unknown(reason: string): never {
  console.log(JSON.stringify({ status: 'unknown', reason }))
  process.exit(2)
}

async function main() {
  const token = process.env.SANITY_API_TOKEN_READ
  if (!token) unknown('SANITY_API_TOKEN_READ unset')
  const sql = only
    ? `SELECT * FROM conferences WHERE conference_id = '${only.replace(/'/g, "''")}'`
    : 'SELECT * FROM conferences ORDER BY conference_id'
  let rows: Row[]
  try {
    const out = execFileSync(
      'npx',
      [
        'wrangler',
        'd1',
        'execute',
        db,
        '--env',
        env,
        '--remote',
        '--json',
        '--command',
        sql,
      ],
      {
        cwd: 'services/conference',
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    rows = JSON.parse(out)[0]?.results ?? []
  } catch {
    unknown('d1 read failed')
  }
  if (!rows.length) unknown('d1 returned no rows')
  const docs = await createClient({
    projectId: 'mvzwvw14',
    dataset,
    apiVersion: '2023-05-03',
    useCdn: false,
    token,
  })
    .fetch<SanityConference[]>(QUERY, { ids: rows.map((r) => r.conference_id) })
    .catch(() => unknown('sanity read failed'))
  if (!docs?.length) unknown('sanity returned no documents')
  const drift = findDrift(rows, docs)
  for (const d of drift)
    console.log(
      JSON.stringify({ conferenceId: d.conferenceId, fields: d.fields }),
    )
  console.log(
    JSON.stringify({
      status: drift.length ? 'drift' : 'in_sync',
      checked: rows.length,
    }),
  )
  process.exit(drift.length ? 1 : 0)
}

main()
