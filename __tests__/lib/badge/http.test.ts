/**
 * @vitest-environment node
 *
 * Rebake-aware caching for baked badge artifacts. These replaced a
 * `max-age=1yr, immutable` policy that stranded rebakes in browser/CDN cache —
 * the root cause of "the validator still fails after rebaking" (the recipient
 * re-validated the immutable pre-rebake file).
 */
import { describe, it, expect } from 'vitest'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  badgeArtifactETag,
  badgeNotModifiedResponse,
} from '@/lib/badge/http'

const base = { _updatedAt: '2026-07-01T10:00:00Z', generatorVersion: 2 }

function req(ifNoneMatch?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'if-none-match' ? (ifNoneMatch ?? null) : null,
    },
  }
}

describe('badge artifact caching', () => {
  it('is a revalidating, non-immutable policy', () => {
    expect(BADGE_ARTIFACT_CACHE_CONTROL).toBe(
      'public, max-age=0, must-revalidate',
    )
    expect(BADGE_ARTIFACT_CACHE_CONTROL).not.toContain('immutable')
  })

  it('ETag changes when the doc is rebaked (_updatedAt moves)', () => {
    const before = badgeArtifactETag(base, 'download')
    const after = badgeArtifactETag(
      { ...base, _updatedAt: '2026-07-02T09:00:00Z' },
      'download',
    )
    expect(before).not.toBe(after)
  })

  it('ETag is stable for the same doc + variant', () => {
    expect(badgeArtifactETag(base, 'json')).toBe(
      badgeArtifactETag(base, 'json'),
    )
  })

  it('ETag differs per artifact variant and per generatorVersion', () => {
    expect(badgeArtifactETag(base, 'download')).not.toBe(
      badgeArtifactETag(base, 'download-png'),
    )
    expect(badgeArtifactETag(base, 'download')).not.toBe(
      badgeArtifactETag({ ...base, generatorVersion: 3 }, 'download'),
    )
  })

  it('treats an absent generatorVersion as v1', () => {
    expect(
      badgeArtifactETag({ _updatedAt: base._updatedAt }, 'json'),
    ).toContain('-v1-')
  })

  it('returns a 304 when If-None-Match matches (weak-prefix tolerant)', () => {
    const etag = badgeArtifactETag(base, 'download')
    const res = badgeNotModifiedResponse(req(etag), etag)
    expect(res?.status).toBe(304)
    // Strong-form client value still matches our weak validator.
    const strong = etag.replace(/^W\//, '')
    expect(badgeNotModifiedResponse(req(strong), etag)?.status).toBe(304)
  })

  it('returns null (serve fresh) when If-None-Match is absent or stale', () => {
    const etag = badgeArtifactETag(base, 'download')
    expect(badgeNotModifiedResponse(req(), etag)).toBeNull()
    expect(
      badgeNotModifiedResponse(req('W/"badge-download-v2-stale"'), etag),
    ).toBeNull()
  })
})
