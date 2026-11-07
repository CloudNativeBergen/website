// Daily D1 vs Sanity parity sweep (#1892 phase 3, #1879). Reads the D1 table
// directly, so it validates D1 itself, not the gateway (which serves Sanity
// while `d1_override` is off). Alert-only: nothing is repaired (owner
// decision). Only columns still written to both stores (PARITY_COLUMNS,
// #1917) are compared with the row the backfill would write from Sanity
// today, after the backfill's own normalisation; frozen moved fields are not.
// A D1 row Sanity no longer has is always reported.
// Logs carry conference ids and column names, never values.
// The one conference file that reads Sanity (eslint.config.js, #1892).
import { createClient } from '@sanity/client'
import { emit } from '../push'
import type { Row, SanityConference } from '../../scripts/backfill'

export interface ScheduledEnv {
  DB: D1Database
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
  /** wrangler secret put SLACK_CONFERENCE_PARITY_WEBHOOK_URL (optional) */
  SLACK_CONFERENCE_PARITY_WEBHOOK_URL?: string
}

/** Conferences checked per run; more rotate through by day. */
export const MAX_PER_RUN = 50

import { findDrift, PARITY_COLUMNS, QUERY } from './parity-core'
export { findDrift, PARITY_COLUMNS, QUERY }

/** The day's slice of `ids`, wrapping, so every row is seen within n/cap days. */
export function window<T>(ids: T[], now: number, cap = MAX_PER_RUN): T[] {
  if (ids.length <= cap) return ids
  const start = (Math.floor(now / 86_400_000) * cap) % ids.length
  return [...ids, ...ids].slice(start, start + cap)
}

const OWN = new Set([
  'SANITY_API_TOKEN_READ unset',
  'd1 returned no rows',
  'sanity returned no documents',
])

type Drift = ReturnType<typeof findDrift>

async function sweep(env: ScheduledEnv, now: number) {
  // A private dataset read without a token returns [], not an error.
  if (!env.SANITY_API_TOKEN_READ) throw new Error('SANITY_API_TOKEN_READ unset')
  const { results } = await env.DB.prepare(
    // Unpublished rows too: a split cancel must not drop out of the sweep.
    'SELECT * FROM conferences ORDER BY conference_id',
  ).all<Row>()
  if (!results.length) throw new Error('d1 returned no rows')
  const rows = window(results, now)
  const docs = await createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: '2023-05-03',
    useCdn: false,
    token: env.SANITY_API_TOKEN_READ,
    requestTagPrefix: 'conference.parity',
  }).fetch<SanityConference[]>(QUERY, {
    ids: rows.map((r) => r.conference_id),
  })
  if (!docs?.length) throw new Error('sanity returned no documents')
  return {
    rows: rows.length,
    total: results.length,
    drift: findDrift(rows, docs, PARITY_COLUMNS),
  }
}

async function alert(env: ScheduledEnv, text: string) {
  const url = env.SLACK_CONFERENCE_PARITY_WEBHOOK_URL
  if (!url) return
  // An alert failure never fails or hides the sweep result logged before it.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'conference.parity.alert_failed',
        error: e instanceof Error ? e.name : 'unknown',
      }),
    )
  }
}

/** Never throws: a failed read is status "unknown", never "in_sync". */
export async function scheduled(env: ScheduledEnv, now = Date.now()) {
  let result: { rows: number; total: number; drift: Drift }
  try {
    result = await sweep(env, now)
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'conference.parity.error',
        status: 'unknown',
        // Our own messages only; a client's message is not ours to vet.
        reason:
          e instanceof Error && OWN.has(e.message) ? e.message : 'read failed',
      }),
    )
    await alert(env, 'Conference D1 parity: UNKNOWN (read failed, see logs)')
    return
  }
  const { rows, total, drift } = result
  for (const d of drift)
    console.error(JSON.stringify({ event: 'conference.parity.drift', ...d }))
  console.log(
    JSON.stringify({
      event: 'conference.parity.sweep',
      status: drift.length ? 'drift' : 'in_sync',
      checked: rows,
      total,
      drifted: drift.length,
    }),
  )
  if (drift.length)
    emit({
      type: 'parity.drift',
      conferenceIds: drift.map((d) => d.conferenceId),
    })
  if (drift.length)
    await alert(
      env,
      `Conference D1 parity: ${drift.length}/${rows} drifted\n` +
        drift
          .map((d) => `${d.conferenceId}: ${d.fields.join(', ')}`)
          .join('\n'),
    )
}
