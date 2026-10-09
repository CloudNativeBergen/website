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
 * - `unverified` — no record, or the allowlist refuses it.
 * - `not-offered` — a host the sync will never register: not a platform
 *   candidate at all (`isPlatformControlCandidate` — told before any DNS work),
 *   or verified but not platform-controlled (`isPlatformControlledHost`).
 * - `blocked` — would be `ready`, but `WORKOS_COOKIE_DOMAIN` is set, which
 *   refuses sign-in on every host (`resolveWorkshopSignInHost`).
 * - `failed` — the sync tried and WorkOS refused; `error` is what it recorded.
 * - `pending` — waiting for the sync.
 *
 * No I/O: the caller supplies the record and its redirect-URI fields.
 */

import {
  isPlatformControlCandidate,
  isPlatformControlledHost,
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
  if (!eligible) return { state: 'unverified' }
  if (!platformControlled) return { state: 'not-offered' }
  if (redirectUri?.error) return { state: 'failed', error: redirectUri.error }
  return { state: 'pending' }
}

/** {@link workshopSignInStanding} of a host as the redirect-URI read returns it. */
export function workshopSignInStandingOfRow(
  row: RedirectUriSyncRow | null,
  now: Date,
): WorkshopSignInStanding {
  const ownerOrgId = row?.conference?.organization?._ref
  const standing = workshopSignInStanding({
    record: row?.record ?? null,
    redirectUri: row?.redirectUri ?? null,
    platformControlled: row
      ? isPlatformControlledHost(row.record, ownerOrgId, now)
      : false,
    platformCandidate: row
      ? isPlatformControlCandidate(row.record, ownerOrgId)
      : false,
    now,
  })
  // The sign-in decision refuses every host while this is set; say so rather
  // than "available" (the decision itself never reaches here then).
  return standing.state === 'ready' && process.env.WORKOS_COOKIE_DOMAIN
    ? { state: 'blocked' }
    : standing
}
