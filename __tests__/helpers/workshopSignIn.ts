import { domainVerificationId } from '@/lib/domain-verification/challenge'
import type {
  DomainVerificationRecord,
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'

/**
 * Fixtures for the workshop portal's WorkOS sign-in (#1296).
 *
 * `verifiedHost` is a `domainVerification` record the REAL allowlist policy
 * accepts whenever the test runs (proven yesterday). `signInHost` is that
 * record as the sign-in decision reads it (`getRedirectUriSyncRow`), with its
 * callback registered in WorkOS — a host that can sign in (#1298). A suite
 * that supplies either at the Sanity boundary exercises the real policy.
 *
 * Hostnames must look public: the policy treats `.example`, `.test`,
 * `.localhost` and friends as dev-only and never allowlists them.
 */
export function verifiedHost(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  return {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: yesterday,
    lastSuccessAt: yesterday,
    lastCheckedAt: yesterday,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
}

/**
 * A host that CAN sign in, as `getRedirectUriSyncRow` returns it: verified, and
 * its callback registered in WorkOS. Override the record or the redirect-URI
 * state to make it one that cannot.
 */
export function signInHost(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
  redirectUri: Partial<RedirectUriState> = {},
): RedirectUriSyncRow {
  return {
    record: verifiedHost(hostname, overrides),
    rev: 'rev-1',
    redirectUri: {
      status: 'registered',
      id: `ru_${hostname}`,
      error: null,
      ...redirectUri,
    },
    // The claiming conference still lists the host, as a synced claim does.
    conference: { organization: { _ref: 'org-1' }, domains: [hostname] },
  }
}

/** A `getRedirectUriSyncRow` stand-in that knows exactly these hosts. */
export function signInHostsById(
  rows: RedirectUriSyncRow[],
): (id: string) => Promise<RedirectUriSyncRow | null> {
  const byId = new Map(
    rows.map((row) => [domainVerificationId(row.record.hostname), row]),
  )
  return async (id) => byId.get(id) ?? null
}

/**
 * The proxy's answer to a sign-in route on a refused host (#1298): the portal
 * page, query dropped. The proxy returns it ABSOLUTE (same origin); Next's
 * adapter relativises it for the browser — pinned through the real adapter in
 * `proxy.workshop.adapter.test.ts`.
 */
export function isPortalRedirect(location: string | null): boolean {
  if (!location) return false
  const url = new URL(location)
  return url.pathname === '/workshop' && url.search === '' && url.hash === ''
}
