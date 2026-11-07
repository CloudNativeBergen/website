// Pure parts of the D1 vs Sanity parity (#1986), shared by the Worker sweep
// (parity.ts) and the operator CLI (scripts/parity-d1.ts). No Worker types.
import {
  mapBackfill,
  SETTINGS_PHASE2_COLUMNS,
  SETTINGS_PROJECTION,
  type Row,
  type SanityConference,
} from '../../scripts/backfill'

/**
 * The columns still in an open dual-write window: the site writes them to D1
 * and to Sanity (`SETTINGS_PRIVATE` and `SETTINGS_PHASE2` in
 * src/lib/konf-api/conference-write.ts, `published` from lifecycleStatus).
 * Moved fields are D1-only with frozen Sanity copies (#2013), so comparing
 * them would report every legitimate edit as drift. The sweep compares only
 * these (#1917, owner decision 2026-11-07); conference-write.test.ts checks
 * the list against the site's write split. Shrinks as windows close.
 */
export const PARITY_COLUMNS = [
  'org_id',
  'published',
  'travel_support_budget',
  'organizer_address',
  'organizer_org_number',
  'analytics_pirsch_code',
  ...SETTINGS_PHASE2_COLUMNS,
] as const satisfies readonly (keyof Row)[]

// groq-global: a platform-wide sweep reads every published conference.
export const QUERY = `*[_type == "conference" && _id in $ids]{
  _id, "orgId": organization._ref, title, tagline, city, country,
  venueName, venueAddress, startDate, endDate, lifecycleStatus, visibility,
  backgroundPattern, theme, registrationLink, socialLinks,
  ${SETTINGS_PROJECTION}
}`

// The backfill's normalisation: trimmed, '' / null / absent are one value,
// arrays compared as JSON (D1 stores social_links as JSON text).
function norm(col: keyof Row, v: unknown): string {
  if (col === 'social_links')
    return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : (v ?? []))
  if (typeof v === 'string') return JSON.stringify(v.trim() || null)
  return JSON.stringify(v ?? null)
}

/**
 * Pure: per drifting conference, the D1 columns that differ from Sanity.
 * `columns` limits the comparison (the sweep passes PARITY_COLUMNS); without
 * it every column the backfill writes is compared (scripts/parity-d1.ts).
 */
export function findDrift(
  d1: Row[],
  docs: SanityConference[],
  columns?: readonly (keyof Row)[],
) {
  const compared = columns && new Set<keyof Row>(columns)
  const sanity = new Map(
    mapBackfill(docs, new Set(d1.map((r) => r.conference_id))).rows.map((r) => [
      r.conference_id,
      r,
    ]),
  )
  return d1.flatMap((row) => {
    const want = sanity.get(row.conference_id)
    const fields = !want
      ? ['(missing in sanity)']
      : (Object.keys(want) as (keyof Row)[]).filter(
          (c) =>
            (!compared || compared.has(c)) &&
            norm(c, want[c]) !== norm(c, row[c]),
        )
    return fields.length ? [{ conferenceId: row.conference_id, fields }] : []
  })
}
