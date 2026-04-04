import { ProposalsSearchProvider } from '@/lib/search/providers/ProposalsSearchProvider'
import { vi } from 'vitest'
import { Status, Format } from '@/lib/proposal/types'

describe('ProposalsSearchProvider', () => {
  const mockSearchFn = vi.fn()
  const provider = new ProposalsSearchProvider(mockSearchFn)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct category and priority', () => {
    expect(provider.category).toBe('proposals')
    expect(provider.label).toBe('Proposals')
    expect(provider.priority).toBe(2)
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

  it('maps proposals to search result items', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-1',
        title: 'Kubernetes Best Practices',
        status: Status.submitted,
        format: Format.lightning_10,
        speakers: [{ name: 'Jane Doe' }],
      },
    ])

    const result = await provider.search('kubernetes')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'prop-1',
      title: 'Kubernetes Best Practices',
      subtitle: 'Jane Doe',
      description: 'Submitted',
      category: 'proposals',
      url: '/admin/proposals/prop-1',
    })
    expect(result.items[0].icon).toBeDefined()
  })

  it('handles proposals with multiple speakers', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-2',
        title: 'Talk',
        status: Status.accepted,
        format: Format.presentation_25,
        speakers: [{ name: 'Alice' }, { name: 'Bob' }],
      },
    ])

    const result = await provider.search('talk')
    expect(result.items[0].subtitle).toBe('Alice, Bob')
  })

  it('shows "Unknown Speaker" when speakers array is empty', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-3',
        title: 'Talk',
        status: Status.draft,
        format: Format.presentation_25,
        speakers: [],
      },
    ])

    const result = await provider.search('talk')
    expect(result.items[0].subtitle).toBe('Unknown Speaker')
  })

  it('shows "Unknown Speaker" when speakers is undefined', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-4',
        title: 'Talk',
        status: Status.draft,
        format: Format.presentation_25,
      },
    ])

    const result = await provider.search('talk')
    expect(result.items[0].subtitle).toBe('Unknown Speaker')
  })

  it('sets isWorkshop metadata for workshop formats', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-5',
        title: 'Workshop',
        status: Status.submitted,
        format: Format.workshop_120,
        speakers: [],
      },
    ])

    const result = await provider.search('workshop')
    expect(result.items[0].metadata?.isWorkshop).toBe(true)
  })

  it('handles thrown errors gracefully', async () => {
    mockSearchFn.mockRejectedValue(new Error('Network error'))

    const result = await provider.search('test')
    expect(result.items).toEqual([])
    expect(result.error).toBe('Failed to search proposals')
  })

  it('returns empty when search returns empty array', async () => {
    mockSearchFn.mockResolvedValue([])

    const result = await provider.search('test')
    expect(result.items).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('filters out non-object speakers', async () => {
    mockSearchFn.mockResolvedValue([
      {
        _id: 'prop-6',
        title: 'Talk',
        status: Status.submitted,
        format: Format.presentation_25,
        speakers: ['invalid-ref', { name: 'Valid Speaker' }, null],
      },
    ])

    const result = await provider.search('talk')
    expect(result.items[0].subtitle).toBe('Valid Speaker')
  })
})
