// Shared with the NextAuth sign-out handler, which cannot import the
// server-only identity-handoff module (it imports `@/lib/auth`).

/** Host-only, https-only, never readable from script. */
export const IDENTITY_SESSION_COOKIE = '__Host-konf.session'
export const IDENTITY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const
