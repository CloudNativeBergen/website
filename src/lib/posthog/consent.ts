import type { Properties } from 'posthog-js'

/**
 * The consent choice (#1034), applied to a PostHog client. PURE apart from the
 * calls on the injected client, so the ORDER of those calls — which is the
 * whole point — is asserted in `consent.test.ts`.
 */

export type ConsentChoice = 'accept' | 'decline'

export type ConsentStatus = 'granted' | 'denied' | 'pending'

/** The slice of the PostHog client the consent flow touches. */
export interface ConsentClient {
  opt_in_capturing(): void
  opt_out_capturing(): void
  register(properties: Properties): void
  register_for_session(properties: Properties): void
  get_explicit_consent_status(): ConsentStatus
}

export interface ConsentContext {
  conference: string
  /** The landing URL's `utm_*`, captured at init (`landingUtm`). */
  landingUtm: Record<string, string>
}

/**
 * Accept: opt in, THEN re-register `conference` and replay the landing UTMs
 * into the new client session. `opt_in_capturing()` swaps persistence from
 * memory to cookie, which starts a fresh client session and drops every super
 * property registered before consent — so without the two calls after it, an
 * accepting visitor's CTA clicks would fall out of the conference-filtered
 * query entirely (#1000 findings 4–5; spec §6.1 "Accept bridge", mandatory).
 *
 * Decline: opt out. Under `cookieless_mode: 'on_reject'` the SDK keeps
 * counting cookielessly, and it persists the denial itself so the bar stays
 * hidden on the next visit.
 */
export function applyConsentChoice(
  client: ConsentClient,
  choice: ConsentChoice,
  context: ConsentContext,
): void {
  if (choice === 'decline') {
    client.opt_out_capturing()
    return
  }
  client.opt_in_capturing()
  client.register({ conference: context.conference })
  if (Object.keys(context.landingUtm).length > 0) {
    client.register_for_session(context.landingUtm)
  }
}
