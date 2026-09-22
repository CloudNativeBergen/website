// @vitest-environment node
/**
 * #1148 — WHO EACH READ TELLS ABOUT A TAG OPT-OUT.
 *
 * The defects on this ticket all came from the same blind spot: "hide it from
 * other people" and "show it to its owner" are the same field on the same
 * document, and each read resolves that tension differently. Three separate
 * regressions reached review because the reads were changed one at a time with
 * nothing pinning the others.
 *
 * So this covers the reads as a SET, asserting the VALUE each one returns for a
 * speaker who really is opted out:
 *
 *   - `getSpeaker`         → carries it. The speaker's own profile form and the
 *                            proposal editor's `currentUserSpeaker` read here,
 *                            and `updateSpeaker` reads back through it.
 *   - `getSpeakers`        → carries it. The admin list feeds
 *                            `SpeakerManagementModal`, whose one-way lock is
 *                            computed from this value; narrowing this
 *                            projection would silently unlock it.
 *   - `getPublicSpeaker`   → must NOT carry it. A public profile page has no
 *                            business publishing who declined to be tagged.
 *
 * `getProposal` has its own file (`getProposal.cospeakerOptOut.test.ts`), being
 * the one read that must answer differently per row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
  speakerImageUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn(),
  organizationReference: vi.fn(),
}))

import { getSpeaker, getSpeakers, getPublicSpeaker } from './sanity'

type Doc = Record<string, unknown> & { _id: string; _type: string }
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const dataset: Doc[] = [
  { _id: 'org-A', _type: 'organization', name: 'A' },
  { _id: 'conf-A', _type: 'conference', organization: ref('org-A') },
  {
    _id: 'spk-1',
    _type: 'speaker',
    name: 'Grace',
    email: 'grace@example.com',
    slug: { _type: 'slug', current: 'grace' },
    organizations: [ref('org-A')],
    socialTagOptOut: true,
    socialTagOptOutAt: '2026-09-22T10:30:00.000Z',
  },
  {
    _id: 'talk-1',
    _type: 'talk',
    title: 'A talk',
    status: 'confirmed',
    conference: ref('conf-A'),
    speakers: [ref('spk-1')],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('reads that MUST carry the opt-out', () => {
  it('getSpeaker — the speaker’s own profile and the writer’s read-back', async () => {
    const { speaker, err } = await getSpeaker('spk-1')

    expect(err).toBeNull()
    expect(speaker.socialTagOptOut).toBe(true)
    expect(speaker.socialTagOptOutAt).toBe('2026-09-22T10:30:00.000Z')
  })

  it('getSpeakers — the admin list the organizer one-way lock is computed from', async () => {
    const { speakers, err } = await getSpeakers(
      'conf-A',
      ['confirmed'] as never,
      false,
      'org-A',
    )

    expect(err).toBeNull()
    const grace = speakers.find((s) => s.name === 'Grace')
    expect(grace, 'the fixture speaker must be in the list').toBeTruthy()
    expect(grace!.socialTagOptOut).toBe(true)
  })
})

describe('reads that must NOT carry it', () => {
  it('getPublicSpeaker — a public profile does not publish who declined tagging', async () => {
    const { speaker, err } = await getPublicSpeaker('conf-A', 'grace')

    expect(err).toBeNull()
    // Vacuity guard: the projection really did return this speaker.
    expect((speaker as { name?: string }).name).toBe('Grace')

    expect(speaker).not.toHaveProperty('socialTagOptOut')
    expect(speaker).not.toHaveProperty('socialTagOptOutAt')
  })
})
