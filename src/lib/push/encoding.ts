/**
 * Pure base64url helpers for web push (issue #444).
 *
 * The VAPID public key is transported to the client as a URL-safe base64
 * ("base64url") string, but `PushManager.subscribe({ applicationServerKey })`
 * requires a raw `Uint8Array`. These helpers do that conversion with no DOM or
 * Node dependency, so they run in the browser AND are unit-testable in Node.
 */

/**
 * Decode a base64url (or standard base64) string into a `Uint8Array`.
 *
 * Handles the URL-safe alphabet (`-`/`_`) and missing `=` padding that VAPID
 * keys are conventionally distributed with.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const raw = decodeBase64(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

/**
 * Decode standard base64 to a binary string, using `atob` in the browser and
 * `Buffer` under Node — so the same module works in both environments.
 */
function decodeBase64(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64)
  }
  // Node / test environment fallback.
  return Buffer.from(base64, 'base64').toString('binary')
}
