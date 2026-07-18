import { z } from 'zod'

/**
 * Shared validation for a browser push-service endpoint URL (issue #444).
 *
 * SSRF hardening: `send.ts` POSTs to whatever endpoint we stored, so the
 * endpoint is an attacker-influenced request target. Even though the endpoint
 * only ever comes from the caller's OWN browser `PushSubscription`, we refuse to
 * store or send to anything that is not a plain public HTTPS URL. This blocks a
 * forged subscription (via the tRPC/resubscribe body) from turning the push
 * sender into an SSRF probe against internal hosts or the loopback interface.
 *
 * Rules (all must hold):
 *   - parses as an absolute URL;
 *   - `https:` scheme only (no http:, no file:, no gopher:, …);
 *   - hostname is NOT an IP literal — v4 dotted-quad, bracketed/colon IPv6, or a
 *     bare integer/hex form a browser would coerce to an IPv4;
 *   - hostname is NOT localhost or a `.localhost` / `.local` / `.internal` name;
 *   - length capped at {@link MAX_PUSH_ENDPOINT_LENGTH} to bound storage/DoS.
 *
 * Isomorphic (no server-only imports) so the tRPC input schemas that reference
 * it can be shared with the client. The real network guard is enforced again in
 * `send.ts` (defense in depth) before any request leaves the server.
 */

export const MAX_PUSH_ENDPOINT_LENGTH = 2048

/** Max length for a subscription key (`p256dh` ~88 chars, `auth` ~24; cap well above). */
export const MAX_PUSH_KEY_LENGTH = 512

function isIpLiteral(hostname: string): boolean {
  // IPv6: URL.hostname keeps the brackets (e.g. "[::1]"); a raw colon is IPv6.
  if (hostname.includes(':') || hostname.startsWith('[')) return true
  // IPv4 dotted quad.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  // Bare integer or hex forms that resolve to an IPv4 (e.g. "2130706433",
  // "0x7f000001"). A legitimate push host is always a DNS name.
  if (/^\d+$/.test(hostname)) return true
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true
  return false
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '') // strip a trailing dot
  if (h === 'localhost') return true
  if (h.endsWith('.localhost')) return true
  if (h.endsWith('.local')) return true
  if (h.endsWith('.internal')) return true
  return false
}

/** True only for a plain, public HTTPS push endpoint (see module doc). */
export function isValidPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_PUSH_ENDPOINT_LENGTH) {
    return false
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const hostname = url.hostname
  if (!hostname) return false
  if (isIpLiteral(hostname)) return false
  if (isBlockedHost(hostname)) return false
  return true
}

/** A zod string schema that accepts only a valid push endpoint. */
export const PushEndpointSchema = z
  .string()
  .max(MAX_PUSH_ENDPOINT_LENGTH)
  .refine(isValidPushEndpoint, {
    message: 'Invalid push endpoint (must be a public https URL)',
  })
