import 'server-only'
import webpush from 'web-push'

/**
 * Server-only VAPID configuration for web push (issue #444).
 *
 * SECURITY: the PRIVATE key must never reach the client. This module imports
 * `web-push` (a Node-only library) and is only ever imported from server code
 * (the `push` tRPC router, the event handler, and the resubscribe API route),
 * so it never ends up in a client bundle. The PUBLIC key is safe to expose and
 * is surfaced to the client via the `push.getVapidKey` tRPC query.
 *
 * Keys are read from the environment:
 *   - VAPID_PUBLIC_KEY   (base64url application server key)
 *   - VAPID_PRIVATE_KEY  (base64url; server-only)
 *   - VAPID_SUBJECT      (a `mailto:` or `https:` contact URL)
 *
 * Generate a real pair with `pnpm tsx scripts/gen-vapid-keys.ts` (or
 * `npx web-push generate-vapid-keys`). In CI/tests dummy values are fine — no
 * notification is actually delivered there.
 */

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? ''
}

function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY ?? ''
}

function getVapidSubject(): string {
  // A syntactically valid contact URL is required by the push spec. Fall back to
  // a mailto so a misconfigured env fails loudly at send time, not at import.
  return process.env.VAPID_SUBJECT ?? 'mailto:hei@cloudnativedays.no'
}

/** True only when a full, usable VAPID key pair is configured. */
export function isPushConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey())
}

let configured = false
let configError: string | null = null

/**
 * The reason VAPID configuration FAILED (malformed subject/keys), or null when
 * configuration succeeded or hasn't been attempted. `setVapidDetails` throws
 * synchronously on e.g. a bare-email VAPID_SUBJECT (must be a URL or mailto:)
 * or a wrong-length key — surfacing the message here lets the push test button
 * and the admin self-check page explain the misconfiguration instead of a
 * generic "internal error".
 */
export function getWebPushConfigError(): string | null {
  return configError
}

/**
 * Lazily apply the VAPID details to the shared `web-push` client exactly once.
 * Returns the configured client, or `null` when keys are missing OR when the
 * configured values are MALFORMED (so callers can no-op instead of throwing) —
 * in the malformed case {@link getWebPushConfigError} carries the reason.
 */
export function getConfiguredWebPush(): typeof webpush | null {
  if (!isPushConfigured()) {
    return null
  }
  if (configError) {
    return null
  }
  if (!configured) {
    try {
      webpush.setVapidDetails(
        getVapidSubject(),
        getVapidPublicKey(),
        getVapidPrivateKey(),
      )
      configured = true
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error)
      console.error('[push] VAPID configuration is invalid:', configError)
      return null
    }
  }
  return webpush
}
