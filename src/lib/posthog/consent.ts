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
  opt_in_capturing(options?: { captureProperties?: Properties }): void
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
 * They cannot move BEFORE the opt-in: its reset would wipe them.
 *
 * The events the SDK captures INSIDE `opt_in_capturing()` (`$opt_in`, the
 * entry event of the new session) run before either call; `before_send`
 * stamps the landing UTMs on those (`optInUtmBridge` in `./config`), because
 * by then the address bar has usually been stripped (spec §3, #1146). The
 * `register_for_session` below is what carries them past this page load.
 *
 * Decline: opt out, then re-register `conference`. Under `cookieless_mode:
 * 'on_reject'` the SDK keeps counting cookielessly and persists the denial
 * itself so the bar stays hidden on the next visit — but revoking an earlier
 * Accept resets persistence, which drops the super property, so it is put
 * back for the same reason as on Accept.
 */
export function applyConsentChoice(
  client: ConsentClient,
  choice: ConsentChoice,
  context: ConsentContext,
): void {
  if (choice === 'decline') {
    client.opt_out_capturing()
    client.register({ conference: context.conference })
    return
  }
  // The `$opt_in` event the SDK captures here fires BEFORE the re-register
  // below can run, so it carries the conference explicitly.
  client.opt_in_capturing({
    captureProperties: { conference: context.conference },
  })
  client.register({ conference: context.conference })
  if (Object.keys(context.landingUtm).length > 0) {
    client.register_for_session(context.landingUtm)
  }
}
