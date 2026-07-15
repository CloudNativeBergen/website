import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Self-service "link another provider" support (identity Phase 2).
 *
 * The problem this solves: a speaker who first signed in with GitHub and then
 * authenticates with LinkedIn (whose verified email does not match) would, on
 * the normal login path, get a brand-new duplicate speaker. Link mode lets an
 * already-signed-in speaker X deliberately attach a second provider to their
 * EXISTING document.
 *
 * SECURITY MODEL — the link-intent token:
 *  - It is minted only by an authenticated server entry point that has already
 *    resolved the caller's session (see `/api/auth/link`). At mint time we know
 *    the caller is speaker X, so the token binds `speakerId = X`.
 *  - It is integrity-protected with an HMAC over the payload keyed by
 *    `AUTH_SECRET`. A client cannot forge or tamper with it (no valid MAC).
 *  - It is delivered as an httpOnly, Secure, SameSite=Lax cookie, so hostile
 *    JavaScript cannot read it and it is not attachable cross-site.
 *  - It carries a short expiry (5 min) and a random nonce. Because it is bound
 *    to X and only ever present in X's own httpOnly cookie, it cannot be
 *    replayed to attach a provider to a *different* speaker: an attacker can
 *    neither forge it (no key) nor exfiltrate X's cookie (httpOnly). Replay in
 *    X's own browser only re-links the same provider to X, which is idempotent.
 *  - The token is bound to a specific target provider; the OAuth callback only
 *    honours it when the provider just authenticated matches the bound one.
 *
 * The ownership proof for the link itself is the second OAuth round-trip: to
 * attach `linkedin:<id>` to X you must actually authenticate with that LinkedIn
 * account, which proves you control it.
 */

export const LINK_INTENT_COOKIE = 'cndn.link-intent'
export const LINK_RESULT_PARAM = 'linkResult'
export const LINK_INTENT_TTL_SECONDS = 5 * 60 // 5 minutes

export const LINKABLE_PROVIDERS = ['github', 'linkedin'] as const
export type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number]

export function isLinkableProvider(value: string): value is LinkableProvider {
  return (LINKABLE_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Outcome surfaced back to the profile UI after a link round-trip.
 * - `linked`: the second provider was attached to the existing speaker.
 * - `already-linked`: the provider account already belongs to a DIFFERENT
 *   speaker; we did not merge — the user must contact the organizers.
 * - `error`: an unexpected failure while linking.
 */
export type LinkResult = 'linked' | 'already-linked' | 'error'

export function isLinkResult(value: string): value is LinkResult {
  return value === 'linked' || value === 'already-linked' || value === 'error'
}

/**
 * Request-scoped carrier for the link outcome. The NextAuth route handler runs
 * the whole OAuth callback inside `linkResultStore.run({}, ...)`; the `jwt`
 * callback writes the outcome into the store and the `redirect` callback reads
 * it to append `?linkResult=...` to the post-login URL. Using AsyncLocalStorage
 * (rather than a module global) keeps this safe under concurrent requests.
 */
export const linkResultStore = new AsyncLocalStorage<{ result?: LinkResult }>()

interface LinkIntentPayload {
  speakerId: string
  provider: LinkableProvider
  exp: number // epoch seconds
  nonce: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function hmac(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * Mint a signed, short-lived link-intent token binding the initiating speaker to
 * a target provider. Throws if `AUTH_SECRET` is not configured (fail closed).
 */
export function signLinkIntent(
  input: { speakerId: string; provider: LinkableProvider },
  secret: string | undefined = process.env.AUTH_SECRET,
  now: number = Date.now(),
): string {
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured; cannot mint link intent')
  }
  if (!input.speakerId) {
    throw new Error('Cannot mint link intent without a speaker id')
  }
  const payload: LinkIntentPayload = {
    speakerId: input.speakerId,
    provider: input.provider,
    exp: Math.floor(now / 1000) + LINK_INTENT_TTL_SECONDS,
    nonce: base64url(randomBytes(12)),
  }
  const payloadB64 = base64url(JSON.stringify(payload))
  return `${payloadB64}.${hmac(payloadB64, secret)}`
}

/**
 * Verify a link-intent token for a given just-authenticated provider. Returns
 * the bound `{ speakerId, provider }` when the token is authentic, unexpired and
 * bound to `expectedProvider`; otherwise `null` (forged, tampered, expired,
 * wrong provider, or malformed — all rejected the same way).
 */
export function verifyLinkIntent(
  token: string | undefined | null,
  expectedProvider: string,
  secret: string | undefined = process.env.AUTH_SECRET,
  now: number = Date.now(),
): { speakerId: string; provider: LinkableProvider } | null {
  if (!token || !secret) return null

  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payloadB64 = token.slice(0, dot)
  const providedSig = token.slice(dot + 1)

  const expectedSig = hmac(payloadB64, secret)
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  // Constant-time comparison; length mismatch is an immediate reject.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: LinkIntentPayload
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as LinkIntentPayload
  } catch {
    return null
  }

  if (!payload || typeof payload.speakerId !== 'string' || !payload.speakerId) {
    return null
  }
  if (
    typeof payload.provider !== 'string' ||
    !isLinkableProvider(payload.provider)
  ) {
    return null
  }
  if (payload.provider !== expectedProvider) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null

  return { speakerId: payload.speakerId, provider: payload.provider }
}
