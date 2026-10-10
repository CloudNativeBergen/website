/**
 * @vitest-environment node
 *
 * The workshop proxy's sign-in redirect THROUGH NEXT'S OWN PROXY ADAPTER (#1298
 * review, round 7). Calling the middleware directly skips the step where Next
 * turns the response's `Location` back into a URL; a RELATIVE Location throws
 * there ("Invalid URL") and the attendee gets a server error. So the redirect
 * is pinned as Next runs it: the proxy answers with an absolute same-origin
 * target, and the adapter relativises it for the browser.
 */
import '../../helpers/nextAsyncLocalStorage'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RedirectUriSyncRow } from '@/lib/domain-verification/types'
import { signInHost, signInHostsById } from '../../helpers/workshopSignIn'

const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

import middleware from '@/proxy'
import { adapter } from 'next/dist/server/web/adapter'

const REFUSED = 'unregistered.example.org'

function run(method: string, path: string, host = REFUSED) {
  return adapter({
    page: '/proxy',
    handler: middleware as never,
    request: {
      url: `https://${host}${path}`,
      method,
      headers: { host },
      nextConfig: {},
      body: undefined,
    },
  } as never)
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  getRedirectUriSyncRow.mockImplementation(
    signInHostsById([signInHost(REFUSED, {}, { status: null, id: null })]),
  )
})

describe('workshop proxy — the sign-in redirect, through the Next adapter', () => {
  it.each([
    ['GET', '/workshop/sign-in?next=x'],
    ['HEAD', '/workshop/sign-in'],
    ['GET', '/workshop/sign-up'],
  ])(
    '%s %s on a refused host reaches the browser as 307 /workshop',
    async (method, path) => {
      const { response } = await run(method, path)

      expect(response.status).toBe(307)
      // Same host, no query carried over.
      expect(response.headers.get('location')).toBe('/workshop')
      expect(response.headers.getSetCookie()).toEqual([])
    },
  )

  it('lets the refused portal page through, marked, as Next runs it', async () => {
    const { response } = await run('GET', '/workshop')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(
      response.headers.get(
        'x-middleware-request-x-workshop-sign-in-unavailable',
      ),
    ).toBe('1')
  })
})
