import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag, domainTag } from '@/lib/cache/tags'
import { konfApiHeaders } from '@/lib/konf-api/client'
import { CONFERENCE_CACHE_LIFE } from './cache-life'
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
  homepageSections?: string | null
}

/** `KONF_API_TENANTS`: comma-separated conference ids or organization ids. Empty = off. */
export function isKonfApiTenant(conference: Conference): boolean {
  const ids = (process.env.KONF_API_TENANTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return false
  return (
    ids.includes(conference._id) ||
    (!!conference.organization?._ref &&
      ids.includes(conference.organization._ref))
  )
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
    if (homepageSections) {
      const sections = JSON.parse(homepageSections)
      if (Array.isArray(sections)) merged.homepageSections = sections
    }
    return merged as unknown as Conference
  } catch (err) {
    console.warn(
      `[konf-api] falling back to Sanity for ${host}:`,
      (err as Error).message,
    )
    return conference
  }
}
