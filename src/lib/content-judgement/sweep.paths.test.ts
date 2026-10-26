/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  // The Feedback Code index's directives, for Delete my answer.
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import { deleteWallPost } from '@/lib/photo-wall/delete'
import { runPhotoWallRetention } from '@/lib/photo-wall/retention'
import { deleteFeedback } from '@/lib/feedback/delete'
import { feedbackResponseId, recordAnswer } from '@/lib/feedback/device'
import { removeResponses } from '@/lib/feedback/admin'
import { foldExpiredFeedback } from '@/lib/feedback/fold'
import { deleteExpiredMessagingData } from '@/lib/messaging/retention'
import { deleteProposal } from '@/lib/proposal/data/sanity'
import { eraseSpeakerInPlace } from '@/lib/speaker/erasure'
import { sweepOrphanJudgements } from './sweep'

type Doc = Record<string, unknown> & { _id: string }
const NOW = new Date('2026-10-26T04:50:00.000Z')
const AT = '2024-01-01T12:00:00.000Z'
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const store = () => h.store!
const conference = (id = 'conf-A', endDate = '2024-01-01') => ({
  _id: id,
  _type: 'conference',
  _rev: `rev-${id}`,
  title: id,
  endDate,
})
const content = (id: string, type: string, fields: object = {}): Doc => ({
  _id: id,
  _type: type,
  _rev: `rev-${id}`,
  conference: ref('conf-A'),
  ...fields,
})
const judgement = (id: string, contentId: string, surface: string): Doc => ({
  _id: id,
  _type: 'contentJudgement',
  _rev: `rev-${id}`,
  conference: ref('conf-A'),
  surface,
  content: { ...ref(contentId), _weak: true },
})
const survivor = content('wallPost-survivor', 'wallPost', {
  status: 'approved',
})
const survivorJudgement = judgement(
  'judgement-survivor',
  survivor._id,
  'wallPost',
)

function seed(documents: Doc[]) {
  store().reset([conference(), survivor, survivorJudgement, ...documents])
}

async function expectSwept(ids: string[], deleted: number) {
  // Prove the path actually deleted its content and left the weak references.
  for (const id of ids) expect(store().doc(id)).toBeUndefined()
  expect(
    store()
      .all()
      .filter((d) => d._type === 'contentJudgement'),
  ).toHaveLength(deleted + 1)
  const report = await sweepOrphanJudgements({ now: NOW })
  expect(report.deleted).toBe(deleted)
  expect(
    store()
      .all()
      .filter((d) => d._type === 'contentJudgement'),
  ).toEqual([survivorJudgement])
  expect(store().doc(survivor._id)).toEqual(survivor)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('one orphan sweep after the existing real deletion paths', () => {
  it.each([
    ['organizer Delete now', undefined],
    ['attendee Delete', 'device-1'],
  ])(
    '%s deletes the post and the sweep deletes its judgement',
    async (_, deviceKey) => {
      // Both callers use src/lib/photo-wall/delete.ts:57, including asset purge.
      const post = content('wallPost-delete', 'wallPost', {
        status: 'approved',
        deviceKey: 'device-1',
        photo: { _type: 'image', asset: ref('image-test-1600x1000-jpg') },
      })
      seed([
        post,
        { _id: 'image-test-1600x1000-jpg', _type: 'sanity.imageAsset' },
        judgement('judgement-post', post._id, 'wallPost'),
      ])
      expect(
        await deleteWallPost({
          conferenceId: 'conf-A',
          postId: post._id,
          deviceKey,
        }),
      ).toEqual({ status: 'deleted', deviceKey: 'device-1' })
      await expectSwept([post._id, 'image-test-1600x1000-jpg'], 1)
    },
  )

  it.each([
    ['Remove', 1],
    ['bulk Remove', 3],
  ])(
    'feedback %s deletes whole responses before the sweep',
    async (_, count) => {
      // Both call src/lib/feedback/admin.ts:534; a chart range adds bounds.
      const responses = Array.from({ length: count }, (_, i) =>
        content(`response-${i}`, 'feedbackResponse', {
          talk: ref('talk-delete'),
          colour: 'green',
          comment: 'A comment',
          submittedAt: AT,
        }),
      )
      seed([
        content('talk-delete', 'talk', { status: 'confirmed' }),
        ...responses,
        ...responses.map((r) =>
          judgement(`judgement-${r._id}`, r._id, 'feedbackComment'),
        ),
      ])
      expect(
        await removeResponses({
          conferenceId: 'conf-A',
          responses: responses.map((r) => ({ id: r._id, submittedAt: AT })),
          ...(count > 1 && {
            range: {
              from: '2024-01-01T00:00:00.000Z',
              to: '2024-01-02T00:00:00.000Z',
            },
          }),
        }),
      ).toEqual({ status: 'ok', removed: count, gone: 0, changed: 0 })
      await expectSwept(
        responses.map((r) => r._id),
        count,
      )
    },
  )

  it('the daily feedback Fold deletes responses before the sweep', async () => {
    seed([
      content('talk-delete', 'talk', {
        status: 'confirmed',
        feedbackCode: 'ABC234',
      }),
      content('response-delete', 'feedbackResponse', {
        talk: ref('talk-delete'),
        colour: 'green',
        comment: 'A comment',
        submittedAt: AT,
      }),
      judgement('judgement-response', 'response-delete', 'feedbackComment'),
    ])
    expect(await foldExpiredFeedback({ now: NOW })).toMatchObject({
      folded: 1,
      responses: 1,
      failed: 0,
    })
    expect(store().doc('talk-delete')?.feedbackFolded).toMatchObject({
      greenCount: 1,
    })
    await expectSwept(['response-delete'], 1)
  })

  it('the Photo Wall 30-day deletion deletes posts before the sweep', async () => {
    // src/lib/photo-wall/retention.ts:258 purges every post of a due wall's
    // conference, so the wall is on B: the survivor's conference has none.
    const onB = (doc: Doc) => ({ ...doc, conference: ref('conf-B') })
    const post = onB(
      content('wallPost-retention', 'wallPost', {
        status: 'approved',
        deviceKey: 'device-1',
        photo: { _type: 'image', asset: ref('image-wall-1600x1000-jpg') },
      }),
    )
    seed([
      conference('conf-B'),
      onB(content('photoWall-conf-B', 'photoWall', { closedAt: AT })),
      post,
      {
        _id: 'image-wall-1600x1000-jpg',
        _type: 'sanity.imageAsset',
        source: { name: 'photo-wall', id: 'conf-B' },
      },
      onB(judgement('judgement-post', post._id, 'wallPost')),
    ])
    expect(
      await runPhotoWallRetention({
        now: NOW,
        deadline: new Date(NOW.getTime() + 290_000),
      }),
    ).toMatchObject({ due: 1, purged: 1, posts: 1, assets: 1, unfinished: [] })
    await expectSwept([post._id, 'image-wall-1600x1000-jpg'], 1)
  })

  it("the attendee's Delete my answer deletes the response before the sweep", async () => {
    // src/lib/feedback/delete.ts:60, with the cookie Submit would have set.
    const { device, cookie } = recordAnswer(null, 'talk-delete', NOW)
    const id = feedbackResponseId(device.token, 'talk-delete')
    seed([
      content('talk-delete', 'talk', {
        status: 'confirmed',
        feedbackCode: 'ABC234',
      }),
      content(id, 'feedbackResponse', {
        talk: ref('talk-delete'),
        colour: 'green',
        comment: 'A comment',
        submittedAt: AT,
      }),
      judgement('judgement-response', id, 'feedbackComment'),
    ])
    expect(
      await deleteFeedback({
        conference: conference(),
        code: 'ABC234',
        cookie: cookie.value,
        now: NOW,
      }),
    ).toMatchObject({ outcome: { deleted: true } })
    await expectSwept([id], 1)
  })

  it("speaker erasure's feedback fold deletes responses before the sweep", async () => {
    // A talk left with no live speaker folds through src/lib/feedback/fold.ts:327.
    seed([
      {
        _id: 'speaker-erase',
        _type: 'speaker',
        _rev: 'rev-speaker-erase',
        name: 'Ada',
        email: 'ada@example.com',
        slug: { _type: 'slug', current: 'ada' },
      },
      content('talk-delete', 'talk', {
        status: 'confirmed',
        title: 'A talk',
        speakers: [{ ...ref('speaker-erase'), _key: 'k0' }],
        feedbackCode: 'ABC234',
      }),
      content('response-delete', 'feedbackResponse', {
        talk: ref('talk-delete'),
        colour: 'green',
        comment: 'A comment',
        submittedAt: AT,
      }),
      judgement('judgement-response', 'response-delete', 'feedbackComment'),
    ])
    const result = await eraseSpeakerInPlace({
      speakerId: 'speaker-erase',
      actor: 'op',
      waitForInFlightSubmits: async () => {},
    })
    expect(result.err).toBeNull()
    expect(result.feedbackFolds).toEqual([
      { talkId: 'talk-delete', status: 'folded', responses: 1, error: null },
    ])
    await expectSwept(['response-delete'], 1)
  })

  it('the messaging retention purge deletes conversations before the sweep', async () => {
    seed([
      content('conversation-delete', 'conversation', {
        conversationType: 'general',
      }),
      {
        _id: 'message-delete',
        _type: 'message',
        conversation: ref('conversation-delete'),
      },
      {
        _id: 'preference-delete',
        _type: 'conversationPreference',
        conversation: ref('conversation-delete'),
      },
      judgement(
        'judgement-conversation',
        'conversation-delete',
        'conversation',
      ),
    ])
    expect(await deleteExpiredMessagingData()).toEqual({
      conferences: 1,
      messages: 1,
      conversations: 1,
      preferences: 1,
      notifications: 0,
    })
    await expectSwept(
      ['conversation-delete', 'message-delete', 'preference-delete'],
      1,
    )
  })

  it('the proposal-delete cascade removes feedback and conversation content before the sweep', async () => {
    seed([
      content('talk-delete', 'talk', { status: 'confirmed' }),
      content('response-delete', 'feedbackResponse', {
        talk: ref('talk-delete'),
        colour: 'green',
        submittedAt: AT,
      }),
      content('conversation-delete', 'conversation', {
        conversationType: 'proposal',
        proposal: { ...ref('talk-delete'), _weak: true },
      }),
      {
        _id: 'message-delete',
        _type: 'message',
        conversation: ref('conversation-delete'),
      },
      {
        _id: 'preference-delete',
        _type: 'conversationPreference',
        conversation: ref('conversation-delete'),
      },
      judgement('judgement-response', 'response-delete', 'feedbackComment'),
      judgement(
        'judgement-conversation',
        'conversation-delete',
        'conversation',
      ),
    ])
    expect(await deleteProposal('talk-delete')).toEqual({
      err: null,
      conferenceId: 'conf-A',
    })
    await expectSwept(
      [
        'talk-delete',
        'response-delete',
        'conversation-delete',
        'message-delete',
        'preference-delete',
      ],
      2,
    )
  })
})

describe('a selected judgement replaced before the sweep commits', () => {
  it.each([
    ['in its own conference', 'conf-A'],
    ['re-scoped to another conference', 'conf-B'],
  ])(
    'preserves the newer judgement %s under its revision guard',
    async (_, replacementConference) => {
      const selected = judgement('judgement-race', 'content-gone', 'wallPost')
      seed([conference('conf-B'), selected])
      const replacementContent = {
        ...content('wallPost-new', 'wallPost', { status: 'approved' }),
        conference: ref(replacementConference),
      }
      const replacement = {
        ...selected,
        _rev: 'new-revision',
        conference: ref(replacementConference),
        content: { ...ref(replacementContent._id), _weak: true },
      }
      store().beforeNextCommit(() => {
        store().put(replacementContent)
        store().put(replacement)
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Conference A's pass fails on the guard; the run goes on.
      expect(await sweepOrphanJudgements({ now: NOW })).toMatchObject({
        deleted: 0,
        failed: 1,
      })
      expect(String(logged.mock.calls[0]?.[1])).toContain('revision mismatch')
      expect(store().doc(selected._id)).toEqual(replacement)
      expect(store().doc(replacementContent._id)).toEqual(replacementContent)
      expect(store().doc(survivorJudgement._id)).toEqual(survivorJudgement)
      expect(store().commits).toHaveLength(0)
    },
  )
})
