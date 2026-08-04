import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { v4 as randomUUID } from 'uuid'
import { EMAIL_SIGN_IN_TOKEN_TYPE } from './constants'
import { hashStoredToken } from './token'

/**
 * The STORED-tier token store, backed by Sanity.
 *
 * Only privileged identities reach this module, so the write volume is a
 * handful of documents per conference per month — negligible against the
 * document budget, and the reason no new datastore vendor was introduced.
 *
 * WHAT IS AT REST: `sha256(rawToken + AUTH_SECRET)`, the identifier, the minting
 * host and two timestamps. The raw token exists only in the recipient's
 * mailbox, so a Studio viewer or a leaked READ token cannot redeem anything.
 *
 * READS ARE UNCACHED. `clientReadUncached` is mandatory here: a CDN-cached read
 * could serve a pre-consume snapshot and make a single-use token redeemable
 * twice. This mirrors `authz/platform.ts`, which uses the uncached client for
 * the same reason.
 */

interface StoredTokenDoc {
  _id: string
  _rev: string
  identifier: string
  origin: string
  expiresAt: string
  consumedAt?: string
}

// groq-global: platform-internal identity artifact, deliberately not tenant-scoped
const FIND_BY_HASH = groq`*[_type == $type && tokenHash == $hash && !defined(consumedAt)][0]{
  _id, _rev, identifier, origin, expiresAt, consumedAt
}`

/**
 * Persist a stored-tier token, replacing any link already outstanding for the
 * same address.
 *
 * ONE LIVE LINK PER ADDRESS is both a UX property (the newest link is the one
 * that works, which is what a user who clicked "resend" expects) and an abuse
 * cap: the document count for a given address can never exceed one regardless
 * of how many requests get past the rate limiter.
 */
export async function createStoredToken(params: {
  identifier: string
  rawToken: string
  origin: string
  expiresAt: Date
}): Promise<{ ok: boolean }> {
  const { identifier, rawToken, origin, expiresAt } = params
  try {
    await clientWrite.delete({
      // groq-global: platform-internal identity artifact, deliberately not tenant-scoped
      query: groq`*[_type == $type && identifier == $identifier]`,
      params: { type: EMAIL_SIGN_IN_TOKEN_TYPE, identifier },
    })

    await clientWrite.create({
      _id: randomUUID(),
      _type: EMAIL_SIGN_IN_TOKEN_TYPE,
      identifier,
      tokenHash: hashStoredToken(rawToken),
      origin,
      expiresAt: expiresAt.toISOString(),
    })
    return { ok: true }
  } catch (error) {
    // Never surface the token or the address in the log line.
    console.error('[email-link] failed to persist a stored-tier token', error)
    return { ok: false }
  }
}

/**
 * Look a stored token up WITHOUT consuming it.
 *
 * Exists for the confirmation interstitial, which must be able to name the
 * address a link belongs to while remaining side-effect free — rendering a page
 * may never burn a single-use link. Nothing on the authentication path uses it;
 * `consumeStoredToken` is the only thing that grants a session.
 */
export async function findStoredToken(
  rawToken: string,
): Promise<{ identifier: string; origin: string; expiresAt: string } | null> {
  try {
    const doc = await clientReadUncached.fetch<StoredTokenDoc | null>(
      FIND_BY_HASH,
      { type: EMAIL_SIGN_IN_TOKEN_TYPE, hash: hashStoredToken(rawToken) },
      { cache: 'no-store' },
    )
    if (!doc?._id) return null
    return {
      identifier: doc.identifier,
      origin: doc.origin,
      expiresAt: doc.expiresAt,
    }
  } catch (error) {
    console.error('[email-link] stored-token peek failed', error)
    return null
  }
}

export type ConsumeResult =
  | { ok: true; identifier: string; origin: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'race' | 'error' }

/**
 * Atomically consume a stored-tier token.
 *
 * SINGLE-USE VIA REVISION-CONDITIONED WRITE. Sanity has no atomic
 * get-and-delete, so the consume is a two-step: fetch the document (uncached,
 * and only if `consumedAt` is unset), then patch it with `ifRevisionId(_rev)`.
 * The patch is a compare-and-swap — if a concurrent redeemer patched first, the
 * revision has moved and this call fails with a 409, so exactly ONE of N
 * simultaneous redemptions can win. The losers return `race`, which the caller
 * treats identically to an invalid token.
 *
 * The document is then deleted best-effort. Deletion is NOT what enforces
 * single use — `consumedAt` plus the `!defined(consumedAt)` filter already do —
 * so a failed delete degrades to a row the nightly cleanup removes, never to a
 * redeemable link.
 */
export async function consumeStoredToken(
  rawToken: string,
  now: number = Date.now(),
): Promise<ConsumeResult> {
  let doc: StoredTokenDoc | null
  try {
    doc = await clientReadUncached.fetch<StoredTokenDoc | null>(
      FIND_BY_HASH,
      { type: EMAIL_SIGN_IN_TOKEN_TYPE, hash: hashStoredToken(rawToken) },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('[email-link] stored-token lookup failed', error)
    return { ok: false, reason: 'error' }
  }

  if (!doc?._id) return { ok: false, reason: 'not-found' }

  // Expiry is checked BEFORE the consume so an expired document is left for the
  // cleanup pass rather than being marked consumed by a failed attempt.
  const expiresAt = Date.parse(doc.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, reason: 'expired' }
  }

  try {
    await clientWrite
      .patch(doc._id)
      .ifRevisionId(doc._rev)
      .set({ consumedAt: new Date(now).toISOString() })
      .commit({ visibility: 'sync' })
  } catch {
    // 409 (revision moved) or any other write failure: refuse the redemption.
    // Deliberately not logged with detail — a lost race is normal contention,
    // and the log line must not become an oracle for token guessing.
    return { ok: false, reason: 'race' }
  }

  // Best-effort cleanup; single-use is already enforced above.
  try {
    await clientWrite.delete(doc._id)
  } catch {
    // Left for the nightly cleanup.
  }

  return { ok: true, identifier: doc.identifier, origin: doc.origin }
}

/**
 * Delete every stored token whose expiry has passed (consumed or not). Ridden
 * by the nightly cleanup cron; returns the number of documents removed.
 */
export async function deleteExpiredEmailSignInTokens(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  try {
    const result = await clientWrite.delete({
      // groq-global: platform-internal identity artifact, deliberately not tenant-scoped
      query: groq`*[_type == $type && expiresAt < $now]`,
      params: {
        type: EMAIL_SIGN_IN_TOKEN_TYPE,
        now: new Date(now).toISOString(),
      },
    })
    return { deleted: result?.results?.length ?? 0 }
  } catch (error) {
    console.error('[email-link] failed to clean up expired tokens', error)
    return { deleted: 0 }
  }
}
