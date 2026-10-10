/**
 * WHICH HOSTS MAY RECEIVE A HAND-OFF from the auth host (#1311, spec §4). The
 * rule lives here and nowhere else:
 *
 *  - the host has a verification record that is PROVEN: it passes
 *    `isAllowlistEligible` AND it is a host the platform allocated or one whose
 *    DNS proof resolved (`method: 'dns-txt'`). `isAllowlistEligible` alone also
 *    admits a grandfathered record inside its grace period, and a
 *    `platform-owned` one that is no longer an allocation; neither was proven;
 *  - the match is on the EXACT hostname: the record is read by the id of the
 *    host asked for and must name it. No wildcard, no suffix, and the routing
 *    matcher is not used;
 *  - its conference STILL CLAIMS the host, by that exact name;
 *  - `localhost` qualifies only with `NODE_ENV=development`.
 *
 * Read live, never cached: a cached answer is a delisting that has not taken
 * effect. Fail closed: a malformed host and a failed read both answer `null`.
 *
 * It says where a sign-in may be handed to. It does not say what the
 * conference there offers; the caller decides that from `conference`.
 */

import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { domainVerificationId, isWildcardEntry } from './challenge'
import { isPlatformAllocated } from './platform'
import { isAllowlistEligible } from './policy'
import { getDomainClaim } from './sanity'
import type { ClaimingConference, DomainVerificationRecord } from './types'

export interface ProvenDestination {
  /** The host, in its canonical form. */
  host: string
  /** `https://<host>`; `http://localhost[:port]` in development. */
  origin: string
  /** The conference that claims the host, read with the record. */
  conference: ClaimingConference
}

/**
 * `host` as a bare, exact `hostname[:port]`, or `null`. The shape is the one a
 * `domains[]` entry has, so nothing a URL parser could read as userinfo, a
 * path, a query or a fragment gets through.
 */
function exactHost(host: string | null | undefined): string | null {
  const candidate = host ? normalizeDomain(host) : ''
  if (!isValidDomainEntry(candidate) || isWildcardEntry(candidate)) return null
  return candidate
}

function isProven(record: DomainVerificationRecord, now: Date): boolean {
  return (
    isAllowlistEligible(record, now) &&
    (isPlatformAllocated(record) || record.method === 'dns-txt')
  )
}

/**
 * DEVELOPMENT ONLY: a local server. `NODE_ENV` is `production` in every
 * deployed build (previews included), so this cannot be reached there, and
 * nothing but `localhost` qualifies.
 */
async function localDestination(
  host: string,
): Promise<ProvenDestination | null> {
  const { conference, error } = await getConferenceForDomain(host)
  if (error || !conference?._id) return null
  const { _id, organization, ticketingProvider, domains } = conference
  return {
    host,
    origin: `http://${host}`,
    conference: { _id, organization, ticketingProvider, domains },
  }
}

/** May a sign-in be handed to `host`? `null` refuses. See the module doc. */
export async function resolveProvenDestination(
  host: string | null | undefined,
  now: Date = new Date(),
): Promise<ProvenDestination | null> {
  const hostname = exactHost(host)
  if (!hostname) return null

  try {
    if (
      process.env.NODE_ENV === 'development' &&
      hostname.split(':')[0] === 'localhost'
    ) {
      return await localDestination(hostname)
    }

    const claim = await getDomainClaim(domainVerificationId(hostname))
    if (!claim?.conference) return null
    const { record, conference } = claim
    if (normalizeDomain(record.hostname) !== hostname) return null
    if (!isProven(record, now)) return null
    const claims = (conference.domains ?? []).some(
      (domain) =>
        typeof domain === 'string' && normalizeDomain(domain) === hostname,
    )
    if (!claims) return null
    return { host: hostname, origin: `https://${hostname}`, conference }
  } catch (error) {
    console.error(
      '[domain-verification] destination read failed; refusing the host',
      error,
    )
    return null
  }
}
