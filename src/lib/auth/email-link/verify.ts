import { consumeStoredToken } from './store'
import { resolveEmailLinkTier } from './tier'
import { tokenKind, verifyStatelessToken } from './token'

/**
 * REDEMPTION of an email sign-in link.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT AUTH.JS'S BUILT-IN EMAIL PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 * The obvious design — `next-auth/providers/resend` plus a minimal adapter — was
 * implemented against `@auth/core@0.41.3`'s actual source and rejected for two
 * verified, independent reasons:
 *
 * 1. CONFIGURING ANY ADAPTER REWRITES THE EXISTING OAUTH FLOW. `callback/index.js`
 *    calls `adapter.getUserByAccount(...)` unconditionally when an adapter is
 *    present, and `handle-login.js` short-circuits to `{ user: _profile }` ONLY
 *    when `!adapter`. With one configured, every GitHub/LinkedIn sign-in is
 *    routed through Auth.js's own account-linking logic, which throws
 *    `OAuthAccountNotLinked` whenever a user with the same email already exists
 *    under a different provider — the exact case this repo deliberately handles
 *    by linking on the verified-email match-set in `getOrCreateSpeaker`. The
 *    adapter's mere presence would therefore break returning users and worsen
 *    #267. The required adapter methods (`assert.js`: `createVerificationToken`,
 *    `useVerificationToken`, `getUserByEmail`) are only the ASSERTED set; the
 *    email path additionally calls `getUser`, `updateUser` and `createUser` at
 *    runtime, and the OAuth path calls `getUserByAccount` and `linkAccount`.
 *
 * 2. THE STATELESS TIER IS UNIMPLEMENTABLE ON THAT CONTRACT. `useVerificationToken`
 *    receives `{ identifier, token: sha256(rawToken + secret) }` and no request
 *    context (`callback/index.js`). A self-describing token cannot be verified
 *    from its own hash, so a tokenless tier can only be built by smuggling the
 *    raw token to the adapter out of band. That is a worse contract violation
 *    than not using the contract.
 *
 * So email sign-in is a CREDENTIALS provider whose `authorize` calls this
 * module. Credentials + JWT needs no adapter (`assert.js` only requires one for
 * `type: "email"`, database sessions or WebAuthn), so the OAuth path is byte-for
 * -byte unchanged, and this file owns the whole verification decision in one
 * readable place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS CHECKED, IN ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Shape/prefix — which verification path the token declares.
 *  2. Cryptographic validity — HMAC (stateless) or a hash hit on an unconsumed
 *     document (stored). Nothing in a token is trusted before this.
 *  3. Expiry.
 *  4. ORIGIN — the token's minting host must equal the host it is redeemed on.
 *  5. TIER RE-DERIVATION — the identity's CURRENT tier is recomputed and a
 *     stateless token is refused for a stored-tier identity. This is what stops
 *     a link minted before a promotion (or under a stale tier read) from giving
 *     a privileged account replay-able access.
 *
 * Every failure returns the same opaque shape to the caller; the `reason` is for
 * server-side logging only and is never rendered or redirected with.
 */

export type VerifyResult =
  | { ok: true; identifier: string; tier: 'stateless' | 'stored' }
  | {
      ok: false
      reason:
        | 'malformed'
        | 'signature'
        | 'expired'
        | 'audience'
        | 'not-found'
        | 'race'
        | 'error'
        | 'tier-mismatch'
    }

export async function verifyEmailSignInToken(
  rawToken: string | null | undefined,
  currentHost: string | null | undefined,
  now: number = Date.now(),
): Promise<VerifyResult> {
  if (!rawToken || !currentHost) return { ok: false, reason: 'malformed' }

  const kind = tokenKind(rawToken)

  if (kind === 'stateless') {
    const verified = verifyStatelessToken(rawToken, currentHost, now)
    if (!verified.ok) return { ok: false, reason: verified.reason }

    // TIER RE-DERIVATION. `resolveEmailLinkTier` fails safe to `stored`, so a
    // Sanity outage during redemption refuses stateless tokens rather than
    // accepting one for an identity that may since have become privileged.
    const tier = await resolveEmailLinkTier(verified.identifier)
    if (tier === 'stored') return { ok: false, reason: 'tier-mismatch' }

    return { ok: true, identifier: verified.identifier, tier: 'stateless' }
  }

  if (kind === 'stored') {
    const consumed = await consumeStoredToken(rawToken, now)
    if (!consumed.ok) return { ok: false, reason: consumed.reason }
    // ORIGIN BINDING for the stored tier: the document records the minting
    // host. Checked AFTER the consume so a cross-origin replay attempt still
    // burns the single-use token instead of leaving it live.
    if (consumed.origin !== currentHost) {
      return { ok: false, reason: 'audience' }
    }
    return { ok: true, identifier: consumed.identifier, tier: 'stored' }
  }

  return { ok: false, reason: 'malformed' }
}
