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
 *   `external`: found there without an id of ours).
 * - `unverified` — no record, or the allowlist refuses it.
 * - `not-offered` — verified, but not a host the sync registers
 *   (`isPlatformControlledHost`, #1306), so it will never become ready.
 * - `failed` — the sync tried and WorkOS refused; `error` is what it recorded.
 * - `pending` — waiting for the sync.
 *
 * No I/O: the caller supplies the record and its redirect-URI fields.
 */

import { isPlatformControlledHost } from './platform-controlled'
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

export function workshopSignInStanding({
  record,
  redirectUri,
  platformControlled,
  now,
}: {
  record: DomainVerificationRecord | null
  redirectUri: RedirectUriState | null
  platformControlled: boolean
  now: Date
}): WorkshopSignInStanding {
  if (!record || !isAllowlistEligible(record, now)) {
    return { state: 'unverified' }
  }
  if (
    redirectUri?.status === 'registered' ||
    redirectUri?.status === 'external'
  ) {
    return { state: 'ready' }
  }
  if (!platformControlled) return { state: 'not-offered' }
  if (redirectUri?.error) return { state: 'failed', error: redirectUri.error }
  return { state: 'pending' }
}

/** {@link workshopSignInStanding} of a host as the redirect-URI read returns it. */
export function workshopSignInStandingOfRow(
  row: RedirectUriSyncRow | null,
  now: Date,
): WorkshopSignInStanding {
  return workshopSignInStanding({
    record: row?.record ?? null,
    redirectUri: row?.redirectUri ?? null,
    platformControlled: row
      ? isPlatformControlledHost(
          row.record,
          row.conference?.organization?._ref,
          now,
        )
      : false,
    now,
  })
}
