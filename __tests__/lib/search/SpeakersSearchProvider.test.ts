import { SpeakersSearchProvider } from '@/lib/search/providers/SpeakersSearchProvider'
import { vi } from 'vitest'
import type { Speaker } from '@/lib/speaker/types'

const makeSpeaker = (overrides: Partial<Speaker> = {}): Speaker => ({
  _id: 'speaker-1',
  _rev: 'rev-1',
  _createdAt: '2025-01-01',
  _updatedAt: '2025-01-01',
  name: 'Jane Doe',
  email: 'jane@example.com',
  ...overrides,
})

describe('SpeakersSearchProvider', () => {
  const mockSearchFn = vi.fn<(query: string) => Promise<Speaker[]>>()
  const provider = new SpeakersSearchProvider(mockSearchFn)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct category and priority', () => {
    expect(provider.category).toBe('speakers')
    expect(provider.label).toBe('Speakers')
    expect(provider.priority).toBe(4)
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

  it('maps speakers to search result items', async () => {
    const speaker = makeSpeaker({ title: 'Cloud Architect' })
    mockSearchFn.mockResolvedValue([speaker])

    const result = await provider.search('jane')

    expect(mockSearchFn).toHaveBeenCalledWith('jane')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'speaker-1',
      title: 'Jane Doe',
      subtitle: 'Cloud Architect',
      category: 'speakers',
      url: '/admin/speakers',
    })
    expect(result.items[0].icon).toBeDefined()
  })

  it('falls back to email when title is missing', async () => {
    const speaker = makeSpeaker({ title: undefined })
    mockSearchFn.mockResolvedValue([speaker])

    const result = await provider.search('jane')
    expect(result.items[0].subtitle).toBe('jane@example.com')
  })

  it('sets subtitle to undefined when both title and email are missing', async () => {
    const speaker = makeSpeaker({ title: undefined, email: '' })
    mockSearchFn.mockResolvedValue([speaker])

    const result = await provider.search('jane')
    expect(result.items[0].subtitle).toBeUndefined()
  })

  it('handles thrown errors gracefully', async () => {
    mockSearchFn.mockRejectedValue(new Error('Network error'))

    const result = await provider.search('test')
    expect(result.items).toEqual([])
    expect(result.error).toBe('Failed to search speakers')
  })

  it('returns multiple speakers', async () => {
    mockSearchFn.mockResolvedValue([
      makeSpeaker({ _id: 's1', name: 'Alice' }),
      makeSpeaker({ _id: 's2', name: 'Bob' }),
    ])

    const result = await provider.search('speaker')
    expect(result.items).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('stores full speaker in metadata', async () => {
    const speaker = makeSpeaker()
    mockSearchFn.mockResolvedValue([speaker])

    const result = await provider.search('jane')
    expect(result.items[0].metadata?.speaker).toEqual(speaker)
  })
})
