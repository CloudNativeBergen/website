/**
 * @vitest-environment node
 *
 * The talk photos opt-out (talk photos spec §4.2, §7.4, §8) end to end over
 * the versioned store: the self-only mutation, the organizer path that may
 * set but never clear, the tags each write expires, and what the public and
 * dashboard reads answer afterwards.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  expired: [] as string[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return { ...h.store.clients, clientRead: h.store.clients.clientReadUncached }
})
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: (tag: string) => h.expired.push(tag),
}))
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conf-A', organization: ref('org-A') },
    domain: 'a.test',
    error: null,
  }),
}))

import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'
import { readSpeakerTalkPosts, readWallPosts } from '@/lib/photo-wall/wall-read'

function ref(id: string) {
  return { _type: 'reference', _ref: id }
}
const ASSET = 'image-sha1-1600x1000-jpg'
const speaker = (id: string) => ({
  _id: id,
  _type: 'speaker',
  name: id,
  email: `${id}@example.com`,
  organizations: [ref('org-A')],
})
const talk = (id: string, speakers: string[], conference = 'conf-A') => ({
  _id: id,
  _type: 'talk',
  title: id,
  conference: ref(conference),
  speakers: speakers.map(ref),
})

beforeEach(() => {
  h.expired = []
  h.store!.reset([
    { _id: 'org-A', _type: 'organization', name: 'A' },
    {
      _id: 'conf-A',
      _type: 'conference',
      organization: ref('org-A'),
      organizers: [ref('admin-1')],
    },
    {
      _id: ASSET,
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/p/d/sha1-1600x1000.jpg',
      metadata: { dimensions: { width: 1600, height: 1000 } },
    },
    speaker('admin-1'),
    speaker('sp-me'),
    speaker('sp-co'),
    talk('talk-shared', ['sp-me', 'sp-co']),
    talk('talk-solo', ['sp-co']),
    talk('talk-old', ['sp-co'], 'conf-old'),
    talk('talk-mine', ['sp-me']),
    {
      _id: 'wallPost-1',
      _type: 'wallPost',
      conference: ref('conf-A'),
      status: 'approved',
      photo: { _type: 'image', asset: ref(ASSET) },
      approvedAt: '2026-10-26T10:00:00Z',
      talk: { ...ref('talk-shared'), _weak: true },
    },
  ])
})

function caller(id: string, organizer = false) {
  const s = {
    _id: id,
    name: id,
    isOrganizer: organizer,
    organizerOrgIds: organizer ? ['org-A'] : [],
  }
  return speakerRouter.createCaller({
    session: { speaker: s, user: { name: id } },
    speaker: s,
  } as unknown as Context)
}

const doc = (id: string) => h.store!.doc(id) as Record<string, unknown>

describe('speaker.setTalkPhotosOptOut (self only)', () => {
  it('sets and clears only that field, on the signed-in speaker only', async () => {
    const before = { ...doc('sp-co') }
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: true })
    const after = doc('sp-co')
    expect(after.talkPhotosOptOut).toBe(true)
    expect(typeof after.talkPhotosOptOutAt).toBe('string')
    const { _rev, _updatedAt, talkPhotosOptOut, talkPhotosOptOutAt, ...rest } =
      after
    void [_rev, _updatedAt, talkPhotosOptOut, talkPhotosOptOutAt]
    const { _rev: r0, _updatedAt: u0, ...restBefore } = before
    void [r0, u0]
    expect(rest).toEqual(restBefore)
    expect(doc('sp-me').talkPhotosOptOut).toBeUndefined()

    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: false })
    expect(doc('sp-co').talkPhotosOptOut).toBeUndefined()
    expect(doc('sp-co').talkPhotosOptOutAt).toBeUndefined()
  })

  it('takes no speaker id: an extra key cannot aim it at someone else', async () => {
    await caller('sp-me').setTalkPhotosOptOut({
      talkPhotosOptOut: true,
      speakerId: 'sp-co',
    } as never)
    expect(doc('sp-me').talkPhotosOptOut).toBe(true)
    expect(doc('sp-co').talkPhotosOptOut).toBeUndefined()
  })

  it("expires every talk's tag of the speaker, in any conference, and the speaker pages", async () => {
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: true })
    expect(h.expired.sort()).toEqual(
      [
        'content:speaker-detail',
        'photo-wall-talk:talk-old',
        'photo-wall-talk:talk-shared',
        'photo-wall-talk:talk-solo',
      ].sort(),
    )
    h.expired = []
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: false })
    expect(h.expired).toContain('photo-wall-talk:talk-shared')
  })

  it("a co-speaker's opt-out hides the public read, not the dashboard", async () => {
    expect(await readWallPosts('conf-A', 'talk-shared')).toHaveLength(1)
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: true })
    expect(await readWallPosts('conf-A', 'talk-shared')).toHaveLength(0)
    const [mine] = await readSpeakerTalkPosts('conf-A', 'sp-me')
    expect(mine).toMatchObject({ talkId: 'talk-shared', hidden: true })
    expect(mine.posts).toHaveLength(1)
  })

  it('a bulk profile save cannot touch it', async () => {
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: true })
    await caller('sp-co').update({
      name: 'sp-co',
      talkPhotosOptOut: false,
    } as never)
    expect(doc('sp-co').talkPhotosOptOut).toBe(true)
  })
})

describe('speaker.admin.update (organizer may set, never clear)', () => {
  it('sets it and expires the tags', async () => {
    await caller('admin-1', true).admin.update({
      id: 'sp-co',
      data: { talkPhotosOptOut: true },
    })
    expect(doc('sp-co').talkPhotosOptOut).toBe(true)
    expect(h.expired).toContain('photo-wall-talk:talk-shared')
  })

  it('refuses to clear it, FORBIDDEN, and nothing changes', async () => {
    await caller('sp-co').setTalkPhotosOptOut({ talkPhotosOptOut: true })
    await expect(
      caller('admin-1', true).admin.update({
        id: 'sp-co',
        data: { talkPhotosOptOut: false },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(doc('sp-co').talkPhotosOptOut).toBe(true)
  })
})
