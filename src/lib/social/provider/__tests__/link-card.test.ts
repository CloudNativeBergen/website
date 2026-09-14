import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../../__tests__/mocks/msw/server'
import { fetchLinkCard, parseLinkMetadata } from '../link-card'

const PAGE = 'https://cloudnativedays.no/speaker/ada?utm_source=bluesky'
const OWN = { allowedHosts: ['cloudnativedays.no'] }

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
