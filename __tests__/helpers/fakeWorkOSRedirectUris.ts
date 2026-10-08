import { vi } from 'vitest'

/**
 * An in-memory stand-in for WorkOS's `/user_management/redirect_uris`, installed
 * as `fetch`.
 *
 * BUILT FROM THE DOCUMENTATION, NOT FROM THE API. The shapes here are the ones
 * https://workos.com/docs/reference/user-management/redirect-uri documents; the
 * status codes and the duplicate-URI refusal are ASSUMPTIONS the docs do not
 * state. A test that passes against this proves the client and the reconcile
 * agree with this file — never that WorkOS behaves this way.
 */

export const FAKE_WORKOS_API_KEY = 'sk_test_fake'

const ENDPOINT = 'https://api.workos.com/user_management/redirect_uris'

export interface FakeRedirectUri {
  object: 'redirect_uri'
  id: string
  uri: string
  default: boolean
  created_at: string
  updated_at: string
}

type Method = 'GET' | 'POST' | 'DELETE'
type Failure = { status: number; message?: string } | 'network'

export interface FakeWorkOSRedirectUris {
  /** Everything registered, oldest first. */
  uris: FakeRedirectUri[]
  /** Every request received, in order. */
  requests: { method: Method; url: string }[]
  /** The POST and DELETE requests only — what "a write to WorkOS" means. */
  writes(): { method: Method; url: string }[]
  /** Register a URI as if a person had added it in the dashboard. */
  seed(uri: string, createdAt?: string): FakeRedirectUri
  /** Make the next request with this method fail, once. */
  failNext(method: Method, failure: Failure): void
  /** Make every request with this method fail until cleared with `null`. */
  failAll(method: Method, failure: Failure | null): void
  /** Create succeeds at WorkOS but the caller never sees the answer, once. */
  loseNextCreateResponse(): void
  /** Answer creates with the object wrapped in `redirect_uri` (the docs show both). */
  wrapCreateResponse: boolean
  /** Runs after a POST or DELETE took effect, before its answer is returned. */
  beforeAnswer?: (method: Method) => void
  /** The clock `created_at` is stamped from. */
  now: () => Date
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function installFakeWorkOSRedirectUris(): FakeWorkOSRedirectUris {
  let sequence = 0
  const once = new Map<Method, Failure[]>()
  const always = new Map<Method, Failure>()
  let loseCreateResponse = false

  const fake: FakeWorkOSRedirectUris = {
    uris: [],
    requests: [],
    writes: () => fake.requests.filter((r) => r.method !== 'GET'),
    seed(uri, createdAt) {
      const at = createdAt ?? fake.now().toISOString()
      const entry: FakeRedirectUri = {
        object: 'redirect_uri',
        id: `redir_${String(++sequence).padStart(4, '0')}`,
        uri,
        default: false,
        created_at: at,
        updated_at: at,
      }
      fake.uris.push(entry)
      return entry
    },
    failNext(method, failure) {
      once.set(method, [...(once.get(method) ?? []), failure])
    },
    failAll(method, failure) {
      if (failure === null) always.delete(method)
      else always.set(method, failure)
    },
    loseNextCreateResponse() {
      loseCreateResponse = true
    },
    wrapCreateResponse: false,
    now: () => new Date(),
  }

  const handler = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    const method = (init?.method ?? 'GET').toUpperCase() as Method
    fake.requests.push({ method, url: url.toString() })

    const failure = once.get(method)?.shift() ?? always.get(method)
    if (failure === 'network') throw new TypeError('fetch failed')
    if (failure) {
      return json(
        { message: failure.message ?? 'Something went wrong' },
        failure.status,
      )
    }

    const headers = new Headers(init?.headers)
    if (headers.get('authorization') !== `Bearer ${FAKE_WORKOS_API_KEY}`) {
      return json({ message: 'Unauthorized' }, 401)
    }

    if (method === 'GET' && url.href.split('?')[0] === ENDPOINT) {
      const limit = Number(url.searchParams.get('limit') ?? 10)
      const ordered =
        url.searchParams.get('order') === 'asc'
          ? fake.uris
          : [...fake.uris].reverse()
      const after = url.searchParams.get('after')
      const start = after ? ordered.findIndex((u) => u.id === after) + 1 : 0
      const page = ordered.slice(start, start + limit)
      const more = start + limit < ordered.length
      return json({
        object: 'list',
        data: page,
        list_metadata: {
          before: page[0]?.id ?? null,
          after: more ? page[page.length - 1].id : null,
        },
      })
    }

    if (method === 'POST' && url.href === ENDPOINT) {
      const { uri } = JSON.parse(String(init?.body)) as { uri: string }
      if (fake.uris.some((u) => u.uri === uri)) {
        return json({ message: 'Redirect URI already exists' }, 422)
      }
      const created = fake.seed(uri)
      if (loseCreateResponse) {
        loseCreateResponse = false
        throw new TypeError('fetch failed')
      }
      fake.beforeAnswer?.(method)
      return json(fake.wrapCreateResponse ? { redirect_uri: created } : created)
    }

    if (method === 'DELETE' && url.href.startsWith(`${ENDPOINT}/`)) {
      const id = decodeURIComponent(url.href.slice(ENDPOINT.length + 1))
      const index = fake.uris.findIndex((u) => u.id === id)
      if (index === -1) return json({ message: 'Not found' }, 404)
      fake.uris.splice(index, 1)
      fake.beforeAnswer?.(method)
      return new Response(null, { status: 204 })
    }

    return json({ message: 'Not found' }, 404)
  }

  vi.stubGlobal('fetch', vi.fn(handler))
  return fake
}
