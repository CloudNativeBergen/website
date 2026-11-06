// The identity → site bridge picks the linked account a speaker is keyed on
// (#1981), so either provider finds the same speaker.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  applySpeakerToToken: vi.fn(),
  sessionCallback: ({ token }: { token: { sub: string } }) => ({
    speakerId: token.sub,
  }),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({ conference: { _id: 'c' } }),
}))
vi.mock('./identity-handoff', () => ({ isIdentityTenant: async () => true }))
const findSpeakerByProvider = vi.fn()
const getOrCreateSpeaker = vi.fn()
vi.mock('@/lib/speaker/sanity', () => ({
  findSpeakerByProvider,
  getOrCreateSpeaker,
  providerAccount: (p: string, id: string) => `${p}:${id}`,
}))

const { identitySessionFor } = await import('./identity-session')
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('IDENTITY_URL', 'https://id.test')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (url: URL) =>
    Response.json(
      url.pathname.endsWith('/get-session')
        ? {
            session: { origin: 'https://conf.example' },
            user: { email: 'a@example.com', emailVerified: true, name: 'A' },
          }
        : [
            { providerId: 'github', accountId: 'gh1' },
            { providerId: 'linkedin', accountId: 'li1' },
          ],
    ),
  )
  // The speaker was created by a LinkedIn sign-in; GitHub was linked later.
  findSpeakerByProvider.mockImplementation(async (key: string) => ({
    speaker: key === 'linkedin:li1' ? { _id: 'spk-li' } : {},
    err: null,
  }))
  getOrCreateSpeaker.mockImplementation(async (_u, account) => ({
    speaker:
      account.provider === 'linkedin' ? { _id: 'spk-li' } : { _id: 'spk-new' },
    err: null,
  }))
})

describe('identitySessionFor', () => {
  it('resolves the speaker keyed on the second linked provider', async () => {
    const s = await identitySessionFor('tok-1', 'conf.example')
    expect(getOrCreateSpeaker.mock.calls[0][1]).toMatchObject({
      provider: 'linkedin',
      providerAccountId: 'li1',
    })
    expect(s).toEqual({ speakerId: 'spk-li', identity: true })
  })
})
