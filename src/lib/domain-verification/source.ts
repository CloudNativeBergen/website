/**
 * #2207 phase 6: the ONE place the site's readers of "is this host proven?"
 * get their records from. Routing (`routing.ts`), the redirect allowlist
 * (`allowlist.ts`, behind the OAuth redirect guard), the sign-in destination
 * (`destination.ts`), sign-in standing and the admin/system-status views all
 * read through here, so they switch together and cannot disagree.
 *
 * `DOMAIN_VERIFICATION_SOURCE=d1` reads tenant-directory D1 `domains` through
 * the gateway's site lane (`siteDomainRecords`); anything else (the default)
 * reads Sanity `domainVerification`, as before. Writers stay on Sanity and
 * dual-write to D1 (phase 5) until the sweep moves (phase 7).
 *
 * Fail closed: a D1 read that cannot be made or fails THROWS, which every
 * caller already treats as a refusal; a missing row is `null`, which every
 * policy refuses. Per-host reads are cached in memory: hits 60 s, misses
 * 30 s, errors never. So a revocation takes up to 60 s to land. The cache is
 * what keeps routing under the gateway's limiter: the site lane carries no
 * user token, so it counts in the anonymous bucket (`anon:<org>:<ip>`, 300 a
 * minute) keyed on a few Vercel egress IPs, and no site-lane call is exempt
 * (`rolloutFlags` leans on its cache the same way). The allowlist list read
 * stays live; it runs only on OAuth callbacks.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { mergeConference } from '@/lib/conference/merge'
import { konfApiHeaders, konfApiUrl } from '@/lib/konf-api/client'
import { domainVerificationId } from './challenge'
import * as sanity from './sanity'
import type { DomainClaim, DomainVerificationRecord } from './types'

export type DomainVerificationSource = 'd1' | 'sanity'

export function domainVerificationSource(
  env: NodeJS.ProcessEnv = process.env,
): DomainVerificationSource {
  return env.DOMAIN_VERIFICATION_SOURCE?.trim() === 'd1' ? 'd1' : 'sanity'
}

const QUERY = `query($h: String, $c: ID, $s: DomainStatus) {
  siteDomainRecords(hostname: $h, conferenceId: $c, status: $s) {
    hostname conferenceId method status token verifiedAt lastSuccessAt
    lastCheckedAt firstFailureAt graceUntil consecutiveFailures
    consecutiveSoftFailures lastError
  }
}`
const TIMEOUT_MS = 2000

interface Row {
  hostname: string
  conferenceId: string
  method: string | null
  status: DomainVerificationRecord['status'] | null
  token: string | null
  verifiedAt: string | null
  lastSuccessAt: string | null
  lastCheckedAt: string | null
  firstFailureAt: string | null
  graceUntil: string | null
  consecutiveFailures: number
  consecutiveSoftFailures: number
  lastError: string | null
}

/** A D1 row as the policy reads it, like the import's `d1Record`. */
export function recordOf(row: Row): DomainVerificationRecord | null {
  if (!row.status) return null
  return {
    _id: domainVerificationId(row.hostname),
    hostname: row.hostname,
    conferenceId: row.conferenceId,
    token: row.token ?? '',
    status: row.status,
    method: row.method === 'platform' ? 'platform-owned' : 'dns-txt',
    graceUntil: row.graceUntil,
    verifiedAt: row.verifiedAt,
    lastSuccessAt: row.lastSuccessAt,
    lastCheckedAt: row.lastCheckedAt,
    firstFailureAt: row.firstFailureAt,
    consecutiveFailures: row.consecutiveFailures,
    consecutiveSoftFailures: row.consecutiveSoftFailures,
    lastError: row.lastError,
  }
}

async function readD1(variables: {
  h?: string
  c?: string
  s?: 'verified'
}): Promise<DomainVerificationRecord[]> {
  const url = konfApiUrl()
  // The site lane needs a host the gateway resolves; any org's will do, since
  // the query spans every org.
  const host = process.env.DOMAIN_VERIFICATION_D1_HOST?.trim()
  if (!url || !host || !process.env.KONF_SITE_SIGNING_KEY)
    throw new Error(
      'DOMAIN_VERIFICATION_SOURCE=d1 needs the gateway, KONF_SITE_SIGNING_KEY and DOMAIN_VERIFICATION_D1_HOST',
    )
  const res = await fetch(url, {
    method: 'POST',
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query: QUERY, variables }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`siteDomainRecords: HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { siteDomainRecords?: Row[] | null }
    errors?: unknown[]
  }
  const rows = json.data?.siteDomainRecords
  if (json.errors?.length || !Array.isArray(rows))
    throw new Error(`siteDomainRecords: ${JSON.stringify(json.errors)}`)
  return rows.map(recordOf).filter((r) => r !== null)
}

const HIT_TTL_MS = 60_000
const MISS_TTL_MS = 30_000
const CACHE_MAX = 1000
const cache = new Map<
  string,
  { record: DomainVerificationRecord | null; until: number }
>()

/** Test hook: forget cached reads. */
export function clearMissCache() {
  cache.clear()
}

async function d1Record(
  hostname: string,
): Promise<DomainVerificationRecord | null> {
  const host = normalizeDomain(hostname)
  const hit = cache.get(host)
  if (hit && hit.until > Date.now()) return hit.record
  const [record = null] = await readD1({ h: host })
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(host, {
    record,
    until: Date.now() + (record ? HIT_TTL_MS : MISS_TTL_MS),
  })
  return record
}

/** One hostname's record, or `null`. */
export async function readDomainVerification(
  hostname: string,
): Promise<DomainVerificationRecord | null> {
  return domainVerificationSource() === 'd1'
    ? d1Record(hostname)
    : sanity.getDomainVerification(hostname)
}

/** Every record that could be on the redirect allowlist (a prefilter). */
export async function readAllowlistCandidates(): Promise<
  DomainVerificationRecord[]
> {
  return domainVerificationSource() === 'd1'
    ? readD1({ s: 'verified' })
    : sanity.listAllowlistCandidates()
}

/** One conference's records, for the admin and system-status views. */
export async function readConferenceDomainVerifications(
  conferenceId: string,
): Promise<DomainVerificationRecord[]> {
  return domainVerificationSource() === 'd1'
    ? readD1({ c: conferenceId })
    : sanity.listDomainVerificationsForConference(conferenceId)
}

/** One host's record with the conference it points at, for `destination.ts`. */
export async function readDomainClaim(
  hostname: string,
): Promise<DomainClaim | null> {
  if (domainVerificationSource() !== 'd1')
    return sanity.getDomainClaim(domainVerificationId(hostname))
  const record = await d1Record(hostname)
  if (!record?.conferenceId) return null
  // The conference itself still lives in Sanity, under the same id.
  const conference = await sanity.getClaimingConference(record.conferenceId)
  return {
    record,
    conference: conference ? await mergeConference(conference) : null,
  }
}
