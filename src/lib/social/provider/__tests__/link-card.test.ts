import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../../__tests__/mocks/msw/server'
import {
  fetchLinkCard,
  hostAllowed,
  isPublicAddress,
  parseLinkMetadata,
} from '../link-card'

const PAGE = 'https://cloudnativedays.no/speaker/ada?utm_source=bluesky'
const PUBLIC = async () => ['93.184.216.34']
const OWN = { allowedHosts: ['cloudnativedays.no'], resolve: PUBLIC }

describe('parseLinkMetadata — the card from our page', () => {
  it('prefers Open Graph, decodes entities, collapses whitespace and resolves a relative image', () => {
    const html = `<html><head>
      <title>Ada Lovelace | Cloud Native Days</title>
      <meta name="description" content="Plain description">
      <meta content='Ada Lovelace &amp; the &#x1F680; engine' property='og:title'>
      <meta property="og:description" content="Keynote:
        analytical   engines" />
      <meta property="og:image" content="/og/ada.png">
    </head></html>`
    expect(parseLinkMetadata(html, PAGE)).toEqual({
      title: 'Ada Lovelace & the 🚀 engine',
      description: 'Keynote: analytical engines',
      imageUrl: 'https://cloudnativedays.no/og/ada.png',
    })
  })

  it('falls back to <title> and the description meta, and drops a non-http image', () => {
    const html = `<head><title> Fallback </title><meta name="description" content="Desc"><meta property="og:image" content="data:image/png;base64,AAAA"></head>`
    expect(parseLinkMetadata(html, PAGE)).toEqual({
      title: 'Fallback',
      description: 'Desc',
      imageUrl: null,
    })
  })

  it('leaves an out-of-range or surrogate numeric entity as written instead of throwing', () => {
    const html =
      '<meta property="og:title" content="A &#1114112; B &#xFFFFFFFF; C &#xD800; D &#65; E">'
    expect(parseLinkMetadata(html, PAGE).title).toBe(
      'A &#1114112; B &#xFFFFFFFF; C &#xD800; D A E',
    )
  })

  it('is empty, not broken, for a page without metadata', () => {
    expect(parseLinkMetadata('<html></html>', PAGE)).toEqual({
      title: '',
      description: '',
      imageUrl: null,
    })
  })
})

describe('fetchLinkCard', () => {
  it('returns null when the page is unreachable or not OK', async () => {
    server.use(
      http.get('https://cloudnativedays.no/speaker/ada', () =>
        HttpResponse.text('nope', { status: 500 }),
      ),
    )
    expect(await fetchLinkCard(PAGE, OWN)).toBeNull()
  })

  it('omits a thumbnail that is over the 1,000,000-byte cap but keeps the card', async () => {
    server.use(
      http.get('https://cloudnativedays.no/speaker/ada', () =>
        HttpResponse.html(
          '<head><meta property="og:title" content="Ada"><meta property="og:image" content="https://cloudnativedays.no/og/big.png"></head>',
        ),
      ),
      http.get('https://cloudnativedays.no/og/big.png', () =>
        HttpResponse.arrayBuffer(new Uint8Array(1_000_001).buffer, {
          headers: { 'content-type': 'image/png' },
        }),
      ),
    )
    expect(await fetchLinkCard(PAGE, OWN)).toEqual({
      title: 'Ada',
      description: '',
      thumb: null,
    })
  })

  it('does not fetch a page, a redirect target, or an og:image outside the allowed hosts', async () => {
    const hits: string[] = []
    server.use(
      http.get('https://cloudnativedays.no/speaker/ada', () => {
        hits.push('page')
        return HttpResponse.html(
          '<meta property="og:title" content="Ada"><meta property="og:image" content="http://169.254.169.254/latest/meta-data">',
        )
      }),
      http.get('https://cloudnativedays.no/go', () => {
        hits.push('redirect')
        return new HttpResponse(null, {
          status: 302,
          headers: { location: 'http://10.0.0.1/admin' },
        })
      }),
      http.get('http://169.254.169.254/latest/meta-data', () => {
        hits.push('metadata')
        return HttpResponse.text('secret')
      }),
      http.get('http://10.0.0.1/admin', () => {
        hits.push('internal')
        return HttpResponse.text('secret')
      }),
    )
    expect(await fetchLinkCard('http://10.0.0.1/admin', OWN)).toBeNull()
    expect(await fetchLinkCard('https://cloudnativedays.no/go', OWN)).toBeNull()
    expect(await fetchLinkCard(PAGE, OWN)).toEqual({
      title: 'Ada',
      description: '',
      thumb: null,
    })
    expect(hits).toEqual(['redirect', 'page'])
  })

  it('refuses address literals, local names and explicit ports even when the allowlist names them', () => {
    const allowed = [
      '10.0.0.1',
      '[::1]',
      'localhost',
      'localhost:3000',
      'router.local',
      'cloudnativedays.no',
      '*.cloudnativedays.no',
    ]
    expect(hostAllowed(new URL('https://evil.no/'), ['*.no'])).toBe(false)
    for (const bad of [
      'http://10.0.0.1/',
      'http://[::1]/',
      'http://localhost/',
      'http://localhost:3000/',
      'http://router.local/',
      'https://cloudnativedays.no:8443/',
      'ftp://cloudnativedays.no/',
      'https://a.b.cloudnativedays.no/',
      'https://evil-cloudnativedays.no/',
    ]) {
      expect(hostAllowed(new URL(bad), allowed), bad).toBe(false)
    }
    for (const good of [
      'https://cloudnativedays.no/tickets',
      'https://CloudNativeDays.no/',
      'https://2026.cloudnativedays.no/',
    ]) {
      expect(hostAllowed(new URL(good), allowed), good).toBe(true)
    }
  })

  it('resolves a relative og:image against the page it landed on after a redirect', async () => {
    const fetched: string[] = []
    server.use(
      http.get(
        'https://cloudnativedays.no/go',
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: {
              location: 'https://2026.cloudnativedays.no/speaker/ada',
            },
          }),
      ),
      http.get('https://2026.cloudnativedays.no/speaker/ada', () =>
        HttpResponse.html(
          '<meta property="og:title" content="Ada"><meta property="og:image" content="/og/ada.png">',
        ),
      ),
      http.get('https://2026.cloudnativedays.no/og/ada.png', ({ request }) => {
        fetched.push(request.url)
        return HttpResponse.arrayBuffer(new Uint8Array(16).buffer, {
          headers: { 'content-type': 'image/png' },
        })
      }),
    )
    const card = await fetchLinkCard('https://cloudnativedays.no/go', {
      allowedHosts: ['cloudnativedays.no', '2026.cloudnativedays.no'],
      resolve: PUBLIC,
    })
    expect(card?.thumb?.bytes.byteLength).toBe(16)
    expect(fetched).toEqual(['https://2026.cloudnativedays.no/og/ada.png'])
  })

  it('refuses an allowed hostname that resolves to a private, loopback, link-local or unresolvable address', async () => {
    let hits = 0
    server.use(
      http.get('https://cloudnativedays.no/speaker/ada', () => {
        hits++
        return HttpResponse.html('<meta property="og:title" content="Ada">')
      }),
    )
    for (const addresses of [
      ['10.0.0.5'],
      ['127.0.0.1'],
      ['169.254.169.254'],
      ['::1'],
      ['fd00::1'],
      ['93.184.216.34', '192.168.1.1'], // one private record poisons the set
      [],
    ]) {
      expect(
        await fetchLinkCard(PAGE, {
          allowedHosts: ['cloudnativedays.no'],
          resolve: async () => addresses,
        }),
        addresses.join(','),
      ).toBeNull()
    }
    expect(hits).toBe(0)
    expect(await fetchLinkCard(PAGE, OWN)).toMatchObject({ title: 'Ada' })
  })

  it('isPublicAddress: the reserved ranges, both families', () => {
    for (const bad of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '192.0.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      'ff02::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a00:1',
      '::ffff:c0a8:101',
      '::ffff:a9fe:a9fe',
      '64:ff9b::7f00:1',
      '2001:db8::1',
      'not-an-ip',
      '',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPublicAddress(bad), bad).toBe(false)
    }
    for (const good of [
      '93.184.216.34',
      '172.32.0.1',
      '2606:2800:220:1:248:1893:25c8:1946',
      '::ffff:93.184.216.34',
    ]) {
      expect(isPublicAddress(good), good).toBe(true)
    }
  })

  it('follows a redirect that stays on an allowed host', async () => {
    server.use(
      http.get(
        'https://cloudnativedays.no/go',
        () =>
          new HttpResponse(null, {
            status: 301,
            headers: { location: '/speaker/ada' },
          }),
      ),
      http.get('https://cloudnativedays.no/speaker/ada', () =>
        HttpResponse.html('<meta property="og:title" content="Ada">'),
      ),
    )
    expect(await fetchLinkCard('https://cloudnativedays.no/go', OWN)).toEqual({
      title: 'Ada',
      description: '',
      thumb: null,
    })
  })

  it('cuts an oversized page at the limit instead of buffering it', async () => {
    const head = '<meta property="og:title" content="Ada">'
    server.use(
      http.get('https://cloudnativedays.no/speaker/ada', () =>
        HttpResponse.html(head + 'x'.repeat(2 * 1024 * 1024)),
      ),
    )
    expect(await fetchLinkCard(PAGE, OWN)).toMatchObject({ title: 'Ada' })
  })
})
