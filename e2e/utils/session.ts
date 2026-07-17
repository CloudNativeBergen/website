import { encode } from 'next-auth/jwt'

/**
 * Mints a REAL NextAuth session cookie the running app will accept — the same
 * `encode` the app uses, keyed on the app's `AUTH_SECRET`. This authenticates
 * the browser WITHOUT a live OAuth round-trip, and (unlike the app's global
 * test-mode bypass) leaves an un-cookied context genuinely unauthenticated, so
 * the sign-in redirect is still testable.
 *
 * `@auth/core` names the session cookie `__Secure-authjs.session-token` over
 * https and the bare `authjs.session-token` over http, and salt === cookie name.
 * We derive both (plus the cookie domain) from `E2E_BASE_URL` so the harness
 * works against http://localhost (default) OR an https / non-localhost target.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const IS_HTTPS = new URL(BASE_URL).protocol === 'https:'

export const SESSION_COOKIE_NAME = IS_HTTPS
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token'
/** Cookie domain the app is served from (so the cookie is actually sent). */
export const COOKIE_DOMAIN = new URL(BASE_URL).hostname
/** Whether the cookie must be marked Secure (https only). */
export const COOKIE_SECURE = IS_HTTPS
const SALT = SESSION_COOKIE_NAME

export interface E2ESpeaker {
  sub: string
  speakerId: string
  slug: string
  name: string
  email: string
  isOrganizer: boolean
}

/** The speaker the minted session represents. Override via env to point at a
 *  real seeded speaker in your dataset (needed for pages that load the speaker
 *  from Sanity by id, e.g. the dashboard's proposals list). */
export function e2eSpeaker(): E2ESpeaker {
  return {
    sub: process.env.E2E_SPEAKER_SUB ?? 'e2e-sub',
    speakerId: process.env.E2E_SPEAKER_ID ?? 'e2e-speaker',
    slug: process.env.E2E_SPEAKER_SLUG ?? 'e2e-speaker',
    name: process.env.E2E_SPEAKER_NAME ?? 'E2E Speaker',
    email: process.env.E2E_SPEAKER_EMAIL ?? 'e2e@example.com',
    isOrganizer: process.env.E2E_SPEAKER_IS_ORGANIZER === 'true',
  }
}

/**
 * Encode a session token whose shape matches what the app's `jwt`/`session`
 * callbacks require. IMPORTANT: the app's `jwt` callback returns `{}` (→ signed
 * out) when a read token lacks `account` AND `speaker`, so BOTH must be present;
 * `slug`/`image` mirror `applySpeakerToToken` so slug-gated UI (e.g. the "View
 * public profile" link) renders.
 */
export async function mintSessionToken(
  speaker: E2ESpeaker = e2eSpeaker(),
): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error(
      'AUTH_SECRET must be set (e.g. in .env.local) to mint an e2e session cookie',
    )
  }

  return encode({
    salt: SALT,
    secret,
    maxAge: 60 * 60, // 1 hour is plenty for a test run
    token: {
      sub: speaker.sub,
      name: speaker.name,
      email: speaker.email,
      picture: 'https://example.com/avatar.png',
      speaker: {
        _id: speaker.speakerId,
        slug: speaker.slug,
        name: speaker.name,
        email: speaker.email,
        image: undefined,
        isOrganizer: speaker.isOrganizer,
        flags: [],
      },
      account: {
        provider: 'github',
        providerAccountId: 'e2e-123',
        type: 'oauth',
      },
    },
  })
}
