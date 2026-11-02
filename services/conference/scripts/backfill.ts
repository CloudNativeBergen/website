// Sanity -> conference D1 backfill (#1788). Pure: documents in, rows and SQL
// out. The Sanity read lives in scripts/backfill-conference.ts at the repo
// root, because services may not import Sanity (eslint, #1800). Ids are the
// Sanity `_id`s, the same ones the tenant-directory backfill writes.

export interface SanityConference {
  _id: string
  orgId?: string | null
  title?: string | null
  tagline?: string | null
  city?: string | null
  country?: string | null
  venueName?: string | null
  venueAddress?: string | null
  startDate?: string | null
  endDate?: string | null
  lifecycleStatus?: string | null
  visibility?: string | null
  logoBright?: string | null
  logoDark?: string | null
  logomarkBright?: string | null
  logomarkDark?: string | null
  backgroundPattern?: string | null
  theme?: { primaryColor?: string | null; accentColor?: string | null } | null
  registrationLink?: string | null
  socialLinks?: string[] | null
}

export interface Row {
  conference_id: string
  org_id: string
  published: 0 | 1
  title: string
  tagline: string | null
  city: string | null
  country: string | null
  venue_name: string | null
  venue_address: string | null
  start_date: string | null
  end_date: string | null
  visibility: 'live' | 'unlisted'
  logo_bright: string | null
  logo_dark: string | null
  logomark_bright: string | null
  logomark_dark: string | null
  background_pattern: string | null
  primary_color: string | null
  accent_color: string | null
  registration_link: string | null
  social_links: string
}

const s = (v: string | null | undefined) => v?.trim() || null

/**
 * Drafts are never passed in. `routable` is the set of conference ids the
 * tenant-directory backfill writes: a row for any other id could never be
 * reached, so it is skipped.
 */
export function mapBackfill(
  docs: SanityConference[],
  routable: ReadonlySet<string>,
) {
  const rows: Row[] = []
  const anomalies: string[] = []
  for (const c of [...docs].sort((a, b) => a._id.localeCompare(b._id))) {
    if (!c.orgId || !routable.has(c._id)) {
      anomalies.push(`conference ${c._id}: not in tenant-directory; skipped`)
      continue
    }
    rows.push({
      conference_id: c._id,
      org_id: c.orgId,
      // Cancelled and archived editions are not public; unlisted ones are.
      published: ['cancelled', 'archived'].includes(c.lifecycleStatus ?? '')
        ? 0
        : 1,
      title: s(c.title) ?? c._id,
      tagline: s(c.tagline),
      city: s(c.city),
      country: s(c.country),
      venue_name: s(c.venueName),
      venue_address: s(c.venueAddress),
      start_date: s(c.startDate),
      end_date: s(c.endDate),
      // Absent means live (src/lib/conference/contract.ts).
      visibility: c.visibility === 'unlisted' ? 'unlisted' : 'live',
      logo_bright: s(c.logoBright),
      logo_dark: s(c.logoDark),
      logomark_bright: s(c.logomarkBright),
      logomark_dark: s(c.logomarkDark),
      background_pattern: s(c.backgroundPattern),
      primary_color: s(c.theme?.primaryColor),
      accent_color: s(c.theme?.accentColor),
      registration_link: s(c.registrationLink),
      social_links: JSON.stringify(c.socialLinks ?? []),
    })
    if (!c.title?.trim()) anomalies.push(`conference ${c._id}: no title`)
  }
  return { rows, anomalies }
}

const q = (v: string | number | null) =>
  v === null
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${v.replace(/'/g, "''")}'`

/** Idempotent upserts. A rerun never moves a row to another org. */
export function toSql(rows: Row[]): string {
  return rows
    .map((r) => {
      const cols = Object.keys(r) as (keyof Row)[]
      const set = cols
        .filter((c) => c !== 'conference_id' && c !== 'org_id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ')
      return `INSERT INTO conferences (${cols.join(', ')}) VALUES (${cols.map((c) => q(r[c])).join(', ')}) ON CONFLICT (conference_id) DO UPDATE SET ${set} WHERE conferences.org_id = excluded.org_id;`
    })
    .join('\n')
    .concat('\n')
}
