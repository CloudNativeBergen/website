/**
 * @vitest-environment node
 *
 * Badge rasterization font provisioning: fetched once per warm function from
 * the deployment's own /fonts/ path, persisted to tmpdir for resvg's
 * file-path-only font API. A failed fetch must NOT be cached.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import {
  loadBadgeFontFiles,
  resetBadgeFontCacheForTests,
} from '@/lib/badge/fonts'

const FONT_BYTES = new Uint8Array([1, 2, 3, 4]).buffer

describe('loadBadgeFontFiles', () => {
  beforeEach(() => {
    resetBadgeFontCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the self-hosted font once and returns a readable tmp path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(FONT_BYTES),
    })
    vi.stubGlobal('fetch', fetchMock)

    const [first] = await loadBadgeFontFiles('https://example.com')
    const [second] = await loadBadgeFontFiles('https://example.com')

    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://example.com/fonts/Inter-SemiBold.ttf',
    )
    const written = await fs.readFile(first)
    expect(Array.from(written)).toEqual([1, 2, 3, 4])
  })

  it('does not cache a failed fetch — the next call retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(FONT_BYTES),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBadgeFontFiles('https://example.com')).rejects.toThrow(
      /502/,
    )
    const [recovered] = await loadBadgeFontFiles('https://example.com')
    expect(recovered).toMatch(/badge-font-inter-semibold\.ttf$/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
