import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { expect } from 'vitest'
import { GET as signInRoute } from '@/app/(workshop)/workshop/sign-in/route'
import { GET as startRoute } from '@/app/api/auth/workshop/start/route'
import { GET as callbackRoute } from '@/app/api/auth/callback/route'

/**
 * A workshop sign-in as a browser carries it through the REAL routes (#1311):
 * the tenant host's sign-in route, the auth host's start route and its
 * callback. A suite that imports this mocks the boundaries itself (the record
 * read, the feature gate, WorkOS's token endpoint); nothing here is a stand-in.
 */

function get(url: string | URL, host: string, cookie?: string | null) {
  const headers = new Headers({ host })
  if (cookie) headers.set('cookie', cookie)
  return new NextRequest(url, { headers })
}

/** The first cookie a response sets, as the browser sends it back: `name=value`. */
function firstCookie(response: Response): string {
  return response.headers.getSetCookie()[0].split(';')[0]
}

export interface StartedFlow {
  /** The tenant host's cookie, `name=value`: the browser that began. */
  browser: string
  /** The hash of that cookie's value, as the tenant host sealed it. */
  challenge: string
  /** The `state` the auth host sent to WorkOS. */
  state: string
  /** The auth host's start cookie, `name=value`. */
  cookie: string
}

/**
 * Press "Sign In" on `host` and follow the browser to the auth host's start
 * route, which answers on `on`. In development the two are plain HTTP.
 */
export async function startFlow(
  host: string,
  on: string,
): Promise<StartedFlow> {
  const scheme = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const begun = await signInRoute(
    get(`${scheme}://${host}/workshop/sign-in`, host),
  )
  expect(begun.status).toBe(307)
  const started = await startRoute(get(begun.headers.get('location')!, on))
  expect(started.status).toBe(307)
  const state = new URL(started.headers.get('location')!).searchParams.get(
    'state',
  )!
  const browser = firstCookie(begun)
  return {
    browser,
    challenge: createHash('sha256')
      .update(browser.split('=')[1])
      .digest('base64url'),
    state,
    cookie: firstCookie(started),
  }
}

export interface CallbackOptions {
  on: string
  code?: string | null
  cookie?: string | null
  /** Extra query parameters, as an attacker or a bug might add them. */
  query?: Record<string, string>
}

/** WorkOS redirecting the browser back to the auth host with a code. */
export function callback(
  flow: Pick<StartedFlow, 'state' | 'cookie'>,
  {
    on,
    code = 'code_from_workos',
    cookie = flow.cookie,
    query,
  }: CallbackOptions,
) {
  const scheme = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const url = new URL(`${scheme}://${on}/api/auth/callback`)
  if (code !== null) url.searchParams.set('code', code)
  url.searchParams.set('state', flow.state)
  for (const [name, value] of Object.entries(query ?? {})) {
    url.searchParams.set(name, value)
  }
  return callbackRoute(get(url, on, cookie))
}

export interface HandOff {
  /** Where the auth host sent the browser: the redeem URL with its token. */
  redeemUrl: URL
  token: string
  /** The tenant host's cookie, `name=value`. */
  browser: string
}

/** A whole sign-in for `host` up to the hand-off the auth host issues. */
export async function handOff(host: string, on: string): Promise<HandOff> {
  const flow = await startFlow(host, on)
  const response = await callback(flow, { on })
  expect(response.status).toBe(307)
  const redeemUrl = new URL(response.headers.get('location')!)
  return {
    redeemUrl,
    token: redeemUrl.searchParams.get('token')!,
    browser: flow.browser,
  }
}
