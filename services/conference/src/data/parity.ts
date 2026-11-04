// Daily D1 vs Sanity parity sweep (#1892 phase 3). Alert-only: drift is one
// structured error log line per conference for a Grafana alert to match;
// nothing is repaired (owner decision). Only published D1 rows are checked.
// The one conference file that reads Sanity (eslint.config.js, #1892).
import { createClient } from '@sanity/client'
import {
  mapBackfill,
  type Row,
  type SanityConference,
} from '../../scripts/backfill'
import { diffConference, expected } from '../../scripts/parity'

export interface ScheduledEnv {
  DB: D1Database
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
}

// groq-global: a platform-wide sweep reads every published conference.
const QUERY = `*[_type == "conference" && _id in $ids]{
  _id, "orgId": organization._ref, title, tagline, city, country,
  venueName, venueAddress, startDate, endDate, lifecycleStatus, visibility,
  backgroundPattern, theme, registrationLink, socialLinks
}`

/** Pure: per drifting conference, the fields that differ. */
export function findDrift(d1: Row[], docs: SanityConference[]) {
  const sanity = new Map(
    mapBackfill(docs, new Set(d1.map((r) => r.conference_id))).rows.map((r) => [
      r.conference_id,
      r,
    ]),
  )
  return d1.flatMap((row) => {
    const want = sanity.get(row.conference_id)
    const fields = diffConference(expected(want), expected(row)).map(
      (d) => d.field,
    )
    if (want && want.org_id !== row.org_id) fields.push('orgId')
    return fields.length ? [{ conferenceId: row.conference_id, fields }] : []
  })
}

export async function scheduled(env: ScheduledEnv) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM conferences WHERE published = 1',
  ).all<Row>()
  // A private dataset read without a token returns [], not an error: that
  // would report every row as drift.
  if (!env.SANITY_API_TOKEN_READ) throw new Error('SANITY_API_TOKEN_READ unset')
  const docs = !results.length
    ? []
    : await createClient({
        projectId: env.SANITY_PROJECT_ID,
        dataset: env.SANITY_DATASET,
        apiVersion: '2023-05-03',
        useCdn: false,
        token: env.SANITY_API_TOKEN_READ,
        requestTagPrefix: 'conference.parity',
      }).fetch<SanityConference[]>(QUERY, {
        ids: results.map((r) => r.conference_id),
      })
  if (results.length && !docs.length) {
    console.error(
      JSON.stringify({
        event: 'conference.parity.error',
        reason: 'sanity returned no documents',
      }),
    )
    return
  }
  const drift = findDrift(results, docs)
  for (const d of drift)
    console.error(JSON.stringify({ event: 'conference.parity.drift', ...d }))
  console.log(
    JSON.stringify({
      event: 'conference.parity.sweep',
      checked: results.length,
      drifted: drift.length,
    }),
  )
}
