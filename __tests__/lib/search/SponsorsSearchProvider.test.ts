import { SponsorsSearchProvider } from '@/lib/search/providers/SponsorsSearchProvider'
import { vi } from 'vitest'
import type { SponsorExisting } from '@/lib/sponsor/types'

describe('SponsorsSearchProvider', () => {
  const mockSearchFn = vi.fn<(query: string) => Promise<SponsorExisting[]>>()
  const provider = new SponsorsSearchProvider(mockSearchFn)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct category and priority', () => {
    expect(provider.category).toBe('sponsors')
    expect(provider.label).toBe('Sponsors')
    expect(provider.priority).toBe(3)
  })

  it('returns empty items for empty query', async () => {
    const result = await provider.search('')
    expect(result.items).toEqual([])
    expect(mockSearchFn).not.toHaveBeenCalled()
  })

  it('returns empty items for whitespace-only query', async () => {
    const result = await provider.search('   ')
    expect(result.items).toEqual([])
    expect(mockSearchFn).not.toHaveBeenCalled()
  })

  it('maps sponsors to search result items', async () => {
    const sponsor: SponsorExisting = {
      _id: 'sponsor-1',
      _createdAt: '2025-01-01',
      _updatedAt: '2025-01-01',
      name: 'CNCF',
      website: 'https://cncf.io',
    }
    mockSearchFn.mockResolvedValue([sponsor])

    const result = await provider.search('cncf')

    expect(mockSearchFn).toHaveBeenCalledWith('cncf')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'sponsor-1',
      title: 'CNCF',
      subtitle: 'https://cncf.io',
      category: 'sponsors',
      url: '/admin/sponsors',
    })
    expect(result.items[0].icon).toBeDefined()
  })

  it('handles sponsor without website', async () => {
    const sponsor: SponsorExisting = {
      _id: 'sponsor-2',
      _createdAt: '2025-01-01',
      _updatedAt: '2025-01-01',
      name: 'Local Sponsor',
      website: '',
    }
    mockSearchFn.mockResolvedValue([sponsor])

    const result = await provider.search('local')
    expect(result.items[0].subtitle).toBeUndefined()
  })

  it('handles thrown errors gracefully', async () => {
    mockSearchFn.mockRejectedValue(new Error('Network error'))

    const result = await provider.search('test')
    expect(result.items).toEqual([])
    expect(result.error).toBe('Failed to search sponsors')
  })

  it('returns multiple sponsors', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 's1',
        _createdAt: '2025-01-01',
        _updatedAt: '2025-01-01',
        name: 'Sponsor A',
        website: 'a.com',
      },
      {
        _id: 's2',
        _createdAt: '2025-01-01',
        _updatedAt: '2025-01-01',
        name: 'Sponsor B',
        website: 'b.com',
      },
    ] as SponsorExisting[])

    const result = await provider.search('sponsor')
    expect(result.items).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })
})
