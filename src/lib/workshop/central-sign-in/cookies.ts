/**
 * A cookie of the central workshop sign-in (#1311), on the host that sets it
 * and nowhere else. `__Host-` makes the browser refuse a `Domain`, so no
 * sibling host under a shared suffix can set or replace it, and nothing in the
 * environment can widen it. The prefix needs `Secure`, which a browser may not
 * store over plain HTTP, so a development server gets neither. `NODE_ENV` is
 * `production` in every deployed build, previews included.
 */
export function hostCookie(name: string) {
  const secure = process.env.NODE_ENV !== 'development'
  return {
    name: secure ? `__Host-${name}` : name,
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
    },
  } as const
}
