import crypto from 'crypto'

/**
 * Stateless HMAC-SHA256 bearer token for one-click volunteer attendance
 * confirmation: `base64url(JSON payload).base64url(HMAC)`.
 *
 * Mirrors `src/lib/organizer-invite/token.ts`:
 * 1. Verified before reading Sanity so forged/truncated tokens are rejected
 *    without a database round trip.
 * 2. Domain-separated (`konf.volunteer-confirm.v1`) and constant-time compared
 *    via `crypto.timingSafeEqual`.
 * 3. Binds `volunteerId`, `conferenceId`, and `email` so a token minted for
 *    one tenant or volunteer cannot confirm another, nor survive if an
 *    organizer later reassigns the volunteer's email address.
 */

const HMAC_LABEL = 'konf.volunteer-confirm.v1'

export interface VolunteerConfirmTokenPayload {
  volunteerId: string
  conferenceId: string
  email: string
}

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

export function mintVolunteerConfirmToken(
  payload: VolunteerConfirmTokenPayload,
): string {
  const normalized: VolunteerConfirmTokenPayload = {
    volunteerId: payload.volunteerId,
    conferenceId: payload.conferenceId,
    email: payload.email.trim().toLowerCase(),
  }
  const data = JSON.stringify(normalized)
  return `${Buffer.from(data).toString('base64url')}.${sign(data)}`
}

export type VolunteerConfirmTokenVerification =
  | { ok: true; payload: VolunteerConfirmTokenPayload }
  | { ok: false; reason: 'malformed' | 'signature' }

export function verifyVolunteerConfirmToken(
  raw: string | null | undefined,
): VolunteerConfirmTokenVerification {
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
  const { volunteerId, conferenceId, email } =
    parsed as Partial<VolunteerConfirmTokenPayload>
  if (
    typeof volunteerId !== 'string' ||
    volunteerId.length === 0 ||
    typeof conferenceId !== 'string' ||
    conferenceId.length === 0 ||
    typeof email !== 'string' ||
    email.length === 0
  ) {
    return { ok: false, reason: 'malformed' }
  }

  return {
    ok: true,
    payload: {
      volunteerId,
      conferenceId,
      email: email.trim().toLowerCase(),
    },
  }
}
