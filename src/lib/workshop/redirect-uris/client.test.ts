import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FAKE_WORKOS_API_KEY,
  installFakeWorkOSRedirectUris,
  type FakeWorkOSRedirectUris,
} from '../../../../__tests__/helpers/fakeWorkOSRedirectUris'
import {
  createRedirectUri,
  deleteRedirectUri,
  listRedirectUris,
  WorkOSRedirectUriError,
} from './client'

/**
 * The client against the DOCUMENTED shapes (see the fake's header). These pin
 * what we send and how we read an answer; they are not evidence about WorkOS.
 */

let workos: FakeWorkOSRedirectUris

beforeEach(() => {
  vi.stubEnv('WORKOS_API_KEY', FAKE_WORKOS_API_KEY)
  workos = installFakeWorkOSRedirectUris()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('listRedirectUris', () => {
  it('returns every URI when the list spans several pages', async () => {
    for (let i = 0; i < 205; i++) workos.seed(`https://h${i}.example.org/cb`)

    const listed = await listRedirectUris()

    expect(listed).toHaveLength(205)
    expect(new Set(listed.map((u) => u.uri)).size).toBe(205)
    expect(workos.requests).toHaveLength(3)
  })

  it('reads the creation time, and an unreadable one as unknown', async () => {
    workos.seed('https://a.example.org/cb', '2026-01-15T12:00:00.000Z')
    workos.seed('https://b.example.org/cb', 'not a date')

    const [a, b] = await listRedirectUris()

    expect(a.createdAt).toEqual(new Date('2026-01-15T12:00:00.000Z'))
    expect(b.createdAt).toBeNull()
  })

  it('fails when a page is refused, carrying the status', async () => {
    workos.failNext('GET', { status: 401, message: 'Unauthorized' })

    await expect(listRedirectUris()).rejects.toMatchObject({
      name: 'WorkOSRedirectUriError',
      status: 401,
      message: expect.stringContaining('Unauthorized'),
    })
  })

  it('fails rather than return a partial list when a later page is refused', async () => {
    for (let i = 0; i < 150; i++) workos.seed(`https://h${i}.example.org/cb`)
    // The first page is served, the second is refused.
    const served = globalThis.fetch
    let calls = 0
    vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
      if (++calls === 2) workos.failNext('GET', { status: 500 })
      return served(...args)
    })

    await expect(listRedirectUris()).rejects.toMatchObject({ status: 500 })
    expect(calls).toBe(2)
  })

  it('fails when the cursor never ends', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'redir_1', uri: 'https://a.example.org/cb' }],
            list_metadata: { after: 'redir_1' },
          }),
        ),
    )

    await expect(listRedirectUris()).rejects.toBeInstanceOf(
      WorkOSRedirectUriError,
    )
  })

  it('never sends the key anywhere but the Authorization header', async () => {
    await listRedirectUris()

    expect(workos.requests[0].url).not.toContain(FAKE_WORKOS_API_KEY)
  })
})

describe('createRedirectUri', () => {
  it('registers the URI and returns its id', async () => {
    const created = await createRedirectUri('https://a.example.org/cb')

    expect(workos.uris.map((u) => u.uri)).toEqual(['https://a.example.org/cb'])
    expect(created.id).toBe(workos.uris[0].id)
    expect(created.uri).toBe('https://a.example.org/cb')
  })

  it('reads the answer when WorkOS wraps it in redirect_uri', async () => {
    workos.wrapCreateResponse = true

    const created = await createRedirectUri('https://a.example.org/cb')

    expect(created.id).toBe(workos.uris[0].id)
  })

  it('reports a refusal with its status: nothing was registered', async () => {
    workos.seed('https://a.example.org/cb')

    await expect(
      createRedirectUri('https://a.example.org/cb'),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('reports a lost answer without a status: something may have been registered', async () => {
    workos.loseNextCreateResponse()

    await expect(
      createRedirectUri('https://a.example.org/cb'),
    ).rejects.toMatchObject({ name: 'WorkOSRedirectUriError', status: null })
    expect(workos.uris).toHaveLength(1)
  })

  it('reports a success it cannot read without a status', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"ok":true}'))

    await expect(
      createRedirectUri('https://a.example.org/cb'),
    ).rejects.toMatchObject({ status: null })
  })
})

describe('deleteRedirectUri', () => {
  it('deletes exactly the id it is given', async () => {
    const keep = workos.seed('https://keep.example.org/cb')
    const drop = workos.seed('https://drop.example.org/cb')

    await deleteRedirectUri(drop.id)

    expect(workos.uris).toEqual([keep])
  })

  it('treats a URI that is already gone as deleted', async () => {
    await expect(deleteRedirectUri('redir_missing')).resolves.toBeUndefined()
  })

  it('reports any other refusal', async () => {
    const entry = workos.seed('https://a.example.org/cb')
    workos.failNext('DELETE', { status: 500 })

    await expect(deleteRedirectUri(entry.id)).rejects.toMatchObject({
      status: 500,
    })
    expect(workos.uris).toHaveLength(1)
  })
})

describe('without WORKOS_API_KEY', () => {
  it('refuses before any request is made', async () => {
    vi.stubEnv('WORKOS_API_KEY', '')

    await expect(listRedirectUris()).rejects.toBeInstanceOf(
      WorkOSRedirectUriError,
    )
    expect(workos.requests).toHaveLength(0)
  })
})
