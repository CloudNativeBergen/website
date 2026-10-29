/**
 * @vitest-environment node
 *
 * Approve, Reject, Remove and Approve all pending (Photo Wall spec §5, §10,
 * §14) on the versioned in-memory store: patches are built by the REAL
 * `@sanity/client` (`commits` holds their `serialize()`), `ifRevisionID` is
 * enforced by the store (the installed `@sanity/mutator` ignores it), and
 * Approve all's GROQ is executed with groq-js over a two-tenant dataset.
 * The races run the real code of the other party inside the store's
 * commit hooks, so each interleaving happens at the point it names.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { deleteWallPost } from './delete'
import {
  APPROVE_ALL_BUDGET_MS,
  approveAllPending,
  moderateWallPost,
} from './moderate'
import {
  APPROVE_ALL_MAX,
  type ModerationAction,
  type WallPostStatus,
} from './moderation'
import { MAX_PENDING_PER_WALL } from './limits'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const id = (n: number) =>
  `wallPost-${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const P1 = id(1)
const ASSET = 'image-sha1-1600x1000-jpg'
const NOW = new Date('2026-10-26T09:00:00.000Z')
const T = NOW.toISOString()

const post = (postId: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: postId,
  _type: 'wallPost',
  _rev: `rev-${postId}`,
  conference: ref('conf-A'),
  status: 'pending',
  photo: { _type: 'image', asset: ref(ASSET) },
  crop: { x: 0.5, y: 0.5 },
  caption: 'Keynote',
  name: 'Ada',
  marketingConsent: true,
  deviceKey: 'device-1',
  submittedAt: '2026-10-26T07:30:00Z',
  ...fields,
})
const asset = (): Doc => ({
  _id: ASSET,
  _type: 'sanity.imageAsset',
  _rev: 'rev-asset',
})
/** The wall, open: Approve reads it just before its commit (§11.1). */
const WALL: Doc = {
  _id: 'photoWall-conf-A',
  _type: 'photoWall',
  _rev: 'rev-wall',
  conference: ref('conf-A'),
  postingMode: 'open',
}

const act = (
  action: ModerationAction,
  from?: WallPostStatus,
  now: Date = NOW,
  postId = P1,
) => moderateWallPost({ conferenceId: 'conf-A', postId, action, from, now })

beforeEach(() => {
  store().reset([WALL, post(P1), asset()])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the actions are guarded patches of status and decision times only (§5, §10)', () => {
  it('Approve: status, approvedAt and decidedAt, guarded by the revision read', async () => {
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'done',
      deviceKey: 'device-1',
    })
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: P1,
            ifRevisionID: `rev-${P1}`,
            set: { status: 'approved', approvedAt: T, decidedAt: T },
          },
        },
      ],
    ])
    // Nothing else changed: the photo, its asset and every field stay.
    expect(store().doc(P1)).toEqual({
      ...post(P1),
      _rev: expect.not.stringMatching(`^rev-${P1}$`),
      status: 'approved',
      approvedAt: T,
      decidedAt: T,
    })
    expect(store().doc(ASSET)).toBeDefined()
  })

  it('Approve from Not shown re-approves it, with a new approvedAt', async () => {
    store().reset([
      WALL,
      post(P1, {
        status: 'notShown',
        approvedAt: '2026-10-26T08:00:00Z',
        decidedAt: '2026-10-26T08:10:00Z',
      }),
    ])
    await expect(act('approve', 'notShown')).resolves.toMatchObject({
      status: 'done',
    })
    expect(store().doc(P1)).toMatchObject({
      status: 'approved',
      approvedAt: T,
      decidedAt: T,
    })
  })

  it('Reject: notShown and decidedAt only', async () => {
    await expect(act('reject')).resolves.toMatchObject({ status: 'done' })
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: P1,
            ifRevisionID: `rev-${P1}`,
            set: { status: 'notShown', decidedAt: T },
          },
        },
      ],
    ])
    expect(store().doc(P1)).not.toHaveProperty('approvedAt')
  })

  it('Remove: notShown and decidedAt, keeping when it was approved', async () => {
    store().reset([
      WALL,
      post(P1, {
        status: 'approved',
        approvedAt: '2026-10-26T08:00:00Z',
        decidedAt: '2026-10-26T08:00:00Z',
      }),
    ])
    await expect(act('remove')).resolves.toMatchObject({ status: 'done' })
    expect(store().commits[0]).toEqual([
      {
        patch: {
          id: P1,
          ifRevisionID: `rev-${P1}`,
          set: { status: 'notShown', decidedAt: T },
        },
      },
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'notShown',
      approvedAt: '2026-10-26T08:00:00Z',
    })
  })
})

describe('allowed from-states (§10): anything else is refused before any write', () => {
  const ALL: WallPostStatus[] = ['pending', 'approved', 'notShown', 'deleting']
  const ALLOWED: Record<ModerationAction, WallPostStatus[]> = {
    approve: ['pending', 'notShown'],
    reject: ['pending'],
    remove: ['approved'],
  }
  const refused = (Object.keys(ALLOWED) as ModerationAction[]).flatMap(
    (action) =>
      ALL.filter((s) => !ALLOWED[action].includes(s)).map(
        (status) => [action, status] as const,
      ),
  )

  it.each(refused)('%s from %s', async (action, status) => {
    store().reset([WALL, post(P1, { status })])
    await expect(act(action)).resolves.toEqual({ status: 'changed' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)?.status).toBe(status)
  })

  it.each([
    ['pending', 'notShown'],
    ['notShown', 'pending'],
  ] as const)(
    'Approve of a card shown %s, when the post is %s now',
    async (from, status) => {
      store().reset([WALL, post(P1, { status })])
      await expect(act('approve', from)).resolves.toEqual({
        status: 'changed',
      })
      expect(store().commits).toEqual([])
    },
  )

  it("is gone, writing nothing, for another conference's post", async () => {
    store().reset([WALL, post(P1, { conference: ref('conf-B') })])
    for (const action of ['approve', 'reject', 'remove'] as const) {
      await expect(act(action)).resolves.toEqual({ status: 'gone' })
    }
    expect(store().commits).toEqual([])
  })

  it('is gone, reading nothing, for an id that is not a Wall Post id', async () => {
    await expect(
      moderateWallPost({
        conferenceId: 'conf-A',
        postId: `${P1},${id(2)}`,
        action: 'approve',
      }),
    ).resolves.toEqual({ status: 'gone' })
    expect(store().docReads).toEqual([])
  })
})

describe('revision conflicts (§10)', () => {
  it('a marketing untick in between: re-read once and retry against the new revision', async () => {
    store().beforeNextCommit(() =>
      store().put({
        ...store().doc(P1)!,
        marketingConsent: false,
        _rev: 'rev-untick',
      }),
    )
    await expect(act('approve', 'pending')).resolves.toMatchObject({
      status: 'done',
    })
    expect(store().commits).toEqual([
      [
        {
          patch: expect.objectContaining({ ifRevisionID: 'rev-untick' }),
        },
      ],
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'approved',
      marketingConsent: false,
    })
  })

  it('an Approve begun on Pending does not retry after another organizer rejected it', async () => {
    store().beforeNextCommit(() =>
      act('reject', undefined, new Date('2026-10-26T08:59:00Z')),
    )
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().doc(P1)).toMatchObject({ status: 'notShown' })
    expect(store().commits).toHaveLength(1)
  })

  it('two organizers on one post: Reject while Approve is in flight ends rejected', async () => {
    store().beforeNextCommit(() => act('approve', 'pending'))
    await expect(act('reject')).resolves.toEqual({ status: 'changed' })
    expect(store().doc(P1)).toMatchObject({ status: 'approved' })
  })

  it('Removes A and B read one revision; A removes, another organizer re-approves; B leaves it approved', async () => {
    store().reset([
      WALL,
      post(P1, {
        status: 'approved',
        approvedAt: '2026-10-26T08:00:00Z',
        decidedAt: '2026-10-26T08:00:00Z',
      }),
    ])
    // B has read the post; before its patch lands, A removes it and another
    // organizer approves it again from Not shown.
    store().beforeNextCommit(async () => {
      await act('remove', undefined, new Date('2026-10-26T08:58:00Z'))
      await act('approve', 'notShown', new Date('2026-10-26T08:59:00Z'))
    })
    await expect(act('remove')).resolves.toEqual({ status: 'changed' })
    expect(store().doc(P1)).toMatchObject({
      status: 'approved',
      approvedAt: '2026-10-26T08:59:00.000Z',
    })
  })

  it('a Delete and a new submit under the id in between: the retry leaves the replacement pending', async () => {
    store().reset([
      WALL,
      post(P1, { _createdAt: '2026-10-26T07:30:00Z' }),
      asset(),
    ])
    store().beforeNextCommit(async () => {
      await deleteWallPost({ conferenceId: 'conf-A', postId: P1 })
      store().put(
        post(P1, {
          _rev: 'rev-replacement',
          _createdAt: '2026-10-26T08:59:00Z',
          // The same bytes give the same asset: only the creation differs.
          caption: 'Unseen',
        }),
      )
    })
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().doc(P1)).toMatchObject({
      _rev: 'rev-replacement',
      status: 'pending',
      caption: 'Unseen',
    })
    expect(store().doc(P1)).not.toHaveProperty('approvedAt')
  })

  it('a STALE card: the post was deleted and re-submitted under the id before the first read; nothing is written', async () => {
    // The card showed the original; the store already holds the replacement.
    const original = { createdAt: '2026-10-26T07:30:00Z', assetId: ASSET }
    store().reset([
      WALL,
      post(P1, {
        _rev: 'rev-replacement',
        _createdAt: '2026-10-26T08:59:00Z',
        caption: 'Unseen',
      }),
      asset(),
    ])
    for (const action of ['approve', 'reject'] as const) {
      await expect(
        moderateWallPost({
          conferenceId: 'conf-A',
          postId: P1,
          action,
          from: action === 'approve' ? 'pending' : undefined,
          shown: original,
          now: NOW,
        }),
      ).resolves.toEqual({ status: 'changed' })
    }
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ status: 'pending' })
  })

  it('the card that shows the post acts on it', async () => {
    store().reset([
      WALL,
      post(P1, { _createdAt: '2026-10-26T07:30:00Z' }),
      asset(),
    ])
    await expect(
      moderateWallPost({
        conferenceId: 'conf-A',
        postId: P1,
        action: 'approve',
        from: 'pending',
        shown: { createdAt: '2026-10-26T07:30:00Z', assetId: ASSET },
        now: NOW,
      }),
    ).resolves.toMatchObject({ status: 'done' })
  })

  it('a second conflict gives up, writing nothing', async () => {
    const bump = (rev: string) => () =>
      store().put({ ...store().doc(P1)!, _rev: rev })
    store().beforeNextCommit(bump('rev-a'))
    store().beforeNextCommit(bump('rev-b'))
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)?.status).toBe('pending')
  })

  it('is gone when the post was deleted between the read and the patch', async () => {
    store().beforeNextCommit(() => store().remove(P1))
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'gone',
    })
  })
})

describe('Approve racing Delete (§14): a deleted post never comes back approved', () => {
  const del = () => deleteWallPost({ conferenceId: 'conf-A', postId: P1 })

  it('Delete finishes while Approve is in flight: Approve finds it gone', async () => {
    store().beforeNextCommit(() => del())
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'gone',
    })
    expect(store().doc(P1)).toBeUndefined()
    expect(store().doc(ASSET)).toBeUndefined()
  })

  it("Delete's first step lands while Approve is in flight: Approve changes nothing", async () => {
    // Delete stops after step 1 (its asset step fails), as on a flaky line.
    store().failReadsThat((read) => read.query.includes('references('))
    store().beforeNextCommit(() => del())
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().doc(P1)).toMatchObject({ status: 'deleting' })
    expect(store().doc(P1)).not.toHaveProperty('photo')
  })

  it('Approve lands while Delete is in flight: Delete re-reads and deletes it anyway', async () => {
    store().beforeNextCommit(() => act('approve', 'pending'))
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
  })

  it('Approve after a Delete finds nothing to approve', async () => {
    await del()
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'gone',
    })
    expect(store().doc(P1)).toBeUndefined()
  })
})

describe('approveAllPending (§10)', () => {
  /** Every stored id was shown, by default: foreign and draft ids too. */
  const run = (
    clock?: () => number,
    postIds = store()
      .all()
      .map((d) => d._id),
  ) =>
    approveAllPending({
      conferenceId: 'conf-A',
      // As each card showed it: the stored creation, and no photo id.
      shown: postIds.map((id) => ({
        id,
        createdAt: (store().doc(id)?._createdAt as string | undefined) ?? null,
        assetId: null,
      })),
      now: NOW,
      clock,
    })

  const pendingPosts = (count: number, device = (n: number) => `device-${n}`) =>
    Array.from({ length: count }, (_, i) =>
      post(id(i + 1), {
        deviceKey: device(i + 1),
        submittedAt: `2026-10-26T07:${String(i).padStart(2, '0')}:00Z`,
      }),
    )

  it("approves every pending post of this wall, and no other conference's, draft or status", async () => {
    store().reset([
      WALL,
      // The first tagged with a talk: its photos are expired (Talk photos §8).
      ...pendingPosts(3, () => 'device-1').map((p, i) =>
        i ? p : { ...p, talk: ref('talk-1') },
      ),
      post(id(4), { status: 'approved' }),
      post(id(5), { status: 'notShown' }),
      post(id(6), { status: 'deleting', photo: undefined }),
      post(`drafts.${id(7)}`),
      // Another conference's pending post, carrying this conference's id in
      // every other field: only the tenant predicate keeps it out.
      post(id(8), {
        conference: ref('conf-B'),
        deviceKey: 'conf-A',
        caption: 'conf-A',
        name: 'conf-A',
      }),
      { ...post(id(9)), _type: 'feedbackResponse' },
    ])
    await expect(run()).resolves.toEqual({
      approved: 3,
      approvedIds: [id(1), id(2), id(3)],
      pending: 3,
      deviceKeys: ['device-1'],
      talkIds: ['talk-1'],
    })
    for (const n of [1, 2, 3]) {
      expect(store().doc(id(n))).toMatchObject({
        status: 'approved',
        approvedAt: T,
        decidedAt: T,
      })
    }
    expect(store().doc(id(8))?.status).toBe('pending')
    expect(store().doc(`drafts.${id(7)}`)?.status).toBe('pending')
    expect(store().doc(id(9))?.status).toBe('pending')
    expect(store().doc(id(5))?.status).toBe('notShown')
    expect(store().doc(id(6))?.status).toBe('deleting')
    // One guarded patch per post, never a transaction of several.
    expect(store().commits).toHaveLength(3)
    for (const commit of store().commits) {
      expect(commit).toEqual([
        {
          patch: {
            id: expect.any(String),
            ifRevisionID: expect.stringMatching(/^rev-wallPost-/),
            set: { status: 'approved', approvedAt: T, decidedAt: T },
          },
        },
      ])
    }
  })

  it('approves the others when one post is rejected mid-run; that one stays as decided', async () => {
    store().reset([WALL, ...pendingPosts(5)])
    // Another organizer's Reject of the third post commits just before the
    // run's first patch; the run read it pending. Stored directly: the run's
    // four patches are in flight at once, so a Reject run through the code
    // here would race them in microtask order, not at a point this names.
    store().beforeNextCommit(() =>
      store().put({
        ...store().doc(id(3))!,
        status: 'notShown',
        decidedAt: '2026-10-26T08:59:00Z',
        _rev: 'rev-rejected',
      }),
    )
    await expect(run()).resolves.toMatchObject({ approved: 4, pending: 5 })
    expect(store().doc(id(3))?.status).toBe('notShown')
    for (const n of [1, 2, 4, 5]) {
      expect(store().doc(id(n))?.status).toBe('approved')
    }
  })

  it('skips a post that changed in any way mid-run: it stays pending for the next press', async () => {
    store().reset([WALL, ...pendingPosts(3)])
    store().beforeNextCommit(() =>
      store().put({ ...store().doc(id(2))!, _rev: 'rev-untick' }),
    )
    await expect(run()).resolves.toMatchObject({ approved: 2, pending: 3 })
    expect(store().doc(id(2))?.status).toBe('pending')
    await expect(run()).resolves.toMatchObject({ approved: 1, pending: 1 })
    expect(store().doc(id(2))?.status).toBe('approved')
  })

  it('reports the device keys of the posts it tried, each once', async () => {
    store().reset([
      WALL,
      ...pendingPosts(4, (n) => (n % 2 ? 'device-odd' : 'device-even')),
    ])
    const result = await run()
    expect(result.deviceKeys.sort()).toEqual(['device-even', 'device-odd'])
  })

  it('runs four patches at a time, never more', async () => {
    store().reset([WALL, ...pendingPosts(10)])
    let inFlight = 0
    let most = 0
    for (let i = 0; i < 10; i++) {
      store().beforeNextCommit(async () => {
        inFlight += 1
        most = Math.max(most, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
      })
    }
    await expect(run()).resolves.toMatchObject({ approved: 10 })
    expect(most).toBe(4)
  })

  it('starts no patch after the 30 s budget, and says how many it approved', async () => {
    store().reset([WALL, ...pendingPosts(10)])
    expect(APPROVE_ALL_BUDGET_MS).toBe(30_000)
    // Each look at the clock is 4 s later: the start, then one per patch.
    let t = 0
    const clock = () => (t += 4_000) - 4_000
    const result = await run(clock)
    expect(result).toMatchObject({ pending: 10 })
    // Looks at 4, 8, …, 28 s are inside the budget: 7 patches.
    expect(result.approved).toBe(7)
    expect(
      Array.from({ length: 10 }, (_, i) => store().doc(id(i + 1))?.status),
    ).toEqual([...Array(7).fill('approved'), ...Array(3).fill('pending')])
  })

  it('approves only the posts the organizer was shown: one that arrived since stays pending', async () => {
    store().reset([WALL, ...pendingPosts(3)])
    await expect(run(undefined, [id(1), id(3)])).resolves.toMatchObject({
      approved: 2,
      pending: 2,
    })
    expect(store().doc(id(2))?.status).toBe('pending')
    expect(store().doc(id(1))?.status).toBe('approved')
    expect(store().doc(id(3))?.status).toBe('approved')
  })

  it('reads nothing and approves nothing when shown nothing', async () => {
    store().reset([WALL, ...pendingPosts(2)])
    await expect(run(undefined, [])).resolves.toEqual({
      approved: 0,
      approvedIds: [],
      pending: 0,
      deviceKeys: [],
      talkIds: [],
    })
    expect(store().reads).toEqual([])
    expect(store().commits).toEqual([])
  })

  it('caps one run at the wall’s pending cap', () => {
    expect(APPROVE_ALL_MAX).toBe(MAX_PENDING_PER_WALL)
  })

  it('skips a post that is not the one its card showed (re-submitted under the id)', async () => {
    store().reset([
      WALL,
      post(id(1), { _createdAt: '2026-10-26T08:59:00Z', caption: 'Unseen' }),
      post(id(2), { _createdAt: '2026-10-26T07:31:00Z' }),
      asset(),
    ])
    await expect(
      approveAllPending({
        conferenceId: 'conf-A',
        shown: [
          { id: id(1), createdAt: '2026-10-26T07:30:00Z', assetId: null },
          { id: id(2), createdAt: '2026-10-26T07:31:00Z', assetId: ASSET },
        ],
        now: NOW,
      }),
    ).resolves.toMatchObject({ approved: 1, pending: 1 })
    expect(store().doc(id(1))?.status).toBe('pending')
    expect(store().doc(id(2))?.status).toBe('approved')
    // The same creation but another photo is not the card's post either.
    store().reset([
      WALL,
      post(id(3), { _createdAt: '2026-10-26T07:32:00Z' }),
      asset(),
    ])
    await expect(
      approveAllPending({
        conferenceId: 'conf-A',
        shown: [
          {
            id: id(3),
            createdAt: '2026-10-26T07:32:00Z',
            assetId: 'image-other-10x10-jpg',
          },
        ],
        now: NOW,
      }),
    ).resolves.toMatchObject({ approved: 0, pending: 0 })
  })

  it('is zero with nothing pending', async () => {
    store().reset([WALL, post(P1, { status: 'approved' })])
    await expect(run()).resolves.toEqual({
      approved: 0,
      approvedIds: [],
      pending: 0,
      deviceKeys: [],
      talkIds: [],
    })
    expect(store().commits).toEqual([])
  })
})

describe('a wall closed by the retention cron (§11.1)', () => {
  const closed = () =>
    store().put({ ...WALL, closedAt: '2026-11-25T03:10:00Z' })

  it('Approve is refused as changed, writing nothing', async () => {
    closed()
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ status: 'pending' })
  })

  it('…so is Approve from Not shown', async () => {
    closed()
    store().put(post(P1, { status: 'notShown' }))
    await expect(act('approve', 'notShown')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().commits).toEqual([])
  })

  it('the wall is re-read just before the commit, after the post: a close that lands in between refuses the write', async () => {
    // Open when the organizer decided; closed by the time Approve reads it.
    let postsReadFirst: string[] = []
    store().beforeEachRead((read) => {
      if (read.query.includes('"photoWall"')) {
        postsReadFirst = [...store().docReads]
        closed()
      }
    })
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    // The wall was read once, AFTER the post, not at the start.
    expect(postsReadFirst).toEqual([P1])
    expect(
      store().reads.filter((r) => r.query.includes('"photoWall"')),
    ).toHaveLength(1)
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ status: 'pending' })
  })

  it('a missing wall refuses Approve the same way', async () => {
    store().remove(WALL._id)
    await expect(act('approve', 'pending')).resolves.toEqual({
      status: 'changed',
    })
    expect(store().commits).toEqual([])
  })

  it.each(['reject', 'remove'] as const)(
    '%s stays allowed: a photo can still be taken down',
    async (action) => {
      closed()
      store().put(
        post(P1, { status: action === 'remove' ? 'approved' : 'pending' }),
      )
      await expect(act(action)).resolves.toMatchObject({ status: 'done' })
      expect(store().doc(P1)).toMatchObject({ status: 'notShown' })
    },
  )

  it('Approve all approves nothing, reads no post twice and writes nothing', async () => {
    closed()
    store().put(post(id(2)))
    const result = await approveAllPending({
      conferenceId: 'conf-A',
      shown: [P1, id(2)].map((postId) => ({
        id: postId,
        createdAt: null,
        assetId: null,
      })),
      now: NOW,
    })
    expect(result).toEqual({
      approved: 0,
      approvedIds: [],
      pending: 2,
      deviceKeys: [],
      talkIds: [],
    })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ status: 'pending' })
  })

  it('Delete stays allowed', async () => {
    closed()
    await expect(
      deleteWallPost({ conferenceId: 'conf-A', postId: P1 }),
    ).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
  })
})
