import 'server-only'
import { isTicketingEnabledForOrg } from '@/lib/features/ticketing'
import {
  conferenceProviderType,
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
  type EventRef,
  type TicketingProvider,
  type TicketingProviderType,
} from './provider'

/**
 * ONE resolution for what an organizer's ticketing pages should show — the
 * three-way distinction the budget page already treats as correct
 * (`src/app/(admin)/admin/budget/page.tsx`): EMPTY ≠ ERROR ≠ UNAVAILABLE.
 *
 * WHAT IT REPLACES. All five provider-backed ticket pages hardcoded
 * `!conference.checkinCustomerId || !conference.checkinEventId` and rendered a
 * red `ErrorDisplay "Checkin.no Configuration Error"`. That was wrong three
 * ways:
 *
 *  1. VENDOR-BLIND. `resolveTicketingProvider` has supported Tito since the
 *     adapter generalized, but the guard only knew Checkin's fields — so a
 *     Tito-bound conference could never open ANY ticket page, however complete
 *     its binding. The state below keys on the resolver, which reads whichever
 *     binding the conference's `ticketingProvider` selects.
 *  2. AN ERROR FRAME FOR "NOT SET UP YET". A tenant that never configured
 *     ticketing has done nothing wrong; #820 additionally means an org with no
 *     credentials resolves to unconfigured no matter what ids it fills in.
 *  3. NO HONEST "NOT YOURS". An org without the `ticketing` entitlement cannot
 *     make those pages work at all, and pointing it at conference settings was
 *     a dead end.
 *
 * ORDER MATTERS. The provider is resolved FIRST, so a conference that is
 * genuinely configured renders its data regardless of what the entitlement says
 * — the gate must never hide a surface that works. Only when nothing resolves
 * does the entitlement decide WHICH honest empty state to show.
 */
export type TicketingAdminAccess =
  /** Bound, credentialed and ready — the caller may fetch. */
  | {
      state: 'ready'
      provider: TicketingProvider
      eventRef: EventRef
      providerType: TicketingProviderType
    }
  /** Entitled, but the conference is not bound to an event yet (or the org's
   * credentials are missing) — an empty state with a link to settings. */
  | { state: 'unconfigured'; providerType: TicketingProviderType }
  /** Not entitled: ticketing is not available to this organization at all. */
  | { state: 'unavailable'; providerType: TicketingProviderType }

export async function resolveTicketingAdminAccess(
  conference: ConferenceTicketingBinding,
): Promise<TicketingAdminAccess> {
  const providerType = conferenceProviderType(conference)
  const ticketing = await resolveTicketingProvider(conference)

  if (ticketing.configured) {
    return {
      state: 'ready',
      provider: ticketing.provider,
      eventRef: ticketing.eventRef,
      providerType,
    }
  }

  if (await isTicketingEnabledForOrg(conference.organization?._ref)) {
    return { state: 'unconfigured', providerType }
  }

  return { state: 'unavailable', providerType }
}

/** Vendor label for organizer-facing copy. */
export function ticketingProviderLabel(
  providerType: TicketingProviderType,
): string {
  return providerType === 'tito' ? 'Tito' : 'Checkin.no'
}
