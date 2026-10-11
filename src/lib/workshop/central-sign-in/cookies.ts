/**
 * A cookie of the central workshop sign-in (#1311), on the host that sets it
 * and nowhere else. `__Host-` makes the browser refuse a `Domain`, so no
 * sibling host under a shared suffix can set or replace it, and nothing in the
 * environment can widen it. The prefix needs `Secure`, which a browser may not
 * store over plain HTTP, so a development server gets neither. `NODE_ENV` is
 * `production` in every deployed build, previews included.
 */
export function hostCookie(name: string): HostCookie {
  const secure = process.env.NODE_ENV !== 'development'
  return {
    name: secure ? `__Host-${name}` : name,
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
    },
  }
}

export interface HostCookie {
  name: string
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/' }
}

/**
 * Remove `cookie` from the browser. Set, not delete: a `__Host-` cookie is
 * only replaced by one that is `Secure` with `Path=/`, exactly as written.
 */
export function clearCookie(
  store: { set(name: string, value: string, options: object): unknown },
  cookie: HostCookie,
): void {
  store.set(cookie.name, '', { ...cookie.options, maxAge: 0 })
}
