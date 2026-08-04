import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Token minting and low-level verification for email sign-in links.
 *
 * TWO TIERS, chosen at REQUEST time from the address's role (see `tier.ts`):
 *
 *  - `st1.` STATELESS — speakers and attendees. A self-describing, HMAC-signed
 *    blob carrying the identifier, the tenant host it was minted on, an expiry
 *    and a nonce. Nothing is written anywhere. It is therefore REPLAYABLE for
 *    its (short) lifetime and cannot be revoked; that is the accepted trade for
 *    a zero-write, zero-latency path for the large population.
 *
 *  - `sd1.` STORED — organizers and admins. Opaque random bytes; only
 *    `sha256(raw + AUTH_SECRET)` is persisted (see `store.ts`), which makes the
 *    link single-use and revocable.
 *
 * The prefix declares which VERIFICATION PATH to take, never which PRIVILEGE to
 * grant: `verifyEmailSignInToken` re-derives the tier from the identity at
 * redemption and refuses a stateless token for a stored-tier identity. So a
 * downgrade cannot be induced by presenting a differently-prefixed token, and
 * an attacker cannot forge either prefix without `AUTH_SECRET`.
 */

/** Version-tagged prefixes. Bumping the digit invalidates every live link. */
export const STATELESS_TOKEN_PREFIX = 'st1.'
export const STORED_TOKEN_PREFIX = 'sd1.'

/**
 * Domain separation for the stateless HMAC. Without a label, the same
 * `AUTH_SECRET` signing a different payload family could be cross-used; the
 * label makes a signature meaningless outside this feature.
 */
const HMAC_LABEL = 'konf.email-link.stateless.v1'

export interface StatelessTokenPayload {
  /** Normalized email address (the identifier). */
  e: string
  /** Audience: the tenant HOST the link was minted on (lowercase, no port). */
  a: string
  /** Expiry, epoch SECONDS. */
  x: number
  /** Nonce, so two links for the same address in the same second differ. */
  n: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input as never)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * The signing secret. Read lazily (never at module load) so a missing value is
 * an error at USE time on the auth path rather than a boot-time crash of every
 * route that transitively imports this file.
 */
function requireSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set; email sign-in links are disabled')
  }
  return secret
}

function sign(data: string, secret: string): string {
  return base64url(
    createHmac('sha256', secret).update(`${HMAC_LABEL}|${data}`).digest(),
  )
}

/** Constant-time string comparison that never leaks length via early return. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the fast path is not observably shorter.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

/**
 * Mint a stateless, self-verifying token. `identifier` must already be
 * normalized and `audienceHost` must already be canonical (see `origin.ts`).
 */
export function mintStatelessToken(
  identifier: string,
  audienceHost: string,
  ttlSeconds: number,
  now: number = Date.now(),
): string {
  const payload: StatelessTokenPayload = {
    e: identifier,
    a: audienceHost,
    x: Math.floor(now / 1000) + ttlSeconds,
    n: randomBytes(8).toString('hex'),
  }
  const body = base64url(JSON.stringify(payload))
  return `${STATELESS_TOKEN_PREFIX}${body}.${sign(body, requireSecret())}`
}

export type StatelessVerification =
  | { ok: true; identifier: string; audience: string }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'audience' }

/**
 * Verify a stateless token against the host it is being redeemed on.
 *
 * ORDER MATTERS: the signature is checked BEFORE anything in the payload is
 * trusted, so expiry and audience are only ever read from a payload we minted.
 */
export function verifyStatelessToken(
  token: string,
  currentHost: string,
  now: number = Date.now(),
): StatelessVerification {
  if (!token.startsWith(STATELESS_TOKEN_PREFIX)) {
    return { ok: false, reason: 'malformed' }
  }
  const rest = token.slice(STATELESS_TOKEN_PREFIX.length)
  const dot = rest.lastIndexOf('.')
  if (dot <= 0 || dot === rest.length - 1) {
    return { ok: false, reason: 'malformed' }
  }
  const body = rest.slice(0, dot)
  const signature = rest.slice(dot + 1)

  let secret: string
  try {
    secret = requireSecret()
  } catch {
    return { ok: false, reason: 'signature' }
  }
  if (!safeEqual(signature, sign(body, secret))) {
    return { ok: false, reason: 'signature' }
  }

  let payload: StatelessTokenPayload
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (
    typeof payload?.e !== 'string' ||
    typeof payload?.a !== 'string' ||
    typeof payload?.x !== 'number' ||
    !payload.e ||
    !payload.a
  ) {
    return { ok: false, reason: 'malformed' }
  }

  if (payload.x * 1000 <= now) {
    return { ok: false, reason: 'expired' }
  }
  // ORIGIN BINDING: a link minted on tenant A must not authenticate on tenant B.
  if (payload.a !== currentHost) {
    return { ok: false, reason: 'audience' }
  }

  return { ok: true, identifier: payload.e, audience: payload.a }
}

/** Mint an opaque random token for the stored tier. */
export function mintStoredToken(): string {
  return `${STORED_TOKEN_PREFIX}${base64url(randomBytes(32))}`
}

/**
 * The at-rest form of a stored token: `sha256(raw + AUTH_SECRET)`.
 *
 * Salting with the app secret (rather than hashing the token alone) means an
 * attacker who exfiltrates the content lake still cannot brute-force or
 * rainbow-table a hash back to a redeemable link.
 */
export function hashStoredToken(rawToken: string): string {
  return createHash('sha256')
    .update(`${rawToken}${requireSecret()}`)
    .digest('hex')
}

/** Which verification path a raw token declares. */
export function tokenKind(token: string): 'stateless' | 'stored' | 'unknown' {
  if (token.startsWith(STATELESS_TOKEN_PREFIX)) return 'stateless'
  if (token.startsWith(STORED_TOKEN_PREFIX)) return 'stored'
  return 'unknown'
}

/**
 * A salted, non-reversible bucket key for rate-limit subjects (email / IP).
 * Used as the Sanity document id, so no address or IP is ever stored in the
 * content lake.
 */
export function rateLimitKey(scope: 'email' | 'ip', subject: string): string {
  const digest = createHash('sha256')
    .update(`konf.email-link.rate.v1|${scope}|${subject}|${requireSecret()}`)
    .digest('hex')
  return `emailSignInRate.${digest}`
}
