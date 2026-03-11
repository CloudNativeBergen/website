const mockCommit = vi.fn()
const mockSet = vi.fn(() => ({ commit: mockCommit }))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: vi.fn(() => ({ set: mockSet })),
  },
}))

import { updateSponsor } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'
import type { SponsorInput } from '@/lib/sponsor/types'

describe('updateSponsor', () => {
  const sponsorId = 'sponsor-123'
  const committedDoc = {
    _id: sponsorId,
    _createdAt: '2025-01-01T00:00:00Z',
    _updatedAt: '2025-01-02T00:00:00Z',
    name: 'Acme Corp',
    website: 'https://acme.com',
    logo: '<svg></svg>',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCommit.mockResolvedValue(committedDoc)
  })

  it('should pass all SponsorInput fields to Sanity patch including address', async () => {
    const data: SponsorInput = {
      name: 'Acme Corp',
      website: 'https://acme.com',
      logo: '<svg></svg>',
      logoBright: '<svg></svg>',
      orgNumber: '123456789',
      address: 'Storgata 1, 0182 Oslo',
    }

    await updateSponsor(sponsorId, data)

    expect(clientWrite.patch).toHaveBeenCalledWith(sponsorId)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Corp',
        website: 'https://acme.com',
        logo: '<svg></svg>',
        logoBright: '<svg></svg>',
        orgNumber: '123456789',
        address: 'Storgata 1, 0182 Oslo',
      }),
    )
    expect(mockCommit).toHaveBeenCalled()
  })

  it('should pass undefined address when not provided', async () => {
    const data: SponsorInput = {
      name: 'Acme Corp',
      website: 'https://acme.com',
    }

    await updateSponsor(sponsorId, data)

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ address: undefined }),
    )
  })

  it('should return the updated sponsor on success', async () => {
    const data: SponsorInput = {
      name: 'Acme Corp',
      website: 'https://acme.com',
    }

    const result = await updateSponsor(sponsorId, data)

    expect(result.sponsor).toEqual({
      _id: sponsorId,
      _createdAt: '2025-01-01T00:00:00Z',
      _updatedAt: '2025-01-02T00:00:00Z',
      name: 'Acme Corp',
      website: 'https://acme.com',
      logo: '<svg></svg>',
    })
    expect(result.error).toBeUndefined()
  })

  it('should return error on failure', async () => {
    mockCommit.mockRejectedValue(new Error('Sanity error'))

    const data: SponsorInput = {
      name: 'Acme Corp',
      website: 'https://acme.com',
    }

    const result = await updateSponsor(sponsorId, data)

    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Sanity error')
    expect(result.sponsor).toBeUndefined()
  })
})
