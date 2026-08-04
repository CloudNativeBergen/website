import { isServedTenantHost } from './audience'
import { consumeStoredToken, findStoredToken } from './store'
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
 *  0. AUDIENCE ALLOWLIST — the host this is being redeemed on must be one the
 *     platform actually serves. `currentHost` is derived from
 *     `x-forwarded-host`; without this, step 4 compares an attacker-supplied
 *     value against an attacker-supplied value and proves nothing (see
 *     `audience.ts` and the warning on `requestHost` in `origin.ts`). Checked
 *     FIRST, and before the stored-tier consume, so a spoofed header cannot burn
 *     a legitimate user's single-use link.
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

  // Step 0 — see the header comment. Fails closed on a Sanity read error.
  if (!(await isServedTenantHost(currentHost))) {
    return { ok: false, reason: 'audience' }
  }

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

/**
 * Read a token's identifier WITHOUT consuming it — for the confirmation
 * interstitial only (`/signin/confirm`), so the page can tell the user which
 * address they are about to be signed in as.
 *
 * SIDE-EFFECT FREE by construction: the stateless path is pure verification and
 * the stored path is a read, never the `ifRevisionId` consume. That matters —
 * rendering an interstitial must not burn a single-use link, otherwise merely
 * navigating a victim to the URL would destroy their real link.
 *
 * It performs the SAME audience, signature and expiry checks as redemption, so
 * it can never display an identity from a token that would not be accepted.
 * The tier re-derivation is deliberately NOT repeated here: it is a role lookup
 * with no bearing on what to display, and redemption re-runs it anyway.
 */
export async function peekEmailSignInToken(
  rawToken: string | null | undefined,
  currentHost: string | null | undefined,
  now: number = Date.now(),
): Promise<{ ok: true; identifier: string } | { ok: false }> {
  if (!rawToken || !currentHost) return { ok: false }
  if (!(await isServedTenantHost(currentHost))) return { ok: false }

  const kind = tokenKind(rawToken)
  if (kind === 'stateless') {
    const verified = verifyStatelessToken(rawToken, currentHost, now)
    return verified.ok
      ? { ok: true, identifier: verified.identifier }
      : { ok: false }
  }
  if (kind === 'stored') {
    const doc = await findStoredToken(rawToken)
    if (!doc) return { ok: false }
    if (doc.origin !== currentHost) return { ok: false }
    const expiresAt = Date.parse(doc.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return { ok: false }
    return { ok: true, identifier: doc.identifier }
  }
  return { ok: false }
}
