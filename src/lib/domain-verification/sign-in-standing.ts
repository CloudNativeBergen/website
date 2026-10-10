/**
 * WHERE ONE HOST STANDS FOR THE WORKSHOP PORTAL'S SIGN-IN (#1298).
 *
 * A host can carry a WorkOS sign-in only when it is on the verified-redirect
 * allowlist AND WorkOS holds its callback as a redirect URI. Anything short of
 * both ends at a WorkOS error page, so the sign-in decision
 * (`resolveWorkshopSignInHost`) admits exactly the `ready` standing, and the
 * attendee page, the ticket-sold email link and the organizer surfaces read the
 * same answer.
 *
 * - `ready` — verified, and WorkOS has the URI (`registered` by the sync, or
 *   `external`: found there without an id of ours), with no failure recorded
 *   since.
 * - `unverified` — no record, or a platform candidate without a real proof
 *   (unproven, stale, or only grandfathered), so `isPlatformControlledHost`
 *   refuses it until the TXT record resolves.
 * - `not-offered` — a host the sync will never register: not a platform
 *   candidate at all (`isPlatformControlCandidate`), whatever its proof.
 * - `blocked` — would be `ready`, `pending` or `failed`, but
 *   `WORKOS_COOKIE_DOMAIN` is set, which refuses sign-in on every host
 *   (`resolveWorkshopSignInHost`).
 * - `failed` — the sync tried and WorkOS refused; `error` is what it recorded.
 * - `pending` — waiting for the sync.
 *
 * No I/O: the caller supplies the record and its redirect-URI fields.
 */

import {
  isPlatformControlCandidate,
  isPlatformControlledHost,
  isPlatformOwner,
} from './platform-controlled'
import { isAllowlistEligible } from './policy'
import type {
  DomainVerificationRecord,
  RedirectUriState,
  RedirectUriSyncRow,
} from './types'

export type WorkshopSignInStanding =
  | { state: 'ready' }
  | { state: 'unverified' }
  | { state: 'not-offered' }
  | { state: 'pending' }
  | { state: 'failed'; error: string }
  | { state: 'blocked' }

export function workshopSignInStanding({
  record,
  redirectUri,
  platformControlled,
  platformCandidate,
  now,
}: {
  record: DomainVerificationRecord | null
  redirectUri: RedirectUriState | null
  /** `isPlatformControlledHost` for the record. */
  platformControlled: boolean
  /** `isPlatformControlCandidate` for the record. */
  platformCandidate: boolean
  now: Date
}): WorkshopSignInStanding {
  const eligible = record !== null && isAllowlistEligible(record, now)
  // A recorded error rules `ready` out: a failed create keeps an earlier
  // `registered` id on the record (it is still what a delete addresses), so
  // the status alone does not say WorkOS has the URI now.
  if (
    eligible &&
    !redirectUri?.error &&
    (redirectUri?.status === 'registered' || redirectUri?.status === 'external')
  ) {
    return { state: 'ready' }
  }
  // Before "unverified": verifying a host that can never qualify would not
  // help, and the organizer should not be told it would.
  if (record && !platformCandidate) return { state: 'not-offered' }
  // A candidate that is not controlled lacks a real proof: unproven, stale,
  // or admitted only by grandfathering. Publishing the record fixes it.
  if (!eligible || !platformControlled) return { state: 'unverified' }
  if (redirectUri?.error) return { state: 'failed', error: redirectUri.error }
  return { state: 'pending' }
}

/**
 * {@link workshopSignInStanding} of a host as the redirect-URI read returns it.
 * `ownerOrgId` is the claiming conference's owner, for a host with no record
 * of its own (`null` row); without it such a host reads `unverified`.
 */
export function workshopSignInStandingOfRow(
  row: RedirectUriSyncRow | null,
  now: Date,
  ownerOrgId?: string | null,
): WorkshopSignInStanding {
  const owner = row ? row.conference?.organization?._ref : ownerOrgId
  const standing = row
    ? workshopSignInStanding({
        record: row.record,
        redirectUri: row.redirectUri,
        platformControlled: isPlatformControlledHost(row.record, owner, now),
        platformCandidate: isPlatformControlCandidate(row.record, owner),
        now,
      })
    : // No record: nothing is proven, and only the owner can say whether
      // proving it would ever help.
      ownerOrgId !== undefined && !isPlatformOwner(ownerOrgId)
      ? { state: 'not-offered' as const }
      : { state: 'unverified' as const }
  // The sign-in decision refuses every host while this is set (it never
  // reaches here then), so nothing the sync does will make the host work:
  // say so rather than "available", "pending" or "failed".
  const waitsOnlyForWorkOS =
    standing.state === 'ready' ||
    standing.state === 'pending' ||
    standing.state === 'failed'
  return waitsOnlyForWorkOS && process.env.WORKOS_COOKIE_DOMAIN
    ? { state: 'blocked' }
    : standing
}
