/**
 * @vitest-environment node
 *
 * #807 and #814, against the REAL GROQ engine (`groq-js`). The display `email`
 * can be set by an organizer without proof of ownership, so it only counts as a
 * login match key while the speaker has no `knownEmails` (the invited,
 * never-signed-in placeholder). Returning provider logins accrue newly
 * verified emails into `knownEmails` (#814).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'
import type { Account, User } from 'next-auth'

const { fetchMock, createMock, patchMock, verifiedEmailsMock } = vi.hoisted(
  () => ({
    fetchMock: vi.fn(),
    createMock: vi.fn(),
    patchMock: vi.fn(),
    verifiedEmailsMock: vi.fn(),
  }),
)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: fetchMock },
  clientReadCached: { fetch: fetchMock },
  clientWrite: { fetch: fetchMock, create: createMock, patch: patchMock },
  speakerImageUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/profile/github', () => ({ verifiedEmails: verifiedEmailsMock }))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: async () => null,
  organizationReference: vi.fn(),
}))

import {
  findSpeakerByEmailForOrganizerCreate,
  getOrCreateSpeaker,
  getOrCreateSpeakerForVerifiedEmail,
} from '@/lib/speaker/sanity'
import { resolveEmailLinkTier } from '@/lib/auth/email-link/tier'

const ORG = 'org-this'

const dataset: Record<string, unknown>[] = [
  // Invited by an organizer, never signed in: claimable by display email.
  {
    _id: 'sp-invitee',
    _type: 'speaker',
    name: 'Invitee',
    slug: { current: 'invitee' },
    email: 'invitee@example.com',
    organizations: [{ _type: 'reference', _ref: ORG }],
  },
  // Has signed in. Its display email was then set (say, by an organizer) to an
  // address it never verified.
  {
    _id: 'sp-signed-in',
    _type: 'speaker',
    name: 'Signed In',
    slug: { current: 'signed-in' },
    email: 'unverified@example.com',
    knownEmails: ['owner@example.com'],
    providers: ['github:42'],
    organizations: [{ _type: 'reference', _ref: ORG }],
  },
  {
    _id: 'conf-1',
    _type: 'conference',
    organization: { _type: 'reference', _ref: ORG },
    organizers: [{ _type: 'reference', _ref: 'sp-signed-in' }],
  },
]

const patches: Array<{ id: string; set: Record<string, unknown> }> = []

beforeEach(() => {
  vi.clearAllMocks()
  patches.length = 0
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  )
  createMock.mockImplementation(async (doc: Record<string, unknown>) => doc)
  patchMock.mockImplementation((id: string) => {
    const entry = { id, set: {} as Record<string, unknown> }
    const builder = {
      set(values: Record<string, unknown>) {
        entry.set = { ...entry.set, ...values }
        return builder
      },
      setIfMissing: () => builder,
      insert: () => builder,
      async commit() {
        patches.push(entry)
        return { _id: id }
      },
    }
    return builder
  })
})

describe('display email as a match key (#807)', () => {
  it('lets an invited speaker without knownEmails claim the profile', async () => {
    const { speaker, err } = await getOrCreateSpeakerForVerifiedEmail(
      'invitee@example.com',
    )
    expect(err).toBeNull()
    expect(speaker._id).toBe('sp-invitee')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('does not match a signed-in speaker on its display email alone', async () => {
    const { speaker } = await getOrCreateSpeakerForVerifiedEmail(
      'unverified@example.com',
    )
    expect(speaker._id).not.toBe('sp-signed-in')
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(patches.some((p) => p.id === 'sp-signed-in')).toBe(false)
  })

  it('still matches a signed-in speaker on a knownEmails entry', async () => {
    const { speaker } =
      await getOrCreateSpeakerForVerifiedEmail('owner@example.com')
    expect(speaker._id).toBe('sp-signed-in')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('applies the same rule to the email-link tier lookup', async () => {
    expect(await resolveEmailLinkTier('owner@example.com')).toBe('stored')
    expect(await resolveEmailLinkTier('unverified@example.com')).toBe(
      'stateless',
    )
  })

  it('applies the same rule to the organizer-create duplicate guard', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate('invitee@example.com', ORG),
    ).toMatchObject({ inCurrentOrg: true })
    expect(
      await findSpeakerByEmailForOrganizerCreate('owner@example.com', ORG),
    ).toMatchObject({ inCurrentOrg: true })
    expect(
      await findSpeakerByEmailForOrganizerCreate('unverified@example.com', ORG),
    ).toBeNull()
  })
})

describe('returning provider login accrues verified emails (#814)', () => {
  const user = { name: 'Signed In', email: 'owner@example.com' } as User
  const account = {
    provider: 'github',
    providerAccountId: '42',
    type: 'oauth',
    access_token: 't',
  } as Account

  it('adds a newly verified address to knownEmails', async () => {
    verifiedEmailsMock.mockResolvedValue({
      emails: [{ email: 'new@example.com' }],
      error: null,
    })
    const { speaker, err } = await getOrCreateSpeaker(user, account)
    expect(err).toBeNull()
    expect(speaker._id).toBe('sp-signed-in')
    expect(patches).toContainEqual({
      id: 'sp-signed-in',
      set: { knownEmails: ['owner@example.com', 'new@example.com'] },
    })
  })

  it('writes nothing when no new address was verified', async () => {
    verifiedEmailsMock.mockResolvedValue({ emails: [], error: null })
    await getOrCreateSpeaker(user, account)
    expect(patches.filter((p) => 'knownEmails' in p.set)).toHaveLength(0)
  })
})
