import { describe, expect, it } from 'vitest'
import {
  countByTab,
  cropOutline,
  postsInTab,
  tabOf,
  type ModerationPost,
} from './moderation'

describe('cropOutline: the square crop on the whole photo (§4.2)', () => {
  it('a landscape photo: the square is the full height, placed by x', () => {
    // 1600×1000: side 1000, 600 px to spare across. x = 0 is the left edge.
    expect(
      cropOutline({ width: 1600, height: 1000 }, { x: 0, y: 0.5 }),
    ).toEqual({ left: 0, top: 0, width: 0.625, height: 1 })
    // x = 1 is flush right: 600/1600 from the left.
    expect(
      cropOutline({ width: 1600, height: 1000 }, { x: 1, y: 0.5 }),
    ).toEqual({ left: 0.375, top: 0, width: 0.625, height: 1 })
    // x = 0.5 is centred.
    expect(
      cropOutline({ width: 1600, height: 1000 }, { x: 0.5, y: 0.5 }),
    ).toEqual({ left: 0.1875, top: 0, width: 0.625, height: 1 })
  })

  it('a portrait photo: the square is the full width, placed by y', () => {
    // 1200×1600: side 1200, 400 px to spare down.
    expect(
      cropOutline({ width: 1200, height: 1600 }, { x: 0.5, y: 1 }),
    ).toEqual({ left: 0, top: 0.25, width: 1, height: 0.75 })
  })

  it('a square photo is its own crop', () => {
    expect(
      cropOutline({ width: 900, height: 900 }, { x: 0.2, y: 0.9 }),
    ).toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('a value out of 0–1 is clamped', () => {
    expect(cropOutline({ width: 1600, height: 1000 }, { x: 7, y: -3 })).toEqual(
      { left: 0.375, top: 0, width: 0.625, height: 1 },
    )
  })
})

const post = (
  _id: string,
  status: ModerationPost['status'],
  times: Partial<
    Pick<ModerationPost, 'submittedAt' | 'approvedAt' | 'decidedAt'>
  > = {},
): ModerationPost => ({
  _id,
  status,
  photo: null,
  crop: { x: 0.5, y: 0.5 },
  caption: null,
  name: null,
  marketingConsent: false,
  submittedAt: null,
  approvedAt: null,
  decidedAt: null,
  ...times,
})

describe('the tabs (§10, §12)', () => {
  it('puts each status on its tab, a deleting post in Not shown', () => {
    expect(tabOf('pending')).toBe('pending')
    expect(tabOf('approved')).toBe('onTheWall')
    expect(tabOf('notShown')).toBe('notShown')
    expect(tabOf('deleting')).toBe('notShown')
  })

  it('Pending is oldest first: the card under the thumb stays put as new ones arrive', () => {
    const posts = [
      post('late', 'pending', { submittedAt: '2026-10-26T10:00:00Z' }),
      post('early', 'pending', { submittedAt: '2026-10-26T09:00:00Z' }),
      post('wall', 'approved', { submittedAt: '2026-10-26T08:00:00Z' }),
    ]
    expect(postsInTab(posts, 'pending').map((p) => p._id)).toEqual([
      'early',
      'late',
    ])
  })

  it('On the wall is newest approval first, as the wall shows them', () => {
    const posts = [
      post('older', 'approved', {
        submittedAt: '2026-10-26T10:00:00Z',
        approvedAt: '2026-10-26T10:05:00Z',
      }),
      post('newer', 'approved', {
        submittedAt: '2026-10-26T09:00:00Z',
        approvedAt: '2026-10-26T11:00:00Z',
      }),
    ]
    expect(postsInTab(posts, 'onTheWall').map((p) => p._id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('Not shown is the latest decision first, with deleting posts among them', () => {
    const posts = [
      post('old-decision', 'notShown', {
        submittedAt: '2026-10-26T09:00:00Z',
        decidedAt: '2026-10-26T09:30:00Z',
      }),
      post('deleting', 'deleting', { submittedAt: '2026-10-26T09:10:00Z' }),
      post('new-decision', 'notShown', {
        submittedAt: '2026-10-26T08:00:00Z',
        decidedAt: '2026-10-26T12:00:00Z',
      }),
    ]
    expect(postsInTab(posts, 'notShown').map((p) => p._id)).toEqual([
      'new-decision',
      'old-decision',
      'deleting',
    ])
  })

  it('counts each tab, a deleting post in Not shown and never Pending', () => {
    const posts = [
      post('p1', 'pending'),
      post('p2', 'pending'),
      post('a', 'approved'),
      post('n', 'notShown'),
      post('d', 'deleting'),
    ]
    expect(countByTab(posts)).toEqual({
      pending: 2,
      onTheWall: 1,
      notShown: 2,
    })
    expect(countByTab([])).toEqual({ pending: 0, onTheWall: 0, notShown: 0 })
  })

  it('leaves the given list alone', () => {
    const posts = [
      post('b', 'pending', { submittedAt: '2026-10-26T10:00:00Z' }),
      post('a', 'pending', { submittedAt: '2026-10-26T09:00:00Z' }),
    ]
    postsInTab(posts, 'pending')
    expect(posts.map((p) => p._id)).toEqual(['b', 'a'])
  })
})
