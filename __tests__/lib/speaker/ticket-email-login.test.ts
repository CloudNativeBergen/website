/**
 * @vitest-environment node
 *
 * #1914, against the REAL GROQ engine (`groq-js`). A ticket-granted address
 * (`speaker.admin.addTicketEmail`) is attested by an organizer of ONE org, not
 * proven by the person. It must link tickets, but it must never resolve a
 * sign-in: otherwise an organizer of org X who bought a ticket under an address
 * they control can sign in as a speaker who organizes org Y, and inherit
 * `organizerOrgIds` for Y. The grant-time exclusivity check does not cover
 * this, because the speaker can be made an organizer of Y after the grant.
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
  getOrCreateSpeaker,
  getOrCreateSpeakerForVerifiedEmail,
} from '@/lib/speaker/sanity'

const ORG_X = 'org-x'
const ORG_Y = 'org-y'

const dataset: Record<string, unknown>[] = [
  {
    _id: 'sp-victim',
    _type: 'speaker',
    name: 'Victim',
    slug: { current: 'victim' },
    email: 'victim@example.com',
    // LEGACY shape: a granted address in the match-set. `addSpeakerTicketEmail`
    // no longer writes it there; the login predicate still skips it.
    knownEmails: ['victim@example.com', 'attacker@example.com'],
    ticketEmailGrants: [
      {
        _key: 'g1',
        email: 'attacker@example.com',
        registeredEmail: 'Attacker@example.com',
        ticketId: 't-1',
        addedByOrg: ORG_X,
      },
    ],
    providers: ['github:1'],
    organizations: [{ _type: 'reference', _ref: ORG_X }],
  },
  // Made an organizer of Y AFTER the grant.
  {
    _id: 'conf-y',
    _type: 'conference',
    organization: { _type: 'reference', _ref: ORG_Y },
    organizers: [{ _type: 'reference', _ref: 'sp-victim' }],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  )
  createMock.mockImplementation(async (doc: Record<string, unknown>) => doc)
  patchMock.mockImplementation((id: string) => {
    const builder = {
      set: () => builder,
      setIfMissing: () => builder,
      append: () => builder,
      insert: () => builder,
      commit: async () => ({ _id: id }),
    }
    return builder
  })
})

describe('ticket-granted addresses never resolve a sign-in (#1914)', () => {
  it('email-link sign-in with a granted address does not become the speaker', async () => {
    const { speaker, err } = await getOrCreateSpeakerForVerifiedEmail(
      'attacker@example.com',
    )
    expect(speaker._id).toBeUndefined()
    expect(speaker.organizerOrgIds ?? []).not.toContain(ORG_Y)
    // Refused, not a fresh duplicate an organizer could merge into the victim.
    expect(err?.message).toMatch(/cannot be used to create a new account/)
    expect(err?.message).not.toMatch(/victim/i)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('provider sign-in verifying a granted address does not become the speaker', async () => {
    verifiedEmailsMock.mockResolvedValue({ emails: [], error: null })
    const { speaker, err } = await getOrCreateSpeaker(
      { name: 'Attacker', email: 'attacker@example.com' } as User,
      {
        provider: 'github',
        providerAccountId: '666',
        type: 'oauth',
        access_token: 't',
      } as Account,
    )
    expect(speaker._id).toBeUndefined()
    expect(err?.message).toMatch(/cannot be used to create a new account/)
    expect(err?.message).not.toMatch(/victim/i)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('a grant-only address (not in knownEmails) is refused too', async () => {
    dataset.push({
      _id: 'sp-other',
      _type: 'speaker',
      name: 'Other',
      email: 'other@example.com',
      knownEmails: ['other@example.com'],
      ticketEmailGrants: [{ _key: 'g2', email: 'grant-only@example.com' }],
    })
    try {
      const { err } = await getOrCreateSpeakerForVerifiedEmail(
        'grant-only@example.com',
      )
      expect(err?.message).toMatch(/cannot be used to create a new account/)
      expect(createMock).not.toHaveBeenCalled()
    } finally {
      dataset.pop()
    }
  })

  it('a normal new user is still created', async () => {
    const { speaker, err } =
      await getOrCreateSpeakerForVerifiedEmail('newbie@example.com')
    expect(err).toBeNull()
    expect(speaker.email).toBe('newbie@example.com')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it("still resolves the speaker's own verified address", async () => {
    const { speaker } =
      await getOrCreateSpeakerForVerifiedEmail('victim@example.com')
    expect(speaker._id).toBe('sp-victim')
    expect(speaker.organizerOrgIds).toContain(ORG_Y)
    expect(createMock).not.toHaveBeenCalled()
  })
})
