// Sanity vs GraphQL parity (#1832, epic #1772). Pure: the backfill row and
// the API's `conference` in, a field-by-field diff out.
import type { Row } from './backfill'

export type ApiConference = Record<string, unknown> | null

/** The fields `Query.conference` exposes, in API names. */
export const FIELDS = [
  'id',
  'title',
  'tagline',
  'description',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'visibility',
  'logoBright',
  'logoDark',
  'logomarkBright',
  'logomarkDark',
  'backgroundPattern',
  'primaryColor',
  'accentColor',
  'registrationLink',
  'socialLinks',
  'homepageSections',
] as const

/** What the API should return for this row. Unpublished rows read as null. */
export function expected(row: Row | undefined): ApiConference {
  if (!row || !row.published) return null
  return {
    id: row.conference_id,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    city: row.city,
    country: row.country,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    startDate: row.start_date,
    endDate: row.end_date,
    visibility: row.visibility,
    logoBright: row.logo_bright,
    logoDark: row.logo_dark,
    logomarkBright: row.logomark_bright,
    logomarkDark: row.logomark_dark,
    backgroundPattern: row.background_pattern,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    registrationLink: row.registration_link,
    socialLinks: JSON.parse(row.social_links),
    homepageSections: row.homepage_sections,
  }
}

// Trimmed, and '' / null / undefined are one value. JSON strings compare by
// content, so key order and spacing do not count.
function norm(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return 'null'
    try {
      const j = JSON.parse(t)
      if (j && typeof j === 'object') return canon(j)
    } catch {}
    return JSON.stringify(t)
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
