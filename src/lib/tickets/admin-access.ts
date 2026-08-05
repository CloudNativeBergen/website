import 'server-only'
import {
  isTicketingDeniedForOrg,
  isTicketingEnabledForOrg,
} from '@/lib/features/ticketing'
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
 * ORDER MATTERS — THREE STATES, NOT TWO:
 *
 *  1. An explicit operator DENY (`featureOverrides: enabled: false`) is a HARD
 *     KILL SWITCH and is checked BEFORE anything else, so it blocks the page and
 *     not merely the nav entry (owner decision, 2026-08-06). Credentials do not
 *     rescue a denied org, and no provider call is made on its behalf.
 *  2. Otherwise the provider is resolved NEXT, so a conference that is genuinely
 *     configured renders its data regardless of what the entitlement says — the
 *     gate must never hide a working surface behind the mere ABSENCE of a grant.
 *  3. Only when nothing resolves does the entitlement decide WHICH honest empty
 *     state to show.
 *
 * Steps 1 and 2 must stay in this order in both directions: move the deny after
 * the provider and it stops being a kill switch (the #828 bug this refines);
 * widen step 1 from "explicit deny" to "not enabled" and a flaky org read or an
 * un-granted-but-credentialed tenant loses a page that works — the exact hazard
 * #828 fixed. `isTicketingDeniedForOrg` is narrow on purpose.
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
  /**
   * Explicitly switched OFF by an operator. Distinct from `unavailable` because
   * the organizer's situation is different: this org may well have a working
   * integration and have been using it, so "not available for your
   * organization" would read as a lie. The copy says it was turned off and who
   * to ask; see `TicketingStateNotice`.
   */
  | { state: 'disabled'; providerType: TicketingProviderType }

export async function resolveTicketingAdminAccess(
  conference: ConferenceTicketingBinding,
): Promise<TicketingAdminAccess> {
  const providerType = conferenceProviderType(conference)
  const orgId = conference.organization?._ref

  // 1. THE KILL SWITCH, ahead of the provider: an operator's explicit deny is a
  // decision, not a missing grant, and it must be honoured on the page as well
  // as in the nav.
  if (await isTicketingDeniedForOrg(orgId)) {
    return { state: 'disabled', providerType }
  }

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
