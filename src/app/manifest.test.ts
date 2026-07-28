import { describe, it, expect, vi, beforeEach } from 'vitest'

const headersMock = vi.fn()
const getConferenceForDomainMock = vi.fn()

vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}))

// `'use cache'` helpers call cacheLife/cacheTag — no-op them under vitest.
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (...args: unknown[]) =>
    getConferenceForDomainMock(...args),
}))

import manifest from './manifest'

function withHost(host: string) {
  headersMock.mockResolvedValue(new Headers({ host }))
}

describe('manifest — per-host PWA identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the resolved conference title as the app name', async () => {
    withHost('2026.cloudnativebergen.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: {
        title: 'Cloud Native Day Bergen',
        description: 'A Bergen conference.',
      },
      domain: '2026.cloudnativebergen.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.name).toBe('Cloud Native Day Bergen')
    expect(result.description).toBe('A Bergen conference.')
    // short_name is truncated on a word boundary within the length budget.
    expect(result.short_name).toBe('Cloud Native')
    expect(result.short_name!.length).toBeLessThanOrEqual(12)
  })

  it('gives different hosts different names', async () => {
    withHost('a.example.dev')
    getConferenceForDomainMock.mockResolvedValueOnce({
      conference: { title: 'Alpha Conf' },
      domain: 'a.example.dev',
      error: null,
    })
    const a = await manifest()

    withHost('b.example.dev')
    getConferenceForDomainMock.mockResolvedValueOnce({
      conference: { title: 'Beta Conf' },
      domain: 'b.example.dev',
      error: null,
    })
    const b = await manifest()

    expect(a.name).toBe('Alpha Conf')
    expect(b.name).toBe('Beta Conf')
  })

  it('falls back to the platform identity when no conference resolves', async () => {
    withHost('localhost:3000')
    getConferenceForDomainMock.mockResolvedValue({
      conference: {},
      domain: 'localhost:3000',
      error: new Error('no conference for host'),
    })

    const result = await manifest()

    expect(result.name).toBe('Konf')
    expect(result.short_name).toBe('Konf')
    expect(result.description).toContain('Community-driven')
  })

  it('falls back to the platform identity when resolution throws', async () => {
    withHost('broken.example.dev')
    getConferenceForDomainMock.mockRejectedValue(new Error('sanity down'))

    const result = await manifest()

    expect(result.name).toBe('Konf')
    expect(result.short_name).toBe('Konf')
  })

  it('keeps id/scope/start_url host-invariant', async () => {
    withHost('2026.cloudnativebergen.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: { title: 'Whatever Conf' },
      domain: '2026.cloudnativebergen.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.id).toBe('/')
    expect(result.scope).toBe('/')
    expect(result.start_url).toBe('/launch')
  })

  it('uses the house primary as theme_color when the conference has no theme', async () => {
    withHost('2026.cloudnativebergen.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: { title: 'Whatever Conf' },
      domain: '2026.cloudnativebergen.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.theme_color).toBe('#1D4ED8')
  })

  it('uses the conference theme primary as theme_color (THEMING L1)', async () => {
    withHost('purple.example.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: {
        title: 'Purple Conf',
        theme: { primaryColor: '#7C3AED', accentColor: '#22D3EE' },
      },
      domain: 'purple.example.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.theme_color).toBe('#7C3AED')
  })

  it('ignores a malformed theme primary and falls back to the house blue', async () => {
    withHost('bad.example.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: {
        title: 'Bad Conf',
        theme: { primaryColor: 'not-a-color' },
      },
      domain: 'bad.example.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.theme_color).toBe('#1D4ED8')
  })

  it('uses a short title verbatim as short_name', async () => {
    withHost('kcd.example.dev')
    getConferenceForDomainMock.mockResolvedValue({
      conference: { title: 'KCD Oslo' },
      domain: 'kcd.example.dev',
      error: null,
    })

    const result = await manifest()

    expect(result.short_name).toBe('KCD Oslo')
  })
})
