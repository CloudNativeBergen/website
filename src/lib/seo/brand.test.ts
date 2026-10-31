import { describe, it, expect, vi, beforeEach } from 'vitest'

const headersMock = vi.fn()
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}))

const getConferenceForDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (...args: unknown[]) =>
    getConferenceForDomainMock(...args),
}))

import { resolveMetadataBrand, resolvePageMetadata } from './brand'

function headersWithHost(host: string | null) {
  return { get: (name: string) => (name === 'host' ? host : null) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveMetadataBrand', () => {
  it('returns the resolved conference title', async () => {
    headersMock.mockResolvedValue(headersWithHost('cloudnativebergen.dev'))
    getConferenceForDomainMock.mockResolvedValue({
      conference: { title: 'Cloud Native Days Norway 2026' },
    })
    expect(await resolveMetadataBrand()).toBe('Cloud Native Days Norway 2026')
  })

  it('falls back to the neutral platform name when no conference resolves', async () => {
    headersMock.mockResolvedValue(headersWithHost('localhost:3000'))
    getConferenceForDomainMock.mockResolvedValue({ conference: null })
    expect(await resolveMetadataBrand()).toBe('Konf')
  })

  it('falls back to the platform name on a resolution error', async () => {
    headersMock.mockResolvedValue(headersWithHost('x.example'))
    getConferenceForDomainMock.mockRejectedValue(new Error('sanity down'))
    expect(await resolveMetadataBrand()).toBe('Konf')
  })
})

describe('resolvePageMetadata', () => {
  it('puts the page first and adds dates and city to the description', async () => {
    headersMock.mockResolvedValue(headersWithHost('cloudnativebergen.dev'))
    getConferenceForDomainMock.mockResolvedValue({
      conference: {
        title: 'Cloud Native Days Norway 2026',
        startDate: '2026-10-27',
        endDate: '2026-10-28',
        city: 'Bergen',
      },
    })
    const { title, description } = await resolvePageMetadata(
      'Program',
      'Talks for',
    )
    expect(title).toBe('Program – Cloud Native Days Norway 2026')
    expect(description).toMatch(
      /^Talks for Cloud Native Days Norway 2026, .+ in Bergen\.$/,
    )
  })

  it('omits unknown dates and falls back to the platform name', async () => {
    headersMock.mockResolvedValue(headersWithHost('x.example'))
    getConferenceForDomainMock.mockRejectedValue(new Error('sanity down'))
    expect(await resolvePageMetadata('Tickets', 'Tickets for')).toEqual({
      title: 'Tickets – Konf',
      description: 'Tickets for Konf.',
    })
  })
})
