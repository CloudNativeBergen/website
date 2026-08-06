import type { Conference } from './types'

/**
 * How a Host resolved — the seam that makes "we don't know" REPRESENTABLE.
 *
 * `getConferenceForDomain` hands back a TRUTHY `{} as Conference` whether the
 * read succeeded and matched nothing or the read blew up, so `conference` alone
 * cannot tell the two apart and every consumer that reasoned about it picked
 * the confident answer: "no conference is configured for this domain".
 *
 *  - `resolved`    — a conference document owns this Host.
 *  - `not-found`   — the read SUCCEEDED and no conference claims this Host
 *                    (or its domain claim no longer carries a DNS proof).
 *                    A statement about the world.
 *  - `unavailable` — the read FAILED. We do not know whether a conference
 *                    exists here. NOTHING may be asserted about this Host:
 *                    not "unclaimed", not "CFP closed", not "no tickets".
 */
export type ConferenceResolutionStatus =
  'resolved' | 'not-found' | 'unavailable'

/**
 * The shape returned by `getConferenceForDomain` /
 * `getConferenceForCurrentDomain` that callers must inspect before rendering.
 */
export interface ConferenceResolution {
  conference: Conference
  error?: Error | null
  /**
   * Optional so a caller holding only a conference (e.g. `TenantThemeStyle`,
   * which receives one as a prop) can still ask `isUnknownHost`. When it is
   * absent the guards fall back to the pre-status behaviour — which is why
   * `isConferenceUnavailable` answers `false` rather than guessing: only a
   * resolution that POSITIVELY reports `unavailable` is unavailable.
   */
  status?: ConferenceResolutionStatus
}

/**
 * Canonical unknown-host test.
 *
 * `getConferenceForDomain` returns a TRUTHY `{} as Conference` (plus an
 * `error`) when a Host resolves to no conference, so a bare `!conference`
 * NEVER fires and dereferencing fields like `conference.formats` throws.
 * Every public (main) page and the (main) layout must gate on this instead.
 *
 * A FAILED read is NOT an unknown host (#848). It used to be treated as one,
 * so a Sanity outage turned every live tenant's site into an unsold domain
 * offering itself up to be claimed. Check `isConferenceUnavailable` FIRST.
 */
export function isUnknownHost({
  conference,
  status,
}: ConferenceResolution): boolean {
  // ONLY the absence of a resolved conference counts as unknown-host. An
  // `error` alongside a VALID conference (partial/secondary read failure) must
  // NOT flip the whole site to the platform landing — pages keep their own
  // error handling for that case (e.g. the terms page's conferenceError
  // branch, which a Boolean(error) test here would render unreachable).
  if (status) return status === 'not-found'
  return !conference?._id
}

/**
 * Did the conference read FAIL?
 *
 * True only when we could not find out whether this Host has a conference —
 * never for a Host that demonstrably has none. Callers must render an
 * "unavailable, try again" state: no claim about the tenant, the CFP or
 * ticket availability is supportable here.
 */
export function isConferenceUnavailable({
  status,
}: ConferenceResolution): boolean {
  return status === 'unavailable'
}
