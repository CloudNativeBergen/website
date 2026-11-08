import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag, domainTag } from '@/lib/cache/tags'
import { konfApiHeaders, konfApiUrl } from '@/lib/konf-api/client'
import { CONFERENCE_CACHE_LIFE } from './cache-life'
import { normalizeDomain } from './domains'
import type { Conference } from './types'
import { graphql, type ResultOf } from '@/lib/konf-api/graphql'

// Spike for #1772 (#1833): read core conference fields from the Konf GraphQL
// gateway. The gateway resolves the tenant from the signed site assertion
// (else Origin); anonymous is enough for public fields.
const TIMEOUT_MS = 2000

/**
 * Settings phase 1 (#2019) dates. Several gate things (CFP open, registration,
 * early bird), so only a real `YYYY-MM-DD` date from D1 is merged; null or
 * anything else keeps Sanity's. The four members-only settings
 * (organizerAddress, organizerOrgNumber, analyticsPirschCode,
 * travelSupportBudget) are not read here: this read is cached across
 * visitors and the site lane is not an org member, so they read as null.
 */
const SETTINGS_DATES = [
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
] as const
const DATE_KEYS = new Set<string>(SETTINGS_DATES)
const BOOL_KEYS = new Set(['registrationEnabled'])
const isDay = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)

// Literal (not built from SETTINGS_DATES) so gql.tada can type it; the
// settings dates are listed in the same order.
const QUERY = `{ conference {
  id title tagline description city country venueName venueAddress startDate endDate
  visibility logoBright logoDark logomarkBright logomarkDark backgroundPattern
  primaryColor accentColor registrationLink socialLinks homepageSections
  cfpStartDate cfpEndDate cfpNotifyDate programDate travelSupportPaymentDate
  earlyBirdEndDate registrationCloseDate speakersAnnouncedDate sponsorDeadlineDate
  recordingsLiveDate registrationEnabled organizer socialHashtag showVanityMetrics
  ticketingProvider contactEmail cfpEmail sponsorEmail volunteerRegistrationLink
} conferenceLifecycle }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const QUERY_DOC = graphql(QUERY)
type QueryData = ResultOf<typeof QUERY_DOC>

/**
 * Settings phase 3 (#2080), the members-only ticket setup. Never part of
 * QUERY: the subgraph serves these only to an org member or to the site's
 * server lane (`site:server`, minted by the gateway for a verified site
 * assertion alone), so this read only ever runs server-side with the signed
 * assertion, as its own request and its own cache entry.
 */
const PRIVATE_QUERY = `{ conference {
  id checkinCustomerId ticketCapacity
  ticketTargetsEnabled ticketSalesStartDate ticketTargetCurve
  ticketTargetMilestones { date targetPercentage label }
  workshopReminderLastSentAt workshopReminderLastSentCount workshopReminderReservedAt
  sponsorRegistrationLink speakerRegistrationLink salesNotificationChannel
  cfpNotificationChannel speakerSlackChannel speakerSlackInviteUrl
  volunteerSlackInviteUrl
} }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const PRIVATE_DOC = graphql(PRIVATE_QUERY)
export type PrivateConference = NonNullable<
  ResultOf<typeof PRIVATE_DOC>['conference']
>

// A real day (Date.parse rolls 02-30 over to March) with a time.
const isInstant = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) &&
  isDay(v.slice(0, 10)) &&
  !Number.isNaN(Date.parse(v))
const isPosInt = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0
/**
 * Phase 3 public fields read from D1 (#2080). Only the vendor: the other
 * public ones (free tickets, workshop windows, early-access types) are
 * written D1 first and then by a `_rev`-conditioned Sanity patch that can
 * fail, so D1 could run ahead of what was saved; they stay on Sanity.
 */
const PHASE3_CHECKS: Record<string, (v: unknown) => boolean> = {
  ticketingProvider: (v) => v === 'checkin' || v === 'tito',
}

// Settings phase 2 (#2038). The subgraph validates on write; these only keep
// a malformed value from replacing Sanity's.
const isEmail = (v: unknown) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const isHttps = (v: unknown) =>
  typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v)
const isUrl = (v: unknown) =>
  typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v)
const isChannel = (v: unknown) =>
  typeof v === 'string' && /^#?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)
/** Phase 2 public fields, in QUERY. */
const PHASE2_PUBLIC_CHECKS: Record<string, (v: unknown) => boolean> = {
  contactEmail: isEmail,
  cfpEmail: isEmail,
  sponsorEmail: isEmail,
  volunteerRegistrationLink: isHttps,
}
/**
 * Phase 2 members-only fields, in PRIVATE_QUERY only. Every one of them is
 * also stripped from a public conference object (`getConferenceForDomain`).
 */
export const PHASE2_PRIVATE_CHECKS = {
  sponsorRegistrationLink: isUrl,
  speakerRegistrationLink: isHttps,
  salesNotificationChannel: isChannel,
  cfpNotificationChannel: isChannel,
  speakerSlackChannel: isChannel,
  speakerSlackInviteUrl: isHttps,
  volunteerSlackInviteUrl: isHttps,
} as const satisfies Record<string, (v: unknown) => boolean>
export type Phase2PrivateField = keyof typeof PHASE2_PRIVATE_CHECKS
export const PHASE2_PRIVATE_FIELDS = Object.keys(
  PHASE2_PRIVATE_CHECKS,
) as Phase2PrivateField[]

type ApiConference = Partial<
  Omit<NonNullable<QueryData['conference']>, 'homepageSections'>
> & {
  /** A JSON string from the API, an array once fetchKonfApiConference returns. */
  homepageSections?: string | unknown[] | null
  /** tenant-directory's lifecycle (#1997); see mergeKonfApiConference. */
  conferenceLifecycle?: string | null
}

/** Per-conference rollout flags (#1925), as the gateway's `rolloutFlags`. */
export type RolloutFlags = {
  apiRead: boolean
  identityLogin: boolean
  d1Write: boolean
}
const OFF: RolloutFlags = {
  apiRead: false,
  identityLogin: false,
  d1Write: false,
}
const FLAGS_QUERY =
  '{ rolloutFlags { apiRead identityLogin d1Write } }' as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const FLAGS_DOC = graphql(FLAGS_QUERY)
// Every uncached render waits on this read, so keep it short (#1939).
const FLAGS_TIMEOUT_MS = 500
// Short, so a flag flipped in D1 lands within minutes.
const FLAGS_CACHE_LIFE = { stale: 60, revalidate: 300, expire: 3600 } as const

/**
 * Maximum age of a flags read, measured from when the gateway answered (#1938).
 * Applies to the remote cache entry (served stale for up to an hour if
 * revalidation keeps failing) and to the in-memory last good value. 10 minutes
 * is two revalidate windows of FLAGS_CACHE_LIFE: a healthy entry is at most
 * 5 minutes old, plus the stale-while-revalidate hit that triggers its
 * refresh. Older than that gives `unverified`.
 */
const LAST_GOOD_MS = 10 * 60_000
const LAST_GOOD_MAX = 500
const lastGood = new Map<string, { flags: RolloutFlags; at: number }>()

/** Flags from a failed read with no recent good value: d1Write is unknown. */
export type MaybeUnverified = RolloutFlags & { unverified?: true }

/**
 * The tenant's rollout flags from tenant-directory, through the gateway.
 * The gateway answers only the signed site lane and only for the asserted
 * host, so there is no tenant argument. Throws on failure (not cached).
 */
export async function fetchRolloutFlags(
  host: string,
): Promise<{ flags: RolloutFlags; at: number }> {
  'use cache: remote'
  cacheLife(FLAGS_CACHE_LIFE)
  cacheTag(domainTag(host))
  return readRolloutFlags(host)
}

/** One uncached gateway read of the flags; fetchRolloutFlags caches it. */
async function readRolloutFlags(
  host: string,
): Promise<{ flags: RolloutFlags; at: number }> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const res = await fetch(url, {
    method: 'POST',
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: FLAGS_QUERY }),
    signal: AbortSignal.timeout(FLAGS_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: ResultOf<typeof FLAGS_DOC>
    errors?: unknown[]
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  const f = json.data?.rolloutFlags
  // Null is a valid "off", but with a signing key it usually means a
  // misconfigured key or a host missing from the directory.
  if (!f) console.warn(`[konf-api] no rollout flags for ${host}`)
  return {
    flags: {
      apiRead: f?.apiRead === true,
      identityLogin: f?.identityLogin === true,
      d1Write: f?.d1Write === true,
    },
    // When the gateway answered, cached with the flags: a cache hit is not a read.
    at: Date.now(),
  }
}

/**
 * Flags for this host's conference. `KONF_API_DISABLED=1` turns everything
 * off. With `verify` (D1 writes only), a cached entry older than LAST_GOOD_MS
 * is replaced by one direct, uncached read. Without it, a stale entry is
 * returned at once, marked `unverified`, so page renders never block on it.
 * A read failure uses the host's last good flags if under LAST_GOOD_MS old;
 * else all off, marked `unverified` so a D1 write can refuse.
 */
export async function rolloutFlags(
  host: string | null,
  conference: Pick<Conference, '_id' | 'organization'>,
  { verify = false }: { verify?: boolean } = {},
): Promise<MaybeUnverified> {
  if (process.env.KONF_API_DISABLED === '1') return OFF
  // No gateway on this environment (#1926): nothing to read, all off.
  if (konfApiUrl() === null) return OFF
  // Gateway set but unreadable (no host or signing key) is a misconfiguration:
  // refuse moved-field saves rather than fall to Sanity-only (#1938).
  if (!host || !process.env.KONF_SITE_SIGNING_KEY)
    return { ...OFF, unverified: true }
  // One cache entry per tenant, whatever port or case the Host header had.
  host = normalizeDomain(host)
  try {
    let read = await fetchRolloutFlags(host)
    // A stale cache hit (quiet tenant, revalidating in the background) is
    // not an outage: read the gateway directly once. Its failure falls to
    // the last good value below.
    const stale = Date.now() - read.at >= LAST_GOOD_MS
    if (stale && verify) read = await readRolloutFlags(host)
    else if (stale) return { ...read.flags, unverified: true }
    const prev = lastGood.get(host)
    if (!prev || read.at >= prev.at) {
      lastGood.delete(host) // re-insert at the end: oldest first
      lastGood.set(host, read)
      if (lastGood.size > LAST_GOOD_MAX)
        lastGood.delete(lastGood.keys().next().value!)
    }
    return read.flags
  } catch (err) {
    const good = lastGood.get(host)
    const fresh = good && Date.now() - good.at < LAST_GOOD_MS
    console.warn(
      `[konf-api] rollout flags unavailable for ${conference._id}` +
        (fresh ? ', using last good' : ', none recent') +
        `: ${(err as Error).message}`,
    )
    return fresh ? good.flags : { ...OFF, unverified: true }
  }
}

/**
 * Cached on the same model and tags as the Sanity conference read
 * (`fetchConferenceData`), so one revalidation reaches both. Throws on any
 * failure: a `'use cache'` body that throws is not stored, so a fallback
 * never sticks.
 */
export async function fetchKonfApiConference(
  host: string,
  conferenceId: string,
): Promise<ApiConference> {
  'use cache: remote'
  cacheLife(CONFERENCE_CACHE_LIFE)
  cacheTag('content:conferences')
  cacheTag(domainTag(host))
  cacheTag(conferenceTag(conferenceId))
  try {
    return await readKonfApiConference(host, conferenceId)
  } catch (err) {
    // A production build redacts an error thrown out of a `'use cache'` body
    // to "An error occurred in the Server Components render", so the caller's
    // log cannot say why. Log the real cause here, server-side only.
    const e = err as Error
    console.warn(`[konf-api] read failed for ${host}: ${e.name}: ${e.message}`)
    throw err
  }
}

async function readKonfApiConference(
  host: string,
  conferenceId: string,
): Promise<ApiConference> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const res = await fetch(url, {
    method: 'POST',
    // Cached across visitors, so no client IP (see konfApiHeaders).
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: QUERY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: QueryData
    errors?: unknown[]
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  const lifecycle = json.data?.conferenceLifecycle ?? null
  // `conference` is null to the public for a cancelled or archived edition;
  // the lifecycle alone still overrides the homepage (#1997). Both come from
  // the same host-derived envelope, so the id is the one asked for.
  if (
    !json.data?.conference &&
    (lifecycle === 'cancelled' || lifecycle === 'archived')
  )
    return { id: conferenceId, conferenceLifecycle: lifecycle }
  const api: ApiConference | null | undefined = json.data?.conference
  if (!api) throw new Error('conference is null')
  if (lifecycle) api.conferenceLifecycle = lifecycle
  // Thrown inside the cached body so a wrong-tenant answer is never stored.
  if (api.id !== conferenceId) {
    throw new Error(`conference id mismatch: ${String(api.id)}`)
  }
  // Parsed here too, so malformed section JSON is never stored.
  if (typeof api.homepageSections === 'string') {
    const sections: unknown = JSON.parse(api.homepageSections)
    if (!Array.isArray(sections))
      throw new Error('homepageSections is not an array')
    api.homepageSections = sections
  }
  return api
}

/**
 * Merge the API's fields over the Sanity conference. Returns the Sanity
 * conference untouched on any error, timeout or null.
 *
 * The lifecycle (#1997) maps onto Sanity's `lifecycleStatus` override:
 * `cancelled` and `archived` set it, `live` clears it, and null (a draft, to
 * a non-member) or an unknown value keeps Sanity's.
 */
export async function mergeKonfApiConference(
  host: string,
  conference: Conference,
): Promise<Conference> {
  try {
    const api = await fetchKonfApiConference(host, conference._id)
    const {
      id,
      primaryColor,
      accentColor,
      homepageSections,
      conferenceLifecycle: lc,
      showVanityMetrics,
      ...rest
    } = api
    // Legacy rows fall back to the id for a blank title; keep Sanity's then.
    if (rest.title === id) delete rest.title
    const merged = { ...conference } as Record<string, unknown>
    for (const [k, v] of Object.entries(rest)) {
      if (v == null) continue
      // Conservative for gates: a bad D1 value keeps Sanity's, never opens.
      if (DATE_KEYS.has(k) && !isDay(v)) continue
      if (BOOL_KEYS.has(k) && typeof v !== 'boolean') continue
      if (k in PHASE3_CHECKS && !PHASE3_CHECKS[k](v)) continue
      if (k in PHASE2_PUBLIC_CHECKS && !PHASE2_PUBLIC_CHECKS[k](v)) continue
      merged[k] = v
    }
    if (typeof showVanityMetrics === 'boolean')
      merged.ticketCustomization = {
        ...conference.ticketCustomization,
        showVanityMetrics,
      }
    if (lc === 'cancelled' || lc === 'archived') merged.lifecycleStatus = lc
    else if (lc === 'live') delete merged.lifecycleStatus
    if (primaryColor != null || accentColor != null) {
      merged.theme = {
        ...conference.theme,
        ...(primaryColor != null && { primaryColor }),
        ...(accentColor != null && { accentColor }),
      }
    }
    // `[]` means no value: keep Sanity's composition, hidden flags and all.
    if (Array.isArray(homepageSections) && homepageSections.length > 0)
      merged.homepageSections = homepageSections
    return merged as unknown as Conference
  } catch (err) {
    console.warn(
      `[konf-api] falling back to Sanity for ${host}:`,
      (err as Error).message,
    )
    return conference
  }
}

/**
 * The members-only read (#2080), cached server-side on the same tags as the
 * public read. Throws on any failure, so a fallback is never stored.
 */
export async function fetchKonfApiPrivate(
  host: string,
  conferenceId: string,
): Promise<PrivateConference> {
  'use cache: remote'
  cacheLife(CONFERENCE_CACHE_LIFE)
  cacheTag('content:conferences')
  cacheTag(domainTag(host))
  cacheTag(conferenceTag(conferenceId))
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  // Without the site assertion the lane is anonymous and every field is null.
  if (!process.env.KONF_SITE_SIGNING_KEY)
    throw new Error('KONF_SITE_SIGNING_KEY is not set')
  const res = await fetch(url, {
    method: 'POST',
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: PRIVATE_QUERY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: ResultOf<typeof PRIVATE_DOC>
    errors?: unknown[]
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  const c = json.data?.conference
  if (!c) throw new Error('conference is null')
  if (c.id !== conferenceId) throw new Error(`conference id mismatch: ${c.id}`)
  return c
}

const isDayOrNull = (v: unknown) => v == null || isDay(v)
const CURVES = new Set(['linear', 'early_push', 'late_push', 's_curve'])

/**
 * The members-only fields of the conference document (Sanity names). Never in
 * a conference object handed to a public page: `getConferenceForDomain`
 * strips them unless `includeTicketSetup`, and `mergeTicketSetup` adds the D1
 * ones only on that server-side path (#2080).
 */
export const TICKET_SETUP_FIELDS = [
  'checkinCustomerId',
  'checkinEventId',
  'titoAccountSlug',
  'titoEventSlug',
  'ticketCapacity',
  'ticketTargets',
  'ticketTypeRoles',
  'workshopReminderLastSentAt',
  'workshopReminderLastSentCount',
  'workshopReminderReservedAt',
] as const

/**
 * The members-only ticket setup from D1 over `conference`, for server-side
 * readers only. D1 is read for checkinCustomerId, ticketCapacity,
 * ticketTargets and the reminder state; the binding and ticketTypeRoles stay
 * on Sanity (their writers serialise on Sanity's `_rev`). Each field is taken
 * only when D1 holds a valid value; null, a bad value or any failure keeps
 * Sanity's, which is still written for every one of them.
 */
export async function mergeTicketSetup<T extends { _id: string }>(
  host: string,
  conference: T,
  { settingsOnly = false }: { settingsOnly?: boolean } = {},
): Promise<T> {
  let p: PrivateConference
  try {
    p = await fetchKonfApiPrivate(host, conference._id)
  } catch (err) {
    console.warn(
      `[konf-api] members-only fields fall back to Sanity for ${host}:`,
      (err as Error).message,
    )
    return conference
  }
  const merged = { ...conference } as Record<string, unknown>
  // Phase 2 members-only settings (#2038). With `settingsOnly` (a narrow
  // projection that is not stripped afterwards) only the keys the caller
  // projected are replaced, so no other members-only field is added.
  for (const k of PHASE2_PRIVATE_FIELDS)
    if ((!settingsOnly || k in merged) && PHASE2_PRIVATE_CHECKS[k](p[k]))
      merged[k] = p[k]
  if (settingsOnly) return merged as T
  for (const k of ['checkinCustomerId', 'ticketCapacity'] as const)
    if (isPosInt(p[k])) merged[k] = p[k]
  for (const k of [
    'workshopReminderLastSentAt',
    'workshopReminderReservedAt',
  ] as const)
    if (isInstant(p[k])) merged[k] = p[k]
  if (isPosInt(p.workshopReminderLastSentCount))
    merged.workshopReminderLastSentCount = p.workshopReminderLastSentCount

  // ticketTargets is one object in Sanity and four columns in D1. Any valid
  // D1 part means D1 holds the object (a save writes all four), so it is
  // taken whole; one bad part keeps Sanity's whole object.
  const {
    ticketTargetsEnabled: enabled,
    ticketSalesStartDate: start,
    ticketTargetCurve: curve,
    ticketTargetMilestones: ms,
  } = p
  const valid =
    (enabled == null || typeof enabled === 'boolean') &&
    isDayOrNull(start) &&
    (curve == null || CURVES.has(curve)) &&
    (ms == null ||
      (Array.isArray(ms) &&
        ms.every(
          (m) => isDay(m.date) && typeof m.targetPercentage === 'number',
        )))
  if (valid && [enabled, start, curve, ms].some((v) => v != null))
    merged.ticketTargets = {
      enabled: enabled ?? false,
      ...(start != null && { salesStartDate: start }),
      ...(curve != null && { targetCurve: curve }),
      milestones: (ms ?? []).map((m) => ({
        date: m.date,
        targetPercentage: m.targetPercentage,
        label: m.label ?? '',
      })),
    }
  return merged as T
}
