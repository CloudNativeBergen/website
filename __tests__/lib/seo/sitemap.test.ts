/**
 * @vitest-environment node
 *
 * Tests for the per-host sitemap builder (src/lib/seo/sitemap.ts). Pins the
 * acceptance criteria of #394: valid entries on the host's origin, speaker
 * pages enumerated for the edition, and NO disallowed/noindex URL present.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSitemap,
  isDisallowed,
  PUBLIC_STATIC_PATHS,
} from '@/lib/seo/sitemap'
import { DISALLOWED_PATHS } from '@/lib/seo/robots'

const HOST = '2026.cloudnativedays.no'
const BASE = 'https://2026.cloudnativedays.no'

describe('isDisallowed', () => {
  it('matches a disallowed path and its descendants', () => {
    expect(isDisallowed('/admin')).toBe(true)
    expect(isDisallowed('/admin/sponsors')).toBe(true)
    expect(isDisallowed('/cfp/list')).toBe(true)
    expect(isDisallowed('/sponsor/portal/abc')).toBe(true)
  })

  it('does NOT match the public prefixes that share a segment', () => {
    // Bare /cfp and /sponsor are public; only their private sub-paths disallow.
    expect(isDisallowed('/cfp')).toBe(false)
    expect(isDisallowed('/sponsor')).toBe(false)
    expect(isDisallowed('/sponsor/terms')).toBe(false)
    expect(isDisallowed('/speaker/ada-lovelace')).toBe(false)
  })
})

describe('buildSitemap', () => {
  it('emits the public static pages on the host origin, home first', () => {
    const map = buildSitemap(HOST)
    expect(map[0]).toMatchObject({ url: `${BASE}/`, priority: 1 })
    const urls = map.map((e) => e.url)
    expect(urls).toContain(`${BASE}/program`)
    expect(urls).toContain(`${BASE}/speaker`)
    expect(urls).toContain(`${BASE}/tickets`)
    // Every entry is an absolute URL on the requested host.
    expect(urls.every((u) => u.startsWith(`${BASE}/`))).toBe(true)
  })

  it('enumerates public speaker profiles with lastModified', () => {
    const map = buildSitemap(HOST, {
      speakers: [
        { slug: 'ada-lovelace', lastModified: '2026-01-02T00:00:00.000Z' },
        { slug: 'alan-turing' },
      ],
    })
    const ada = map.find((e) => e.url === `${BASE}/speaker/ada-lovelace`)
    expect(ada).toBeDefined()
    expect(ada?.lastModified).toBe('2026-01-02T00:00:00.000Z')
    expect(map.some((e) => e.url === `${BASE}/speaker/alan-turing`)).toBe(true)
  })

  it('skips speakers without a slug and de-dupes repeats', () => {
    const map = buildSitemap(HOST, {
      speakers: [
        { slug: 'ada' },
        { slug: undefined },
        { slug: '' },
        { slug: 'ada' },
      ],
    })
    const adaEntries = map.filter((e) => e.url === `${BASE}/speaker/ada`)
    expect(adaEntries).toHaveLength(1)
  })

  it('URL-encodes speaker slugs', () => {
    const map = buildSitemap(HOST, { speakers: [{ slug: 'josé garcía' }] })
    expect(
      map.some((e) => e.url === `${BASE}/speaker/jos%C3%A9%20garc%C3%ADa`),
    ).toBe(true)
  })

  it('NEVER emits a disallowed/noindex URL (acceptance criteria)', () => {
    const map = buildSitemap(HOST, {
      // A speaker whose slug would collide with a disallowed prefix is still
      // fine (it lives under /speaker/), but assert the whole set is clean.
      speakers: [{ slug: 'real-speaker' }],
    })
    for (const entry of map) {
      const path = new URL(entry.url).pathname
      for (const raw of DISALLOWED_PATHS) {
        const prefix = raw.replace(/\/$/, '')
        expect(path === prefix || path.startsWith(`${prefix}/`)).toBe(false)
      }
    }
  })

  it('applies the protocol from getBaseUrl (http for localhost)', () => {
    const map = buildSitemap('localhost:3000')
    expect(map[0].url).toBe('http://localhost:3000/')
  })

  it('keeps the curated static list free of disallowed paths', () => {
    // Guards against someone adding a private path to PUBLIC_STATIC_PATHS.
    for (const path of PUBLIC_STATIC_PATHS) {
      expect(isDisallowed(path)).toBe(false)
    }
  })
})
