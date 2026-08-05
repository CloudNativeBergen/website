import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const authMock = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}))

vi.mock('next/cache', () => ({
  unstable_noStore: () => {},
}))

import { GET } from './route'

/**
 * The route only ever reads `request.url`, so a bare stand-in keeps these tests
 * free of Next's request plumbing.
 */
const requestFor = (target: string) =>
  ({
    url: `https://conference.example/api/proxy-image?url=${encodeURIComponent(target)}`,
  }) as unknown as NextRequest

const imageResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({
    user: { email: 'a@b.c' },
    speaker: { _id: 's' },
  })
  fetchMock = vi.fn().mockResolvedValue(imageResponse())
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/api/proxy-image — host allowlist', () => {
  it('proxies a genuine cdn.sanity.io image', async () => {
    const res = await GET(
      requestFor('https://cdn.sanity.io/images/p/d/abc123-400x400.jpg'),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://cdn.sanity.io/images/p/d/abc123-400x400.jpg',
    )
  })

  it('proxies a Sanity URL that carries transform query params', async () => {
    const res = await GET(
      requestFor('https://cdn.sanity.io/images/p/d/abc123-400x400?w=400&q=85'),
    )

    expect(res.status).toBe(200)
  })

  it('accepts an uppercase host, since URL parsing lowercases it', async () => {
    const res = await GET(
      requestFor('HTTPS://CDN.SANITY.IO/images/p/d/abc123-400x400.jpg'),
    )

    expect(res.status).toBe(200)
  })

  /**
   * The reported bug (#732): `hostname.includes('sanity.io')` is a SUBSTRING
   * test, so every host below passed it and turned this route into an
   * authenticated SSRF primitive with `Access-Control-Allow-Origin: *` and a
   * one-year CDN cache.
   */
  it.each([
    // Contains the allowed domain but does not end with it.
    'https://sanity.io.attacker.example/x.jpg',
    'https://attacker-sanity.io-cdn.example/x.jpg',
    'https://cdn.sanity.io.attacker.example/x.jpg',
    // Ends with the domain but is not the allowed host.
    'https://evil.sanity.io/x.jpg',
    'https://notsanity.io/x.jpg',
    // Trailing-dot FQDN: resolves the same, but is a different string — the
    // classic defeat for an `endsWith` allowlist.
    'https://cdn.sanity.io./x.jpg',
    // Userinfo trick: everything before `@` is credentials, not the host.
    'https://cdn.sanity.io@attacker.example/x.jpg',
    'https://cdn.sanity.io%2f@attacker.example/x.jpg',
    // Homograph / IDN: parsed to punycode, so it never equals the ASCII host.
    'https://cdn.sanitỵ.io/x.jpg',
    // The domain smuggled somewhere other than the host.
    'https://attacker.example/x.jpg?ref=cdn.sanity.io',
    'https://attacker.example/cdn.sanity.io/x.jpg',
    // Internal targets, the payoff of the bug.
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:6379/x.jpg',
    'http://localhost/x.jpg',
  ])('rejects %s without fetching it', async (target) => {
    const res = await GET(requestFor(target))

    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Invalid image source')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    // Plaintext to the allowed host is still a downgrade.
    'http://cdn.sanity.io/x.jpg',
    // Non-default port on the allowed address.
    'https://cdn.sanity.io:8080/x.jpg',
    // Embedded credentials would be forwarded as an Authorization header.
    'https://user:pass@cdn.sanity.io/x.jpg',
  ])('rejects %s even though the host matches', async (target) => {
    const res = await GET(requestFor(target))

    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['file:///etc/passwd', 'data:image/png;base64,AAAA'])(
    'rejects the non-https scheme %s',
    async (target) => {
      const res = await GET(requestFor(target))

      expect(res.status).toBe(403)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('rejects a target that does not parse as a URL', async () => {
    const res = await GET(requestFor('not-a-url'))

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing url parameter', async () => {
    const res = await GET({
      url: 'https://conference.example/api/proxy-image',
    } as unknown as NextRequest)

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('/api/proxy-image — redirects', () => {
  it('does not let the fetch follow redirects', async () => {
    await GET(requestFor('https://cdn.sanity.io/images/p/d/a-1x1.jpg'))

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('refuses a 302 off the allowed host instead of chasing it', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    )

    const res = await GET(requestFor('https://cdn.sanity.io/images/a-1x1.jpg'))

    expect(res.status).toBe(502)
    expect(await res.text()).toBe('Image source redirected')
  })

  it('refuses an opaqueredirect response from a spec-strict runtime', async () => {
    fetchMock.mockResolvedValue({
      type: 'opaqueredirect',
      status: 0,
      ok: false,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })

    const res = await GET(requestFor('https://cdn.sanity.io/images/a-1x1.jpg'))

    expect(res.status).toBe(502)
  })
})

describe('/api/proxy-image — response hardening', () => {
  it('serves proxied bytes with sniffing and scripting neutered', async () => {
    const res = await GET(requestFor('https://cdn.sanity.io/images/a-1x1.svg'))

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; sandbox",
    )
  })

  it('rejects a non-image content type from the allowed host', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"secret":1}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await GET(requestFor('https://cdn.sanity.io/images/a-1x1.jpg'))

    expect(res.status).toBe(400)
  })
})

describe('/api/proxy-image — authentication', () => {
  it('requires a signed-in speaker before touching the network', async () => {
    authMock.mockResolvedValue(null)

    const res = await GET(
      requestFor('https://sanity.io.attacker.example/x.jpg'),
    )

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
