/**
 * Parity pin for `createSpeaker` (#1897): the seam must write exactly the
 * document the routers wrote before it (`buildOrganizerCreatedSpeaker` + a raw
 * `create`), including slug collision handling and the org membership key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()
const createMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { create: (...a: unknown[]) => createMock(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/proposal/server', () => ({ listPublicTalks: vi.fn() }))

import { createSpeaker } from './server'
import { buildOrganizerCreatedSpeaker } from './sanity'

const NOW = '2026-11-03T12:00:00.000Z'
const fields = {
  name: 'Ada Lovelace',
  email: '  Ada@Example.COM ',
  title: 'Engineer',
  bio: 'Bio',
  company: 'Analytical',
  links: ['https://ada.example'],
  flags: ['first-time-speaker'],
  consent: undefined,
  image: 'image-abc-200x200-png',
  socialTagOptOut: true,
} as Parameters<typeof buildOrganizerCreatedSpeaker>[0]

// The document the old router path wrote, spelled out so a change to the
// builder cannot move both sides of the comparison at once.
const EXPECTED = {
  _type: 'speaker',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  slug: { _type: 'slug', current: 'ada-lovelace-2' },
  title: 'Engineer',
  bio: 'Bio',
  company: 'Analytical',
  links: ['https://ada.example'],
  flags: ['first-time-speaker'],
  consent: undefined,
  image: {
    _type: 'image',
    asset: { _type: 'reference', _ref: 'image-abc-200x200-png' },
  },
  organizations: [{ _type: 'reference', _ref: 'org-1', _key: 'org-1' }],
  socialTagOptOut: true,
  socialTagOptOutAt: NOW,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  // `ada-lovelace` is taken, so the slug must step to `-2`.
  fetchMock.mockImplementation(async (_q: string, p: { slug: string }) =>
    p.slug === 'ada-lovelace' ? 'speaker-other' : null,
  )
  createMock.mockImplementation(async (doc: object) => ({
    _id: 'new-id',
    ...doc,
  }))
})
afterEach(() => vi.useRealTimers())

describe('createSpeaker', () => {
  it('writes exactly the old builder document and returns the id', async () => {
    const old = await buildOrganizerCreatedSpeaker(fields, 'org-1')
    expect(old).toStrictEqual(EXPECTED)

    const result = await createSpeaker({ ...fields, orgId: 'org-1' })

    expect(result).toStrictEqual({ id: 'new-id' })
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][0]).toStrictEqual(EXPECTED)
  })

  it('queues the same document with the given id on a transaction', async () => {
    const tx = { create: vi.fn() }
    const result = await createSpeaker(
      { name: 'Grace', email: 'grace@example.com', orgId: 'org-1' },
      { id: 'minted', transaction: tx as never },
    )
    const old = await buildOrganizerCreatedSpeaker(
      { name: 'Grace', email: 'grace@example.com' },
      'org-1',
    )

    expect(result).toStrictEqual({ id: 'minted' })
    expect(createMock).not.toHaveBeenCalled()
    expect(tx.create).toHaveBeenCalledTimes(1)
    expect(tx.create.mock.calls[0][0]).toStrictEqual({ _id: 'minted', ...old })
    expect(old).not.toHaveProperty('socialTagOptOut')
    expect(old).not.toHaveProperty('knownEmails')
  })

  it('refuses without an organization and writes nothing', async () => {
    await expect(createSpeaker({ name: 'X', orgId: '' })).rejects.toThrow(
      'without an organization',
    )
    expect(createMock).not.toHaveBeenCalled()
  })
})
