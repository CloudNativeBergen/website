const { mockCommit, mockSet, mockPatch, mockFetch } = vi.hoisted(() => {
  const mockCommit = vi.fn().mockResolvedValue({})
  const mockSet = vi.fn()
  mockSet.mockReturnValue({ commit: mockCommit, set: mockSet })
  const mockPatch = vi.fn().mockReturnValue({ set: mockSet })
  const mockFetch = vi.fn()
  return { mockCommit, mockSet, mockPatch, mockFetch }
})

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {
    patch: mockPatch,
  },
}))

import { updateSpeaker } from '@/lib/speaker/sanity'
import type { Speaker } from '@/lib/speaker/types'

const baseSpeaker: Speaker = {
  _id: 'speaker-1',
  _rev: 'rev-1',
  _createdAt: '2025-01-01T00:00:00Z',
  _updatedAt: '2025-01-01T00:00:00Z',
  name: 'Test Speaker',
  title: 'Engineer',
  email: 'test@example.com',
  slug: 'test-speaker',
  flags: [],
}

describe('updateSpeaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(baseSpeaker)
  })

  it('should update speaker without image', async () => {
    const { speaker, err } = await updateSpeaker('speaker-1', {
      name: 'Updated Name',
      bio: 'New bio',
    })

    expect(err).toBeNull()
    expect(speaker).toEqual(baseSpeaker)
    expect(mockPatch).toHaveBeenCalledWith('speaker-1')
    expect(mockSet).toHaveBeenCalledWith({
      name: 'Updated Name',
      bio: 'New bio',
    })
    expect(mockCommit).toHaveBeenCalled()
  })

  it('should convert image string to Sanity image reference', async () => {
    const { speaker, err } = await updateSpeaker('speaker-1', {
      name: 'Updated Name',
      image: 'image-abc123-500x500-png',
    })

    expect(err).toBeNull()
    expect(speaker).toEqual(baseSpeaker)

    // Second .set() call should include the image reference
    expect(mockSet).toHaveBeenCalledWith({
      name: 'Updated Name',
      image: {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: 'image-abc123-500x500-png',
        },
      },
    })
  })

  it('should not set image reference when image is undefined', async () => {
    await updateSpeaker('speaker-1', { name: 'No Image' })

    // set should be called once (without image), not twice
    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(mockSet).toHaveBeenCalledWith({ name: 'No Image' })
  })

  it('should return error when patch fails', async () => {
    mockCommit.mockRejectedValueOnce(new Error('Sanity error'))

    const { err } = await updateSpeaker('speaker-1', { name: 'Fail' })

    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('Sanity error')
  })

  it('should return error when getSpeaker fails after patch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Fetch failed'))

    const { err } = await updateSpeaker('speaker-1', { name: 'Fail' })

    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('Fetch failed')
  })
})
