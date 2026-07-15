import { describe, it, expect } from 'vitest'
import {
  classifyRequest,
  isNeverCachePath,
  isStaticAssetPath,
  NEVER_CACHE_PREFIXES,
} from '@/lib/pwa/request-classification'

const ORIGIN = 'https://cloudnativebergen.dev'

function classify(
  partial: Partial<Parameters<typeof classifyRequest>[0]> & { url: string },
) {
  return classifyRequest({
    method: 'GET',
    origin: ORIGIN,
    ...partial,
  })
}

describe('request classification', () => {
  describe('SECURITY: authenticated paths are NEVER cached', () => {
    // A non-navigation GET (e.g. an RSC/data fetch) to an authed path must be
    // passthrough — caching it could leak one user's content to another.
    const authedPaths = [
      '/cfp/x',
      '/cfp/proposal/123',
      '/admin/x',
      '/admin/sponsors',
      '/stream/x',
      '/api/x',
      '/api/trpc/foo',
    ]

    it.each(authedPaths)('never caches non-navigation GET %s', (path) => {
      expect(classify({ url: `${ORIGIN}${path}`, mode: 'cors' })).toBe(
        'passthrough',
      )
    })

    it.each(authedPaths)('isNeverCachePath is true for %s', (path) => {
      expect(isNeverCachePath(path)).toBe(true)
    })

    it('never treats an authed path as a static asset even with a static-looking suffix', () => {
      // A `.js` under an authed prefix must still be passthrough.
      expect(classify({ url: `${ORIGIN}/api/export/report.js` })).toBe(
        'passthrough',
      )
      expect(classify({ url: `${ORIGIN}/admin/thing.png` })).toBe('passthrough')
    })

    it('exports the exact auth prefixes the SW must exclude', () => {
      expect(NEVER_CACHE_PREFIXES).toEqual([
        '/api/',
        '/cfp/',
        '/admin/',
        '/stream/',
      ])
    })
  })

  describe('navigations', () => {
    it('classifies a document navigation as navigate', () => {
      expect(classify({ url: `${ORIGIN}/program`, mode: 'navigate' })).toBe(
        'navigate',
      )
    })

    it('classifies an authed navigation as navigate (safe: response is never cached)', () => {
      expect(classify({ url: `${ORIGIN}/cfp/list`, mode: 'navigate' })).toBe(
        'navigate',
      )
    })
  })

  describe('static assets → stale-while-revalidate', () => {
    const staticPaths = [
      '/_next/static/chunks/main-abc123.js',
      '/_next/static/css/app.css',
      '/fonts/Inter-SemiBold.ttf',
      '/pwa/icon/192',
      '/icon-512.png',
      '/apple-touch-icon.png',
      '/favicon-32.png',
      '/og/cover.webp',
    ]

    it.each(staticPaths)('classifies %s as static', (path) => {
      expect(classify({ url: `${ORIGIN}${path}` })).toBe('static')
    })

    it.each(staticPaths)('isStaticAssetPath is true for %s', (path) => {
      expect(isStaticAssetPath(path)).toBe(true)
    })
  })

  describe('passthrough cases', () => {
    it('passes through non-GET methods', () => {
      expect(
        classify({
          url: `${ORIGIN}/program`,
          mode: 'navigate',
          method: 'POST',
        }),
      ).toBe('passthrough')
    })

    it('passes through cross-origin requests', () => {
      expect(
        classify({ url: 'https://cdn.sanity.io/images/x.png', mode: 'cors' }),
      ).toBe('passthrough')
    })

    it('passes through cross-origin navigations', () => {
      expect(
        classify({ url: 'https://example.com/page', mode: 'navigate' }),
      ).toBe('passthrough')
    })

    it('passes through a same-origin non-navigation dynamic request', () => {
      // A public HTML/RSC route fetched as data (not a navigation) is not a
      // static asset → passthrough, never cached.
      expect(
        classify({ url: `${ORIGIN}/program?_rsc=abc`, mode: 'cors' }),
      ).toBe('passthrough')
    })

    it('passes through malformed URLs', () => {
      expect(classify({ url: 'not a url' })).toBe('passthrough')
    })
  })
})
