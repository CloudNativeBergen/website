/**
 * @vitest-environment node
 *
 * Photos of your talks (talk photos spec §7.3): the dashboard read EXECUTED
 * as GROQ on the versioned store. Adversarial fixture: another speaker's
 * talk, a post on another conference, a pending post and a draft. Each
 * would show on this speaker's dashboard if it counted.
 */
import { describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { readSpeakerTalkPosts } from './wall-read'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const ASSET = 'image-sha1-1600x1000-jpg'
const post = (
  n: number,
  talk: string,
  fields: Record<string, unknown> = {},
) => ({
  _id: `wallPost-t${n}`,
  _type: 'wallPost',
  conference: ref('conf-A'),
  status: 'approved',
  photo: { _type: 'image', asset: ref(ASSET) },
  approvedAt: `2026-10-26T10:0${n}:00Z`,
  talk: { ...ref(talk), _weak: true },
  ...fields,
})
const talk = (id: string, speakers: string[]) => ({
  _id: id,
  _type: 'talk',
  title: `Title ${id}`,
  conference: ref('conf-A'),
  speakers: speakers.map(ref),
})

function seed(coSpeakerOptedOut?: boolean) {
  h.store!.reset([
    {
      _id: ASSET,
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/p/d/sha1-1600x1000.jpg',
      metadata: { dimensions: { width: 1600, height: 1000 } },
    },
    { _id: 'sp-me', _type: 'speaker' },
    { _id: 'sp-co', _type: 'speaker', talkPhotosOptOut: coSpeakerOptedOut },
    { _id: 'sp-other', _type: 'speaker' },
    talk('talk-mine', ['sp-me']),
    talk('talk-shared', ['sp-co', 'sp-me']),
    talk('talk-other', ['sp-other']),
    post(1, 'talk-mine'),
    post(2, 'talk-shared'),
    post(3, 'talk-mine'),
    post(4, 'talk-other'),
    post(5, 'talk-mine', { status: 'pending' }),
    post(6, 'talk-mine', { conference: ref('conf-B') }),
    { ...post(7, 'talk-mine'), _id: 'drafts.wallPost-t7' },
  ])
}

const view = async (speakerId = 'sp-me') =>
  (await readSpeakerTalkPosts('conf-A', speakerId)).map((t) => ({
    talkId: t.talkId,
    title: t.title,
    hidden: t.hidden,
    ids: t.posts.map((p) => p._id),
  }))

describe('readSpeakerTalkPosts (talk photos spec §7.3)', () => {
  it("answers the speaker's own talks only, approved, newest first", async () => {
    seed()
    expect(await view()).toEqual([
      {
        talkId: 'talk-mine',
        title: 'Title talk-mine',
        hidden: false,
        ids: ['wallPost-t3', 'wallPost-t1'],
      },
      {
        talkId: 'talk-shared',
        title: 'Title talk-shared',
        hidden: false,
        ids: ['wallPost-t2'],
      },
    ])
  })

  it('keeps a talk a co-speaker opted out of, marked hidden', async () => {
    seed(true)
    const talks = await view()
    expect(talks.find((t) => t.talkId === 'talk-shared')).toMatchObject({
      hidden: true,
      ids: ['wallPost-t2'],
    })
    expect(talks.find((t) => t.talkId === 'talk-mine')?.hidden).toBe(false)
  })

  it("never answers another speaker's talk", async () => {
    seed()
    const all = (await view()).flatMap((t) => t.ids)
    expect(all).not.toContain('wallPost-t4')
    expect(await view('sp-other')).toEqual([
      {
        talkId: 'talk-other',
        title: 'Title talk-other',
        hidden: false,
        ids: ['wallPost-t4'],
      },
    ])
  })
})
