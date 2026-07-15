import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the auth module so we control what `auth()` resolves to. Mocking the
// whole module also avoids pulling in the real NextAuth config graph.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/auth'
import { SessionProviderWrapper } from '@/components/providers/SessionProviderWrapper'

/**
 * Resolve the async server tree and return the `session` prop actually handed
 * to `<SessionProvider>`. We inspect the React element tree directly (no DOM
 * render) since both server components just return elements.
 */
async function resolveSessionProp(authReturn: unknown) {
  vi.mocked(auth).mockResolvedValue(authReturn as never)
  // SessionProviderWrapper -> <SessionLoader>{children}</SessionLoader>
  const wrapper = (await SessionProviderWrapper({ children: null })) as {
    type: (props: { children: React.ReactNode }) => Promise<{
      props: { session: unknown }
    }>
    props: { children: React.ReactNode }
  }
  // Resolve SessionLoader -> <SessionProvider session={...}>…</SessionProvider>
  const loader = await wrapper.type(wrapper.props)
  return loader.props.session
}

beforeEach(() => {
  vi.mocked(auth).mockReset()
})

describe('SessionProviderWrapper', () => {
  it('passes `undefined` (not null) when there is no session, so the client refetches on mount', async () => {
    expect(await resolveSessionProp(null)).toBeUndefined()
  })

  it('passes `undefined` when the session has no user', async () => {
    expect(await resolveSessionProp({ expires: '2099-01-01' })).toBeUndefined()
  })

  it('passes the sanitized session (user only, OAuth tokens stripped) when present', async () => {
    const session = (await resolveSessionProp({
      user: { name: 'Ada', email: 'ada@example.com', picture: 'p.png' },
      account: { provider: 'github', access_token: 'SECRET_TOKEN' },
      expires: '2099-01-01',
    })) as {
      user: unknown
      account: unknown
    }

    expect(session).toBeTruthy()
    expect(session.user).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      picture: 'p.png',
    })
    // account narrowed to just the provider name; tokens must not survive.
    expect(session.account).toEqual({ provider: 'github' })
    expect(JSON.stringify(session)).not.toContain('SECRET_TOKEN')
  })
})
