// #2207 phase 2: the domain challenge over DNS-over-HTTPS, because Workers
// have no node:dns. Uncached by us; Cloudflare's resolver honours the TTL.
import { challengeRecordName } from '@runkonf/tenancy/challenge'
import {
  classifyTxtRecords,
  type DomainCheckOutcome,
} from '@runkonf/tenancy/verification'

export const DOH_URL = 'https://cloudflare-dns.com/dns-query'
export const DOH_TIMEOUT_MS = 5_000

const NXDOMAIN = 3
const TXT = 16

/** `"a" "b"` (one TXT record, two chunks) → `['a', 'b']`. */
function chunks(data: string): string[] {
  const quoted = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    m[1]!.replace(/\\(.)/g, '$1'),
  )
  return quoted.length > 0 ? quoted : [data]
}

/**
 * HARD only when DNS answered: NXDOMAIN, no TXT, or no matching token.
 * Timeouts, SERVFAIL, any other rcode and HTTP errors are SOFT (our resolver
 * path, not evidence about the tenant's zone).
 */
export async function checkDomainChallengeDoh(
  entry: string,
  token: string,
): Promise<Exclude<DomainCheckOutcome, { kind: 'platform-owned' }>> {
  const name = challengeRecordName(entry)
  if (!name)
    return {
      kind: 'unverifiable',
      reason: 'Not a public DNS name (loopback, IP literal or dev port)',
    }
  let body: { Status?: number; Answer?: { type: number; data: string }[] }
  try {
    const res = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(name)}&type=TXT`,
      {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
      },
    )
    if (!res.ok)
      return {
        kind: 'soft-failure',
        reason: `DNS lookup failed (HTTP ${res.status})`,
      }
    body = await res.json()
  } catch (e) {
    const why =
      e instanceof Error && e.name === 'TimeoutError' ? 'ETIMEOUT' : 'EFETCH'
    return { kind: 'soft-failure', reason: `DNS lookup failed (${why})` }
  }
  if (body.Status === NXDOMAIN)
    return {
      kind: 'hard-failure',
      reason: `No TXT record at ${name} (NXDOMAIN)`,
    }
  if (body.Status !== 0)
    return {
      kind: 'soft-failure',
      reason: `DNS lookup failed (rcode ${body.Status ?? 'missing'})`,
    }
  const records = (body.Answer ?? [])
    .filter((a) => a.type === TXT)
    .map((a) => chunks(a.data))
  return classifyTxtRecords(name, token, records) as
    { kind: 'verified' } | { kind: 'hard-failure'; reason: string }
}
