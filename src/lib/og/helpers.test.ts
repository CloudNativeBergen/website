import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { loadBrandFonts, resetBrandFontCacheForTests } from './helpers'

const originalFetch = global.fetch

function fontResponse() {
  return new Response(new Uint8Array([0, 1, 0, 0]).buffer, { status: 200 })
}

beforeEach(() => {
  resetBrandFontCacheForTests()
})

afterEach(() => {
  global.fetch = originalFetch
  resetBrandFontCacheForTests()
})

describe('loadBrandFonts', () => {
  it('fetches each face exactly once and reuses the buffers on later calls', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      fontResponse(),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const first = await loadBrandFonts('example.test')
    const second = await loadBrandFonts('example.test')
    const third = await loadBrandFonts('another-tenant.test')

    // Three faces, fetched once — not once per call, and not once per tenant.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/fonts/SpaceGrotesk-Bold.ttf',
      'https://example.test/fonts/JetBrainsMono-Bold.ttf',
      'https://example.test/fonts/Inter-SemiBold.ttf',
    ])
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('collapses concurrent callers onto one in-flight fetch', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      fontResponse(),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const [a, b] = await Promise.all([
      loadBrandFonts('example.test'),
      loadBrandFonts('example.test'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(a).toBe(b)
  })

  it('returns the shape ImageResponse expects', async () => {
    global.fetch = (async () => fontResponse()) as unknown as typeof fetch

    const fonts = await loadBrandFonts('example.test')

    expect(fonts.map((font) => [font.name, font.weight, font.style])).toEqual([
      ['Space Grotesk', 700, 'normal'],
      ['JetBrains Mono', 700, 'normal'],
      ['Inter', 600, 'normal'],
    ])
    for (const font of fonts) {
      expect(font.data.byteLength).toBe(4)
    }
  })

  it('uses http for localhost so local OG rendering still resolves', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      fontResponse(),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await loadBrandFonts('localhost:3000')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3000/fonts/SpaceGrotesk-Bold.ttf',
    )
  })

  it('does not cache a failure — the next request retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockImplementation(async () => fontResponse())
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(loadBrandFonts('example.test')).rejects.toThrow(
      /SpaceGrotesk-Bold\.ttf: 404/,
    )

    const retried = await loadBrandFonts('example.test')
    expect(retried).toHaveLength(3)
  })
})
