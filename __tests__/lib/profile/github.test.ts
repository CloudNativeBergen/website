/**
 * @vitest-environment node
 *
 * Exercises `verifiedEmails` (src/lib/profile/github.ts) THROUGH the MSW node
 * server (__tests__/mocks/msw). This is the reference test proving HTTP
 * interception works: the GitHub `/user/emails` call is served by MSW, never
 * the real network, and per-case overrides via `server.use(...)` drive the
 * error/edge branches deterministically.
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import type { Account } from 'next-auth'
import { server } from '../../mocks/msw/server'
import { verifiedEmails } from '@/lib/profile/github'

const account = {
  provider: 'github',
  providerAccountId: '1',
  type: 'oauth',
  access_token: 'gho_test-token',
} as Account

describe('verifiedEmails — GitHub /user/emails via MSW', () => {
  it('returns only the verified emails from the default handler', async () => {
    const { error, emails } = await verifiedEmails(account)
    expect(error).toBeNull()
    // The default handler returns two verified + one unverified; the unverified
    // one must be filtered out.
    expect(emails.map((e) => e.email)).toEqual([
      'primary@example.com',
      'secondary@example.com',
    ])
    expect(emails.every((e) => e.verified)).toBe(true)
  })

  it('forwards the OAuth access token as a Bearer credential', async () => {
    let seenAuth: string | null = null
    server.use(
      http.get('https://api.github.com/user/emails', ({ request }) => {
        seenAuth = request.headers.get('authorization')
        return HttpResponse.json([
          { email: 'a@b.com', primary: true, verified: true },
        ])
      }),
    )
    await verifiedEmails(account)
    expect(seenAuth).toBe('Bearer gho_test-token')
  })

  it('returns an error (no throw) on a non-OK response', async () => {
    server.use(
      http.get('https://api.github.com/user/emails', () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
    )
    const { error, emails } = await verifiedEmails(account)
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('401')
    expect(emails).toEqual([])
  })

  it('returns an error (no throw) when the request fails at the network layer', async () => {
    server.use(
      http.get('https://api.github.com/user/emails', () =>
        HttpResponse.error(),
      ),
    )
    const { error, emails } = await verifiedEmails(account)
    expect(error).toBeInstanceOf(Error)
    expect(emails).toEqual([])
  })
})
