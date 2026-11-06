// Sanity vs GraphQL parity (#1832, epic #1772). Pure: the backfill row and
// the API's `conference` in, a field-by-field diff out.
import type { Row } from './backfill'

export type ApiConference = Record<string, unknown> | null

/**
 * The structured fields services/conference owns, in API names. Editorial
 * fields (description, homepage blocks) stay in services/content and are not
 * part of the D1 parity.
 */
export const FIELDS = [
  'id',
  'title',
  'tagline',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'visibility',
  'backgroundPattern',
  'primaryColor',
  'accentColor',
  'registrationLink',
  'socialLinks',
  // Settings phase 1 (#2019), the public ones. organizerAddress,
  // organizerOrgNumber, analyticsPirschCode and travelSupportBudget are org
  // members only, so an anonymous read is always null: their parity is the
  // D1 sweep (scripts/parity-d1.ts, src/data/parity-core.ts), which compares
  // every column.
  'cfpStartDate',
  'cfpEndDate',
  'cfpNotifyDate',
  'programDate',
  'travelSupportPaymentDate',
  'earlyBirdEndDate',
  'registrationCloseDate',
  'speakersAnnouncedDate',
  'sponsorDeadlineDate',
  'recordingsLiveDate',
  'registrationEnabled',
  'organizer',
  'socialHashtag',
  'showVanityMetrics',
  // Settings phase 2 (#2038), the public ones; the members-only eight are
  // covered by the D1 sweep, as above.
  'contactEmail',
  'cfpEmail',
  'sponsorEmail',
] as const

const bool = (v: 0 | 1 | null) => (v === null ? null : v === 1)

/** What the API should return for this row. Unpublished rows read as null. */
export function expected(row: Row | undefined): ApiConference {
  if (!row || !row.published) return null
  return {
    id: row.conference_id,
    title: row.title,
    tagline: row.tagline,
    city: row.city,
    country: row.country,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    startDate: row.start_date,
    endDate: row.end_date,
    visibility: row.visibility,
    backgroundPattern: row.background_pattern,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    registrationLink: row.registration_link,
    socialLinks: JSON.parse(row.social_links),
    cfpStartDate: row.cfp_start_date,
    cfpEndDate: row.cfp_end_date,
    cfpNotifyDate: row.cfp_notify_date,
    programDate: row.program_date,
    travelSupportPaymentDate: row.travel_support_payment_date,
    earlyBirdEndDate: row.early_bird_end_date,
    registrationCloseDate: row.registration_close_date,
    speakersAnnouncedDate: row.speakers_announced_date,
    sponsorDeadlineDate: row.sponsor_deadline_date,
    recordingsLiveDate: row.recordings_live_date,
    registrationEnabled: bool(row.registration_enabled),
    organizer: row.organizer_name,
    socialHashtag: row.social_hashtag,
    showVanityMetrics: bool(row.show_vanity_metrics),
    contactEmail: row.contact_email,
    cfpEmail: row.cfp_email,
    sponsorEmail: row.sponsor_email,
  }
}

// Trimmed, and '' / null / undefined are one value.
function norm(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') {
    const t = v.trim()
    return t ? JSON.stringify(t) : 'null'
  }
  return canon(v)
}

function canon(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : typeof x === 'string'
        ? x.trim()
        : x,
  )
}

export interface Difference {
  field: string
  sanity: string
  api: string
}

export function diffConference(
  want: ApiConference,
  got: ApiConference,
): Difference[] {
  if (!want || !got)
    return !want && !got
      ? []
      : [
          {
            field: '(conference)',
            sanity: want ? 'present' : 'null',
            api: got ? 'present' : 'null',
          },
        ]
  return FIELDS.flatMap((field) => {
    const sanity = norm(want[field])
    const api = norm(got[field])
    return sanity === api ? [] : [{ field, sanity, api }]
  })
}

const KIND_RANK = { 'platform-edition': 0, 'platform-alias': 1, custom: 2 }

/**
 * `--all`: one host per routable conference. The platform-edition host wins,
 * but a conference that lost it to a collision is still checked through its
 * alias or a verified custom domain instead of being skipped.
 */
export function pickHosts<
  D extends {
    conferenceId: string
    kind: keyof typeof KIND_RANK
    verification: string
  },
>(domains: D[]): D[] {
  const best = new Map<string, D>()
  for (const d of domains) {
    if (d.kind === 'custom' && d.verification !== 'verified') continue
    const cur = best.get(d.conferenceId)
    if (!cur || KIND_RANK[d.kind] < KIND_RANK[cur.kind])
      best.set(d.conferenceId, d)
  }
  return [...best.values()]
}
