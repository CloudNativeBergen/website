/** How long a started sign-in may take to come back from WorkOS. */
export const START_TTL_SECONDS = 600

/**
 * The auth host's cookie between start and callback. `__Host-` makes the
 * browser refuse a `Domain`, so no sibling host under a shared suffix can set
 * or replace it. The prefix needs `Secure`, so a plain-HTTP auth origin
 * (development only, see `./decision`) gets neither.
 */
export function startCookie(authOrigin: string) {
  const secure = authOrigin.startsWith('https://')
  return {
    name: secure ? '__Host-workshop-auth-start' : 'workshop-auth-start',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
    },
  } as const
}
