import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag, domainTag } from '@/lib/cache/tags'
import { konfApiHeaders } from '@/lib/konf-api/client'
import { CONFERENCE_CACHE_LIFE } from './cache-life'
import { normalizeDomain } from './domains'
import type { Conference } from './types'

// Spike for #1772 (#1833): read core conference fields from the Konf GraphQL
// gateway. The gateway resolves the tenant from the signed site assertion
// (else Origin); anonymous is enough for public fields.
const KONF_API_URL = 'https://api.konf.app/graphql'
const TIMEOUT_MS = 2000

const QUERY = `{ conference {
  id title tagline description city country venueName venueAddress startDate endDate
  visibility logoBright logoDark logomarkBright logomarkDark backgroundPattern
  primaryColor accentColor registrationLink socialLinks homepageSections
} }`

type ApiConference = Record<string, unknown> & {
  primaryColor?: string | null
  accentColor?: string | null
  /** A JSON string from the API, an array once fetchKonfApiConference returns. */
  homepageSections?: string | unknown[] | null
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
const FLAGS_QUERY = '{ rolloutFlags { apiRead identityLogin d1Write } }'
// Short, so a flag flipped in D1 lands within minutes.
const FLAGS_CACHE_LIFE = { stale: 60, revalidate: 300, expire: 3600 } as const

/**
 * Transition (#1925): the old comma-separated env lists, OR'ed with the D1
 * flags until those are backfilled. Remove with the lists (docs/PLATFORM.md).
 */
function listed(name: string, conferenceId: string, orgId?: string): boolean {
  const ids = (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.includes(conferenceId) || (!!orgId && ids.includes(orgId))
}

/**
 * The tenant's rollout flags from tenant-directory, through the gateway.
 * The gateway answers only the signed site lane and only for the asserted
 * host, so there is no tenant argument. Throws on failure (not cached).
 */
export async function fetchRolloutFlags(host: string): Promise<RolloutFlags> {
  'use cache: remote'
  cacheLife(FLAGS_CACHE_LIFE)
  cacheTag(domainTag(host))
  const res = await fetch(KONF_API_URL, {
    method: 'POST',
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: FLAGS_QUERY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { rolloutFlags?: Partial<RolloutFlags> | null }
    errors?: unknown[]
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  const f = json.data?.rolloutFlags
  // Null is a valid "off", but with a signing key it usually means a
  // misconfigured key or a host missing from the directory.
  if (!f) console.warn(`[konf-api] no rollout flags for ${host}`)
  return {
    apiRead: f?.apiRead === true,
    identityLogin: f?.identityLogin === true,
    d1Write: f?.d1Write === true,
  }
}

/**
 * Flags for this host's conference. `KONF_API_DISABLED=1` turns everything
 * off. Any read failure leaves only the env lists: the Sanity path, as before.
 */
export async function rolloutFlags(
  host: string | null,
  conference: Pick<Conference, '_id' | 'organization'>,
): Promise<RolloutFlags> {
  if (process.env.KONF_API_DISABLED === '1') return OFF
  const org = conference.organization?._ref
  const env: RolloutFlags = {
    apiRead: listed('KONF_API_TENANTS', conference._id, org),
    identityLogin: listed('KONF_IDENTITY_TENANTS', conference._id, org),
    d1Write: listed('KONF_D1_WRITE_TENANTS', conference._id),
  }
  // Without the signing key the gateway can only answer null.
  if (!host || !process.env.KONF_SITE_SIGNING_KEY) return env
  // One cache entry per tenant, whatever port or case the Host header had.
  host = normalizeDomain(host)
  try {
    const d1 = await fetchRolloutFlags(host)
    return {
      apiRead: env.apiRead || d1.apiRead,
      identityLogin: env.identityLogin || d1.identityLogin,
      d1Write: env.d1Write || d1.d1Write,
    }
  } catch (err) {
    console.warn(
      `[konf-api] rollout flags unavailable for ${host}:`,
      (err as Error).message,
    )
    return env
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
  const res = await fetch(KONF_API_URL, {
    method: 'POST',
    // Cached across visitors, so no client IP (see konfApiHeaders).
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: QUERY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { conference?: ApiConference | null }
    errors?: unknown[]
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  const api = json.data?.conference
  if (!api) throw new Error('conference is null')
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
 */
export async function mergeKonfApiConference(
  host: string,
  conference: Conference,
): Promise<Conference> {
  try {
    const api = await fetchKonfApiConference(host, conference._id)
    const { id, primaryColor, accentColor, homepageSections, ...rest } = api
    // Legacy rows fall back to the id for a blank title; keep Sanity's then.
    if (rest.title === id) delete rest.title
    const merged = { ...conference } as Record<string, unknown>
    for (const [k, v] of Object.entries(rest)) if (v != null) merged[k] = v
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
