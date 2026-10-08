import { NextResponse } from 'next/server'

/**
 * A stand-in for `next/headers` in route-handler and server-action tests.
 *
 * Use it as the mock itself:
 *
 *     vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
 *
 * `cookies()` is the cookie store of a REAL `NextResponse`, so whatever the
 * code under test writes is serialized by Next's own cookie implementation and
 * can be read back as `Set-Cookie` lines with {@link writtenCookies}. That is
 * the same `ResponseCookies` class a route handler's store is built on; it is
 * NOT the route handler's store itself, so this shows how a cookie is
 * serialized, not how Next merges it into the outgoing response.
 */
const current = {
  response: NextResponse.next(),
  requestHeaders: new Headers(),
}

export const cookies = async () => current.response.cookies
export const headers = async () => current.requestHeaders

/** Start a new "request": a fresh cookie store and these request headers. */
export function beginRequest(requestHeaders: Headers = new Headers()): void {
  current.response = NextResponse.next()
  current.requestHeaders = requestHeaders
}

/** Put a cookie in the store as if the browser had sent it. */
export function presentCookie(name: string, value: string): void {
  current.response.cookies.set(name, value)
  // That line is the INCOMING cookie, not something the handler wrote.
  current.response.headers.delete('set-cookie')
}

/** Every `Set-Cookie` line written since {@link beginRequest}. */
export function writtenCookies(): string[] {
  return current.response.headers.getSetCookie()
}
