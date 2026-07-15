const { mockCommit, mockSet, mockUnset, mockPatch, mockFetch, mockCreate } =
  vi.hoisted(() => {
    const mockCommit = vi.fn().mockResolvedValue({})
    const mockUnset = vi.fn()
    const mockSet = vi.fn()
    mockSet.mockReturnValue({ commit: mockCommit, unset: mockUnset })
    mockUnset.mockReturnValue({ commit: mockCommit })
    const mockPatch = vi.fn().mockReturnValue({ set: mockSet })
    const mockFetch = vi.fn()
    const mockCreate = vi.fn()
    return { mockCommit, mockSet, mockUnset, mockPatch, mockFetch, mockCreate }
  })

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

import {
  updateSpeaker,
  getOrCreateSpeaker,
  getSpeaker,
} from '@/lib/speaker/sanity'
import { SpeakerInputSchema } from '@/server/schemas/speaker'
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

  it('should unset clearable fields when they are cleared', async () => {
    await updateSpeaker('speaker-1', {
      name: 'Updated Name',
      title: 'Engineer',
      country: null,
      gender: null,
      genderSelfDescribe: '',
      bio: '',
    })

    // Non-empty fields are still set; empty ones are removed from the set payload.
    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(mockSet).toHaveBeenCalledWith({
      name: 'Updated Name',
      title: 'Engineer',
    })

    // Cleared fields are unset so the old value cannot persist in Sanity.
    expect(mockUnset).toHaveBeenCalledTimes(1)
    expect(mockUnset).toHaveBeenCalledWith([
      'bio',
      'gender',
      'genderSelfDescribe',
      'country',
    ])
    expect(mockCommit).toHaveBeenCalled()
  })

  it('should not call unset when no clearable field is empty', async () => {
    await updateSpeaker('speaker-1', {
      name: 'Updated Name',
      country: 'Norway',
    })

    expect(mockSet).toHaveBeenCalledWith({
      name: 'Updated Name',
      country: 'Norway',
    })
    expect(mockUnset).not.toHaveBeenCalled()
  })

  // Integration guard for the clear-field seam: the form emits `null` for a
  // cleared field, the Zod schema transforms `null` -> `undefined` while
  // KEEPING the key present, and updateSpeaker relies on that retained key to
  // decide what to unset. This asserts the whole chain so a future Zod upgrade
  // that drops undefined-valued keys can't silently break clearing.
  it('unsets fields cleared through the SpeakerInputSchema transform', async () => {
    const parsed = SpeakerInputSchema.parse({
      name: 'Updated Name',
      gender: null,
      country: null,
    })

    // The transform yields undefined but the keys must survive for the unset.
    expect('gender' in parsed).toBe(true)
    expect('country' in parsed).toBe(true)
    expect(parsed.gender).toBeUndefined()
    expect(parsed.country).toBeUndefined()

    await updateSpeaker('speaker-1', parsed)

    expect(mockSet).toHaveBeenCalledWith({ name: 'Updated Name' })
    expect(mockUnset).toHaveBeenCalledTimes(1)
    expect(mockUnset).toHaveBeenCalledWith(['gender', 'country'])
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

describe('isOrganizer computed from conference.organizers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should propagate isOrganizer: true from Sanity response through getOrCreateSpeaker', async () => {
    const organizer = {
      ...baseSpeaker,
      isOrganizer: true,
      providers: ['github:12345'],
    }
    mockFetch.mockResolvedValue(organizer)

    const { speaker, err } = await getOrCreateSpeaker(
      { email: organizer.email, name: organizer.name },
      { provider: 'github', providerAccountId: '12345', type: 'oauth' },
    )

    expect(err).toBeNull()
    expect(speaker.isOrganizer).toBe(true)
  })

  it('should propagate isOrganizer: false from Sanity response through getOrCreateSpeaker', async () => {
    const regular = {
      ...baseSpeaker,
      isOrganizer: false,
      providers: ['github:67890'],
    }
    mockFetch.mockResolvedValue(regular)

    const { speaker, err } = await getOrCreateSpeaker(
      { email: regular.email, name: regular.name },
      { provider: 'github', providerAccountId: '67890', type: 'oauth' },
    )

    expect(err).toBeNull()
    expect(speaker.isOrganizer).toBe(false)
  })

  it('should propagate isOrganizer through getSpeaker', async () => {
    mockFetch.mockResolvedValue({ ...baseSpeaker, isOrganizer: true })

    const { speaker, err } = await getSpeaker('speaker-1')

    expect(err).toBeNull()
    expect(speaker.isOrganizer).toBe(true)
  })

  it('should handle undefined isOrganizer as falsy', async () => {
    const speakerWithoutFlag = { ...baseSpeaker }
    delete (speakerWithoutFlag as Record<string, unknown>).isOrganizer
    mockFetch.mockResolvedValue(speakerWithoutFlag)

    const { speaker, err } = await getSpeaker('speaker-1')

    expect(err).toBeNull()
    expect(speaker.isOrganizer).toBeFalsy()
  })

  it('should include isOrganizer in GROQ query for findSpeakerByProvider', async () => {
    mockFetch.mockResolvedValue(null)

    await getOrCreateSpeaker(
      { email: 'test@test.com', name: 'Test' },
      { provider: 'github', providerAccountId: '99', type: 'oauth' },
    )

    const query = mockFetch.mock.calls[0][0] as string
    expect(query).toContain('isOrganizer')
    expect(query).toContain('conference')
  })

  it('should include isOrganizer in GROQ query for getSpeaker', async () => {
    mockFetch.mockResolvedValue(baseSpeaker)

    await getSpeaker('speaker-1')

    const query = mockFetch.mock.calls[0][0] as string
    expect(query).toContain('isOrganizer')
    expect(query).toContain('conference')
  })
})
