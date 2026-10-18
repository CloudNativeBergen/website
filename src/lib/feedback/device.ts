/**
 * THE DEVICE COOKIE AND THE RESPONSE ID (speaker feedback spec §7.3).
 *
 * The cookie is `base64url(JSON payload).base64url(HMAC)`, as
 * `src/lib/volunteer/token.ts`: a random 128-bit token, the time of the last
 * answer, and the talks this device has answered. A talk is listed as a
 * truncated HMAC of its id, never the id, and only the
 * {@link MAX_ANSWERED_TALKS} most recent are kept, so the cookie stays well
 * under the 4 KB a browser accepts: past it the `Set-Cookie` is dropped
 * silently, and the answer could never be shown or deleted.
 *
 * Signed with `INVITATION_TOKEN_SECRET` under labels of its own, so no other
 * token the secret signs can pass for one of these. The 30 days are enforced
 * HERE, from the signed time, not only by the browser's `Max-Age`.
 */
import 'server-only'
import crypto from 'crypto'

const COOKIE_LABEL = 'konf.feedback-device.v1'
const TALK_LABEL = 'konf.feedback-talk.v1'

/** 30 days after the last answer (§7.3, §8). */
export const DEVICE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60
export const MAX_ANSWERED_TALKS = 100

/**
 * httpOnly, `SameSite=Lax`, `Path=/f`, host-only (no `Domain`). Not a
 * `__Host-` cookie: that prefix requires `Path=/` (§7.3).
 */
export function deviceCookie() {
  return {
    name: 'konf_feedback',
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax',
      path: '/f',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    },
  } as const
}

export interface Device {
  token: string
  /** Truncated HMACs of the answered talks' ids, most recent first. */
  answered: string[]
}

function requireSecret(): string {
  const secret = process.env.INVITATION_TOKEN_SECRET
  if (!secret) {
    throw new Error('INVITATION_TOKEN_SECRET environment variable is not set.')
  }
  return secret
}

function hmac(label: string, data: string): Buffer {
  return crypto
    .createHmac('sha256', requireSecret())
    .update(`${label}.${data}`)
    .digest()
}

const talkEntry = (talkId: string) =>
  hmac(TALK_LABEL, talkId).subarray(0, 8).toString('base64url')

/**
 * The id of this device's response about this talk: the same device and talk
 * always give the same document, so a second tap changes the answer.
 */
export function feedbackResponseId(token: string, talkId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${token}:${talkId}`)
    .digest('hex')
  return `feedbackResponse-${hash.slice(0, 32)}`
}

export function answeredOn(device: Device, talkId: string): boolean {
  return device.answered.includes(talkEntry(talkId))
}

/**
 * The device a cookie stands for, or `null`: missing, malformed, not signed
 * by this server, or more than 30 days past its last answer. `null` means
 * "no response from this device", never an error.
 */
export function readDeviceCookie(
  raw: string | null | undefined,
  now: Date,
): Device | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const data = Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8')
  const signature = Buffer.from(raw.slice(dot + 1), 'base64url')
  const expected = hmac(COOKIE_LABEL, data)
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
  const { t, at, l } = (parsed ?? {}) as Record<string, unknown>
  if (
    typeof t !== 'string' ||
    typeof at !== 'number' ||
    !Array.isArray(l) ||
    !l.every((entry) => typeof entry === 'string')
  ) {
    return null
  }
  if (now.getTime() / 1000 - at > DEVICE_COOKIE_MAX_AGE) return null
  return { token: t, answered: l }
}

/**
 * The cookie after this device answers `talkId` at `now`: the same token (a
 * new one when there is no valid device), the talk at the front of the list,
 * and the 30 days restarted.
 */
export function recordAnswer(
  device: Device | null,
  talkId: string,
  now: Date,
): { device: Device; value: string } {
  const entry = talkEntry(talkId)
  const next: Device = {
    token: device?.token ?? crypto.randomBytes(16).toString('base64url'),
    answered: [
      entry,
      ...(device?.answered ?? []).filter((e) => e !== entry),
    ].slice(0, MAX_ANSWERED_TALKS),
  }
  const data = JSON.stringify({
    t: next.token,
    at: Math.floor(now.getTime() / 1000),
    l: next.answered,
  })
  const signature = hmac(COOKIE_LABEL, data).toString('base64url')
  return {
    device: next,
    value: `${Buffer.from(data).toString('base64url')}.${signature}`,
  }
}
