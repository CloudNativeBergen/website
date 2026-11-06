// Pure parts of the D1 vs Sanity parity (#1986), shared by the Worker sweep
// (parity.ts) and the operator CLI (scripts/parity-d1.ts). No Worker types.
import {
  mapBackfill,
  SETTINGS_PROJECTION,
  type Row,
  type SanityConference,
} from '../../scripts/backfill'

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

/** Pure: per drifting conference, the D1 columns that differ from Sanity. */
export function findDrift(d1: Row[], docs: SanityConference[]) {
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
          (c) => norm(c, want[c]) !== norm(c, row[c]),
        )
    return fields.length ? [{ conferenceId: row.conference_id, fields }] : []
  })
}
