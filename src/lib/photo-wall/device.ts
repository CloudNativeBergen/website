/**
 * THE DEVICE COOKIE (Photo Wall spec §6.1), the Feedback pattern
 * (`src/lib/feedback/device.ts`): `base64url(JSON payload).base64url(HMAC)`
 * over a random 128-bit token and its issue time, signed with
 * `INVITATION_TOKEN_SECRET` under a label of its own, so no other cookie the
 * secret signs can pass for one of these. A cookie whose signature does not
 * verify is treated as absent, never as an error.
 *
 * Posts store the DEVICE KEY, a hash of the token, never the token: a dataset
 * read cannot impersonate a phone. The cookie lives until the end of the
 * wall's deletion date (§11.1), by the browser's `Expires`; the server does
 * not re-check that date here, because from the deletion date on the wall is
 * closed to writes anyway (`closedAt`, §11.1).
 */
import 'server-only'
import crypto from 'crypto'

const COOKIE_LABEL = 'konf.wall-device.v1'

export const WALL_DEVICE_COOKIE = 'konf_wall'

/**
 * httpOnly, `SameSite=Lax`, `Path=/wall`, host-only (no `Domain`), `Secure`
 * outside development, expiring at `expires`: the end of the deletion date
 * (`deletionDateEnd()`). Everything that needs the cookie lives under
 * `/wall`; `/api/trpc` never receives it.
 */
export function wallDeviceCookie(expires: Date) {
  return {
    name: WALL_DEVICE_COOKIE,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax',
      path: '/wall',
      expires,
    },
  } as const
}

export interface WallDevice {
  /** The random token, base64url. Never stored. */
  token: string
  /** The first 32 hex characters of SHA-256 over the token: what posts store. */
  key: string
}

function requireSecret(): string {
  const secret = process.env.INVITATION_TOKEN_SECRET
  if (!secret) {
    throw new Error('INVITATION_TOKEN_SECRET environment variable is not set.')
  }
  return secret
}

const sign = (data: string): Buffer =>
  crypto
    .createHmac('sha256', requireSecret())
    .update(`${COOKIE_LABEL}.${data}`)
    .digest()

export function wallDeviceKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)
}

/** A new device: its token and key, and the cookie value to set. */
export function issueWallDevice(now: Date = new Date()): WallDevice & {
  value: string
} {
  const token = crypto.randomBytes(16).toString('base64url')
  const data = JSON.stringify({
    t: token,
    at: Math.floor(now.getTime() / 1000),
  })
  const value = `${Buffer.from(data).toString('base64url')}.${sign(data).toString('base64url')}`
  return { token, key: wallDeviceKey(token), value }
}

/**
 * The device a cookie stands for, or `null`: missing, malformed, or not
 * signed by this server.
 */
export function readWallDevice(
  raw: string | null | undefined,
): WallDevice | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const data = Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8')
  const signature = Buffer.from(raw.slice(dot + 1), 'base64url')
  const expected = sign(data)
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(signature, expected)
  ) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const { t, at } = (parsed ?? {}) as Record<string, unknown>
  if (typeof t !== 'string' || t.length === 0 || typeof at !== 'number') {
    return null
  }
  return { token: t, key: wallDeviceKey(t) }
}
