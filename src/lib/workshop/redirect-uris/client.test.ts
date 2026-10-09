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

  it('stops at once when the cursor repeats, rather than asking again and again', async () => {
    const answered = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'redir_1', uri: 'https://a.example.org/cb' }],
            list_metadata: { after: 'redir_1' },
          }),
        ),
    )
    vi.stubGlobal('fetch', answered)

    await expect(listRedirectUris()).rejects.toBeInstanceOf(
      WorkOSRedirectUriError,
    )
    expect(answered).toHaveBeenCalledTimes(2)
  })

  it('ends on an empty page even when WorkOS still offers a cursor', async () => {
    const answered = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: [], list_metadata: { after: 'redir_9' } }),
        ),
    )
    vi.stubGlobal('fetch', answered)

    await expect(listRedirectUris()).resolves.toEqual([])
    expect(answered).toHaveBeenCalledTimes(1)
  })

  it('gives every request a deadline', async () => {
    const answered = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ data: [] })),
    )
    vi.stubGlobal('fetch', answered)

    await listRedirectUris()

    expect(answered.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
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

  it('reports an id WorkOS does not know as a failure, not as deleted', async () => {
    const keep = workos.seed('https://keep.example.org/cb')

    await expect(deleteRedirectUri('redir_missing')).rejects.toMatchObject({
      status: 404,
    })
    expect(workos.uris).toEqual([keep])
  })

  it('sends the id as one path segment', async () => {
    await deleteRedirectUri('redir_1/../redir_2').catch(() => {})

    expect(workos.requests[0].url).toBe(
      'https://api.workos.com/user_management/redirect_uris/redir_1%2F..%2Fredir_2',
    )
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

/**
 * Guards a mutation pass found unpinned (#1297 review): each of these fails
 * when the line it names is removed or loosened.
 */
describe('what is sent', () => {
  it('sends the URI as a JSON body, declared as JSON', async () => {
    await createRedirectUri('https://a.example.org/cb')

    const init = vi.mocked(globalThis.fetch).mock.calls[0][1]
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      uri: 'https://a.example.org/cb',
    })
  })

  it('never lets a request be answered from a cache', async () => {
    const entry = workos.seed('https://old.example.org/cb')

    await listRedirectUris()
    await createRedirectUri('https://a.example.org/cb')
    await deleteRedirectUri(entry.id)

    const sent = vi.mocked(globalThis.fetch).mock.calls
    expect(sent.map(([, init]) => init?.method)).toEqual([
      'GET',
      'POST',
      'DELETE',
    ])
    expect(sent.map(([, init]) => init?.cache)).toEqual([
      'no-store',
      'no-store',
      'no-store',
    ])
  })

  it('uses the key without the whitespace an environment variable picks up', async () => {
    vi.stubEnv('WORKOS_API_KEY', ` ${FAKE_WORKOS_API_KEY}\n`)

    await expect(listRedirectUris()).resolves.toEqual([])

    const init = vi.mocked(globalThis.fetch).mock.calls[0][1]
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${FAKE_WORKOS_API_KEY}`,
    )
  })

  it('treats a key that is only whitespace as unset: no request, no status', async () => {
    vi.stubEnv('WORKOS_API_KEY', '  \n')

    await expect(listRedirectUris()).rejects.toMatchObject({
      name: 'WorkOSRedirectUriError',
      status: null,
    })
    expect(workos.requests).toHaveLength(0)
  })
})

describe('an answer this cannot read', () => {
  const unreadableEntries: [string, Record<string, unknown>][] = [
    ['no id', { uri: 'https://a.example.org/cb' }],
    ['an empty id', { id: '', uri: 'https://a.example.org/cb' }],
    ['no uri', { id: 'redir_1' }],
    ['an empty uri', { id: 'redir_1', uri: '' }],
  ]

  it.each(unreadableEntries)(
    'fails a listing that holds an entry with %s, rather than guess',
    async (_, entry) => {
      vi.stubGlobal(
        'fetch',
        async () => new Response(JSON.stringify({ data: [entry] })),
      )

      await expect(listRedirectUris()).rejects.toMatchObject({
        name: 'WorkOSRedirectUriError',
        status: null,
      })
    },
  )

  it.each(unreadableEntries)(
    'fails a create answered with %s, rather than record a URI it cannot name',
    async (_, entry) => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify(entry)))

      await expect(
        createRedirectUri('https://a.example.org/cb'),
      ).rejects.toMatchObject({
        name: 'WorkOSRedirectUriError',
        status: null,
      })
    },
  )

  it.each([
    ['an empty object', {}],
    ['an error-shaped body', { message: 'Something went wrong' }],
    ['a list under another name', { redirect_uris: [] }],
  ])(
    'fails a listing answered 200 with %s: no data is not an empty list',
    async (_, body) => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body)))

      await expect(listRedirectUris()).rejects.toMatchObject({
        name: 'WorkOSRedirectUriError',
        status: null,
      })
    },
  )

  it('reports a refusal whose body is not JSON by its status', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('<html>Bad gateway</html>', { status: 502 }),
    )

    await expect(listRedirectUris()).rejects.toMatchObject({
      name: 'WorkOSRedirectUriError',
      status: 502,
      message: expect.stringContaining('HTTP 502'),
    })
  })
})

describe('an answer that leaves out what is optional', () => {
  const entry = { id: 'redir_1', uri: 'https://a.example.org/cb' }

  it.each([
    ['null list_metadata', { data: [entry], list_metadata: null }],
    ['list_metadata without a cursor', { data: [entry], list_metadata: {} }],
    [
      'a null creation time',
      {
        data: [{ ...entry, created_at: null }],
        list_metadata: { after: null },
      },
    ],
  ])('reads a last page with %s', async (_, body) => {
    const answered = vi.fn(async () => new Response(JSON.stringify(body)))
    vi.stubGlobal('fetch', answered)

    await expect(listRedirectUris()).resolves.toEqual([
      { ...entry, createdAt: null },
    ])
    expect(answered).toHaveBeenCalledTimes(1)
  })
})
