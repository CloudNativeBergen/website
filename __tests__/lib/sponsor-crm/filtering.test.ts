import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockFetch } = vi.hoisted(() => {
  const mockFetch = vi.fn()
  return { mockFetch }
})

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {
    patch: vi.fn(),
  },
}))

import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'

describe('listSponsorsForConference filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should apply basic conference filter', async () => {
    mockFetch.mockResolvedValue([])
    await listSponsorsForConference('conf-123')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '_type == "sponsorForConference" && conference._ref == $conferenceId',
      ),
      expect.objectContaining({ conferenceId: 'conf-123' }),
    )
  })

  it('should apply status filter', async () => {
    mockFetch.mockResolvedValue([])
    await listSponsorsForConference('conf-123', { status: ['closed-won'] })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('&& status in $statuses'),
      expect.objectContaining({ statuses: ['closed-won'] }),
    )
  })

  it('should apply searchQuery filter', async () => {
    mockFetch.mockResolvedValue([])
    await listSponsorsForConference('conf-123', { searchQuery: 'Google' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sponsor->name match $searchTerm'),
      expect.objectContaining({ searchTerm: '*Google*' }),
    )
  })

  it('should apply unassignedOnly filter', async () => {
    mockFetch.mockResolvedValue([])
    await listSponsorsForConference('conf-123', { unassignedOnly: true })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('&& !defined(assignedTo)'),
      expect.anything(),
    )
  })

  it('should apply assignedTo filter', async () => {
    mockFetch.mockResolvedValue([])
    await listSponsorsForConference('conf-123', { assignedTo: 'user-1' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('&& assignedTo._ref == $assignedTo'),
      expect.objectContaining({ assignedTo: 'user-1' }),
    )
  })
})
