import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceForCurrentDomainMock(...args),
}))

import { ogImageMetadata } from './metadata'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ogImageMetadata', () => {
  it('templates the alt around the resolved conference title', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({
      conference: { title: 'Cloud Native Days Norway 2026' },
    })
    const [meta] = await ogImageMetadata(
      (brand) => `Get Your Ticket - ${brand}`,
    )
    expect(meta.alt).toBe('Get Your Ticket - Cloud Native Days Norway 2026')
    expect(meta.contentType).toBe('image/png')
    expect(meta.id).toBe('og')
  })

  it('uses the neutral platform name when no conference resolves', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValue({ conference: null })
    const [meta] = await ogImageMetadata((brand) => `Program - ${brand}`)
    expect(meta.alt).toBe('Program - Cloud Native Days')
  })

  it('falls back to the platform name on error', async () => {
    getConferenceForCurrentDomainMock.mockRejectedValue(new Error('boom'))
    const [meta] = await ogImageMetadata((brand) => brand)
    expect(meta.alt).toBe('Cloud Native Days')
  })
})
