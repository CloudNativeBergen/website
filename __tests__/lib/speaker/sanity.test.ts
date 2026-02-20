const { mockCommit, mockSet, mockPatch, mockFetch, mockCreate } = vi.hoisted(
  () => {
    const mockCommit = vi.fn().mockResolvedValue({})
    const mockSet = vi.fn()
    mockSet.mockReturnValue({ commit: mockCommit })
    const mockPatch = vi.fn().mockReturnValue({ set: mockSet })
    const mockFetch = vi.fn()
    const mockCreate = vi.fn()
    return { mockCommit, mockSet, mockPatch, mockFetch, mockCreate }
  },
)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {
    patch: mockPatch,
    create: mockCreate,
  },
}))

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}))

import { updateSpeaker, getOrCreateSpeaker } from '@/lib/speaker/sanity'
import type { Speaker } from '@/lib/speaker/types'
import type { Account, User } from 'next-auth'

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

  it('should convert image asset ID to Sanity image reference', async () => {
    const { speaker, err } = await updateSpeaker('speaker-1', {
      name: 'Updated Name',
      image: 'image-abc123-500x500-png',
    })

    expect(err).toBeNull()
    expect(speaker).toEqual(baseSpeaker)

    expect(mockSet).toHaveBeenCalledTimes(1)
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

  describe('image field regression: CDN URLs and non-asset strings must be ignored', () => {
    it.each([
      [
        'Sanity CDN URL',
        'https://cdn.sanity.io/images/mvzwvw14/production/620c5070-4925x4925.jpg',
      ],
      [
        'GitHub avatar URL',
        'https://avatars.githubusercontent.com/u/12345?v=4',
      ],
      [
        'LinkedIn profile image URL',
        'https://media.licdn.com/dms/image/v2/abc/profile-photo.jpg',
      ],
      ['generic HTTPS URL', 'https://example.com/photo.jpg'],
      ['empty string', ''],
      ['random non-asset string', 'not-a-valid-asset-id'],
    ])('should ignore image when it is a %s', async (_, imageValue) => {
      const { speaker, err } = await updateSpeaker('speaker-1', {
        name: 'Updated Name',
        image: imageValue,
      })

      expect(err).toBeNull()
      expect(speaker).toEqual(baseSpeaker)
      expect(mockSet).toHaveBeenCalledTimes(1)
      expect(mockSet).toHaveBeenCalledWith({ name: 'Updated Name' })
    })
  })

  it('should not set image reference when image is undefined', async () => {
    await updateSpeaker('speaker-1', { name: 'No Image' })

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

describe('getOrCreateSpeaker', () => {
  const mockUser: User = {
    email: 'jane@example.com',
    name: 'Jane Doe',
    image: 'https://avatars.githubusercontent.com/u/99999?v=4',
  }

  const mockAccount: Account = {
    provider: 'github',
    providerAccountId: '99999',
    type: 'oauth',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create new speaker with imageURL from OAuth, not image field', async () => {
    // No existing speaker found by provider or email
    mockFetch.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      _id: 'mock-uuid-1234',
      _type: 'speaker',
      name: 'Jane Doe',
      email: 'jane@example.com',
      imageURL: 'https://avatars.githubusercontent.com/u/99999?v=4',
      providers: ['github:99999'],
    })

    const { speaker, err } = await getOrCreateSpeaker(mockUser, mockAccount)

    expect(err).toBeNull()
    expect(speaker).toBeDefined()

    // Verify create was called with imageURL (OAuth URL), NOT with image field
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.imageURL).toBe(
      'https://avatars.githubusercontent.com/u/99999?v=4',
    )
    expect(createArg.image).toBeUndefined()
  })

  it('should return existing speaker found by provider without creating', async () => {
    const existingSpeaker = { ...baseSpeaker, providers: ['github:99999'] }
    mockFetch.mockResolvedValue(existingSpeaker)

    const { speaker, err } = await getOrCreateSpeaker(mockUser, mockAccount)

    expect(err).toBeNull()
    expect(speaker._id).toBe('speaker-1')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('should return error when user email is missing', async () => {
    const { err } = await getOrCreateSpeaker(
      { email: '', name: 'No Email' },
      mockAccount,
    )

    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('Missing user email or name')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('should set imageURL to empty string when OAuth has no image', async () => {
    mockFetch.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      _id: 'mock-uuid-1234',
      _type: 'speaker',
      name: 'No Avatar',
      email: 'no-avatar@example.com',
    })

    await getOrCreateSpeaker(
      { email: 'no-avatar@example.com', name: 'No Avatar', image: undefined },
      mockAccount,
    )

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.imageURL).toBe('')
    expect(createArg.image).toBeUndefined()
  })
})
