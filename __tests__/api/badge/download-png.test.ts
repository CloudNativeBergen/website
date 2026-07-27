/**
 * @vitest-environment node
 *
 * Endpoint-level coverage for GET /api/badge/[badgeId]/download?format=png:
 * the route must return image/png with the rebake-aware cache headers and a
 * credential actually baked into the PNG bytes.
 */
import type { NextRequest } from 'next/server'
import { extractCredentialFromPng } from '@/lib/badge/png'
import type { BadgeRecord } from '@/lib/badge/types'

vi.mock('@/lib/badge/sanity', () => ({
  getBadgeById: vi.fn(),
  getBadgeSVGUrl: vi.fn(),
}))
vi.mock('@/lib/badge/fonts', () => ({
  loadBadgeFontFiles: vi.fn().mockResolvedValue([]),
}))

import { getBadgeById, getBadgeSVGUrl } from '@/lib/badge/sanity'
import { loadBadgeFontFiles } from '@/lib/badge/fonts'

const CREDENTIAL = JSON.stringify({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: 'https://example.com/api/badge/test-badge-id',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
})

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0" viewBox="0 0 100 100">' +
  '<openbadges:credential><![CDATA[ ' +
  CREDENTIAL +
  ' ]]></openbadges:credential>' +
  '<rect width="100" height="100" fill="#123"/></svg>'

function badgeRecord(): BadgeRecord {
  return {
    _id: 'badge-doc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-06-01T12:00:00Z',
    badgeId: 'test-badge-id',
    speaker: { _ref: 'speaker-1', _type: 'reference' },
    conference: { _ref: 'conference-1', _type: 'reference' },
    badgeType: 'speaker',
    issuedAt: '2026-01-01T00:00:00Z',
    badgeJson: CREDENTIAL,
    generatorVersion: 2,
    emailSent: false,
  } as unknown as BadgeRecord
}

function pngRequest(ifNoneMatch?: string): NextRequest {
  return {
    nextUrl: new URL(
      'https://conf.example/api/badge/test-badge-id/download?format=png',
    ),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'if-none-match' ? (ifNoneMatch ?? null) : null,
    },
  } as unknown as NextRequest
}

describe('GET /api/badge/[badgeId]/download?format=png', () => {
  beforeEach(() => {
    vi.mocked(getBadgeById).mockResolvedValue({ badge: badgeRecord() })
    vi.mocked(getBadgeSVGUrl).mockReturnValue('https://cdn.example/badge.svg')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SVG) }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns a baked PNG with rebake-aware caching headers', async () => {
    const { GET } = await import('@/app/api/badge/[badgeId]/download/route')
    const res = await GET(pngRequest(), {
      params: Promise.resolve({ badgeId: 'test-badge-id' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate',
    )
    const etag = res.headers.get('ETag')
    expect(etag).toMatch(/^W\/"badge-download-png-v2-/)
    expect(res.headers.get('Content-Disposition')).toContain('.png')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(bytes.subarray(0, 4))).toEqual([137, 80, 78, 71])
    // The credential must be baked into the PNG bytes, byte-for-byte.
    expect(extractCredentialFromPng(bytes)).toBe(CREDENTIAL)
  })

  it('revalidates to a 304 on a matching ETag without rendering', async () => {
    const { GET } = await import('@/app/api/badge/[badgeId]/download/route')
    const first = await GET(pngRequest(), {
      params: Promise.resolve({ badgeId: 'test-badge-id' }),
    })
    const etag = first.headers.get('ETag')!

    const res = await GET(pngRequest(etag), {
      params: Promise.resolve({ badgeId: 'test-badge-id' }),
    })
    expect(res.status).toBe(304)
    expect(vi.mocked(loadBadgeFontFiles)).toHaveBeenCalled()
  })
})
