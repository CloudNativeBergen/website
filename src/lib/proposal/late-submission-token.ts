import crypto from 'crypto'

/**
 * Time-limited link that lets a speaker submit after the CFP has closed (#249).
 * `base64url(JSON payload).base64url(HMAC)`, the same shape and secret as
 * `src/lib/volunteer/token.ts`, under a label of its own.
 *
 * The payload binds the conference (so a link for one tenant is refused on
 * another's host), an expiry checked on every use, and optionally an email the
 * signed-in speaker must match. Nothing is stored: the link cannot be revoked
 * before it expires, so keep the expiry short.
 */

const HMAC_LABEL = 'konf.late-submission.v1'

interface LateSubmissionPayload {
  conferenceId: string
  /** Expiry, ms since epoch. */
  exp: number
  email?: string
}

function sign(data: string): string {
  const secret = process.env.INVITATION_TOKEN_SECRET
  if (!secret) {
    throw new Error('INVITATION_TOKEN_SECRET environment variable is not set.')
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${HMAC_LABEL}.${data}`)
    .digest('base64url')
}

export function mintLateSubmissionToken(
  payload: LateSubmissionPayload,
): string {
  const email = payload.email?.trim().toLowerCase()
  const data = JSON.stringify({
    conferenceId: payload.conferenceId,
    exp: payload.exp,
    ...(email ? { email } : {}),
  })
  return `${Buffer.from(data).toString('base64url')}.${sign(data)}`
}

/**
 * True only when the token is untampered, unexpired, minted for
 * `conferenceId`, and — if it names an email — `email` matches it.
 */
export function isLateSubmissionAllowed(
  raw: string | null | undefined,
  {
    conferenceId,
    email,
    now = Date.now(),
  }: { conferenceId: string; email?: string | null; now?: number },
): boolean {
  if (!raw || typeof raw !== 'string') return false
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return false
  const data = Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8')
  const a = Buffer.from(raw.slice(dot + 1))
  const b = Buffer.from(sign(data))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false

  let payload: Partial<LateSubmissionPayload>
  try {
    payload = JSON.parse(data)
  } catch {
    return false
  }
  if (typeof payload.exp !== 'number' || now > payload.exp) return false
  if (!conferenceId || payload.conferenceId !== conferenceId) return false
  if (
    payload.email !== undefined &&
    payload.email !== email?.trim().toLowerCase()
  ) {
    return false
  }
  return true
}
