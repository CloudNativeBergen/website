// Pure parts of the D1 vs Sanity parity (#1986), shared by the Worker sweep
// (parity.ts) and the operator CLI (scripts/parity-d1.ts). No Worker types.
import {
  mapBackfill,
  SETTINGS_PHASE2_COLUMNS,
  SETTINGS_PHASE3_COLUMNS,
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
const PHASE3_D1_ONLY = new Set<string>([
  'ticketing_provider',
  'checkin_customer_id',
  'ticket_capacity',
  'ticket_targets_enabled',
  'ticket_sales_start_date',
  'ticket_target_curve',
  'ticket_target_milestones',
])

export const PARITY_COLUMNS = [
  'org_id',
  'published',
  'travel_support_budget',
  'organizer_address',
  'organizer_org_number',
  'analytics_pirsch_code',
  ...SETTINGS_PHASE2_COLUMNS,
  // Phase 3 (#2080) still dual-written. Left out: the reminder state (a
  // d1_write tenant's reminder writes D1 only, everyone else's Sanity only)
  // and the four whose Sanity write stopped (PHASE3_WRITE_STOPPED in
  // conference-write.ts). The CLI (scripts/parity-d1.ts) still compares all.
  ...SETTINGS_PHASE3_COLUMNS.filter(
    (c) => !c.startsWith('workshop_reminder_') && !PHASE3_D1_ONLY.has(c),
  ),
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
// The phase 3 lists are compared as sets: order carries no meaning for ids,
// type names or dated milestones. ticket_type_roles keeps its order, because
// the first entry for a type name is the one classifyTicket reads.
const SETS: Partial<Record<keyof Row, (a: never, b: never) => number>> = {
  public_free_ticket_ids: (a: number, b: number) => a - b,
  workshop_early_access_ticket_types: (a: string, b: string) =>
    a.localeCompare(b),
  ticket_target_milestones: (a: object, b: object) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
}
const LISTS = new Set<keyof Row>([
  'ticket_type_roles',
  ...(Object.keys(SETS) as (keyof Row)[]),
])
function norm(col: keyof Row, v: unknown): string {
  if (col === 'social_links')
    return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : (v ?? []))
  if (LISTS.has(col)) {
    const list = (typeof v === 'string' ? JSON.parse(v) : (v ?? [])) as never[]
    const by = SETS[col]
    return JSON.stringify(
      by
        ? [...new Set(list.map((x) => JSON.stringify(x)))]
            .map((x) => JSON.parse(x) as never)
            .sort(by)
        : list,
    )
  }
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
