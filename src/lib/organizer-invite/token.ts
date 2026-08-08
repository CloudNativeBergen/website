import crypto from 'crypto'
import type { OrganizerInviteTokenPayload } from './types'

/**
 * The organizer-invitation bearer token: `base64url(JSON payload).base64url(HMAC)`,
 * the same shape as the co-speaker invitation token (`src/lib/cospeaker/server.ts`)
 * with two deliberate hardenings, because this token opens an admin grant:
 *
 *  1. **It is actually VERIFIED.** `createInvitationToken` has no verifier at all —
 *     the co-speaker flow signs the payload, stores the whole string on the
 *     document, and then looks the document up by exact string match, so the
 *     signature never participates in a decision. Here {@link verifyOrganizerInviteToken}
 *     checks it before anything reads Sanity, so a forged or truncated token is
 *     refused without a database round trip.
 *  2. **Domain separation + constant-time compare.** The HMAC covers a label, so
 *     a token minted for one purpose cannot be replayed as another even under a
 *     shared secret, and `timingSafeEqual` removes the byte-at-a-time oracle.
 *
 * Verifying the signature is NOT the security boundary and must not be mistaken
 * for one — a valid token proves only that this platform minted it, and
 * invitation mail is forwarded. Ownership is proved by an email magic-link
 * sign-in to the invited address at accept time.
 *
 * The secret is `INVITATION_TOKEN_SECRET`, already provisioned for the
 * co-speaker flow (`fnox.toml`, `vitest.setup.ts`, `.github/workflows/pr-checks.yml`)
 * and surfaced by the system-status checks.
 */

const HMAC_LABEL = 'konf.organizer-invite.v1'

function requireSecret(): string {
  const secret = process.env.INVITATION_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      'INVITATION_TOKEN_SECRET environment variable is not set. ' +
        'Please set this environment variable to a secure random value.',
    )
  }
  return secret
}

function sign(data: string): string {
  return crypto
    .createHmac('sha256', requireSecret())
    .update(`${HMAC_LABEL}.${data}`)
    .digest('base64url')
}

export function mintOrganizerInviteToken(
  payload: OrganizerInviteTokenPayload,
): string {
  const data = JSON.stringify(payload)
  return `${Buffer.from(data).toString('base64url')}.${sign(data)}`
}

export type OrganizerInviteTokenVerification =
  | { ok: true; payload: OrganizerInviteTokenPayload }
  | { ok: false; reason: 'malformed' | 'signature' }

/**
 * Verify a presented token. Deliberately does NOT check expiry: expiry lives on
 * the invitation document and is enforced AFTER the ownership check, so a
 * non-invitee holding a leaked token cannot learn whether it has expired (the
 * ordering the co-speaker `respond` procedure established).
 */
export function verifyOrganizerInviteToken(
  raw: string | null | undefined,
): OrganizerInviteTokenVerification {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'malformed' }
  const dot = raw.lastIndexOf('.')
  if (dot <= 0 || dot === raw.length - 1) {
    return { ok: false, reason: 'malformed' }
  }
  const encodedPayload = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)

  let data: string
  try {
    data = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const expected = sign(data)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'malformed' }
  }
  const { docId, invitedEmail, expiresAt } =
    parsed as Partial<OrganizerInviteTokenPayload>
  if (
    typeof docId !== 'string' ||
    docId.length === 0 ||
    typeof invitedEmail !== 'string' ||
    invitedEmail.length === 0 ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return { ok: false, reason: 'malformed' }
  }

  return { ok: true, payload: { docId, invitedEmail, expiresAt } }
}

/** Constant-time equality for two bearer strings. */
export function tokensMatch(
  presented: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (!presented || !stored) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(stored)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
