/**
 * @vitest-environment node
 *
 * The GROQ the Sanity store actually sends, EXECUTED against fixture
 * datasets with groq-js (Sanity's reference implementation). The in-memory
 * store used by the engine tests cannot exercise the query text, and the
 * double-post defences (draft and release-version exclusion, per-conference
 * fairness, the stale sweep) live in that text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => {
  const deleted: string[] = []
  const guarded: string[] = []
  const state = { commitError: null as Error | null }
  const tx = {
    delete: (id: string) => {
      deleted.push(id)
      return tx
    },
    patch: (id: string, build: (p: unknown) => unknown) => {
      const p = {
        ifRevisionId(rev: string) {
          guarded.push(`${id}@${rev}`)
          return p
        },
        set() {
          return p
        },
      }
      build(p)
      return tx
    },
    commit: async () => {
      if (state.commitError) throw state.commitError
      return {}
    },
  }
  return {
    dataset: [] as Record<string, unknown>[],
    queries: [] as string[],
    deleted,
    guarded,
    patched: [] as unknown[],
    appended: [] as unknown[],
    state,
    tx,
  }
})

async function run(query: string, params: Record<string, unknown> = {}) {
  h.queries.push(query)
  const tree = parse(query)
  const value = await evaluate(tree, { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: run,
    patch: (target: unknown) => {
      h.patched.push(target)
      const p = {
        setIfMissing: () => p,
        append: (_path: string, items: unknown[]) => {
          h.appended.push(...items)
          return p
        },
        ifRevisionId: () => p,
        set: () => p,
        commit: async () => ({
          results: [{ id: 'post', operation: 'update' }],
        }),
      }
      return p
    },
    transaction: () => h.tx,
  },
  clientReadUncached: { fetch: run },
}))

import {
  addSocialPostAttachment,
  deleteSocialPost,
  getSocialVariantEditorData,
  listSocialPostVariants,
  sanitySocialVariantStore,
  updateSocialPostDefaultTime,
  updateSocialVariantContent,
} from '@/lib/social/sanity'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const STALE_BEFORE = new Date('2026-09-13T09:45:00.000Z')
const BOUNDS = { perConference: 2, maxConferences: 50, staleLimit: 50 }

const conference = (id: string, org = `org-${id}`) => ({
  _id: id,
  _type: 'conference',
  organization: { _ref: org },
  domains: [`${id}.example.no`],
})
const variant = (
  id: string,
  conf: string,
  overrides: Record<string, unknown> = {},
) => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'socialPostVariant',
  post: { _ref: `post-${conf}` },
  conference: { _ref: conf },
  platform: 'bluesky',
  body: 'hi',
  status: 'scheduled',
  scheduledAt: '2026-09-13T09:30:00Z',
  usesCustomTime: false,
  attempts: [],
  attemptCount: 0,
  ...overrides,
})

beforeEach(() => {
  h.dataset = []
  h.queries = []
  h.deleted.length = 0
  h.guarded.length = 0
  h.patched.length = 0
  h.state.commitError = null
})

describe('deleteSocialPost', () => {
  it("deletes only our conference's live variants of the post, then the post", async () => {
    h.dataset = [
      variant('a', 'c1', { status: 'draft' }),
      variant('b', 'c1', { status: 'failed' }),
      variant('drafts.a', 'c1', { status: 'draft' }),
      variant('other-post', 'c1', { post: { _ref: 'post-x' } }),
    ]
    const result = await deleteSocialPost('post-c1', 'c1')
    expect(result).toEqual({ deleted: true, variants: 2 })
    expect(h.deleted).toEqual(['a', 'b', 'post-c1', 'drafts.post-c1'])
    // Every variant delete is guarded by a CAS on the revision that was read.
    expect(h.guarded).toEqual(['a@rev-a', 'b@rev-b'])
  })

  it('aborts when a variant changed between the read and the commit (a claim or a mark-posted landed)', async () => {
    h.dataset = [variant('a', 'c1', { status: 'draft' })]
    h.state.commitError = Object.assign(new Error('revision mismatch'), {
      statusCode: 409,
    })
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'changed',
    })
  })

  it('refuses while a Marketing Task of this conference references a variant (spec §2.3)', async () => {
    h.dataset = [
      variant('a', 'c1', { status: 'draft' }),
      {
        _id: 'task-1',
        _type: 'marketingTask',
        conference: { _ref: 'c1' },
        variant: { _ref: 'a' },
      },
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'task',
      taskId: 'task-1',
    })
    expect(h.deleted).toEqual([])
    // A task of ANOTHER conference, or a release-version copy the timeline
    // never shows, does not count.
    h.dataset = [
      variant('a', 'c1', { status: 'draft' }),
      {
        _id: 'task-x',
        _type: 'marketingTask',
        conference: { _ref: 'c2' },
        variant: { _ref: 'a' },
      },
      {
        _id: 'versions.rel1.task-1',
        _type: 'marketingTask',
        conference: { _ref: 'c1' },
        variant: { _ref: 'a' },
      },
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: true,
      variants: 1,
    })
  })

  it('refuses while a variant holds a publishing claim, and when one is published', async () => {
    h.dataset = [variant('p', 'c1', { status: 'publishing' })]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'in-flight',
    })
    h.dataset = [variant('done', 'c1', { status: 'published' })]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'published',
    })
    expect(h.deleted).toEqual([])
  })
})

describe('findWork — the composed due/stale scan', () => {
  it('snapshots only a live same-conference marketing Task before claiming a due variant', async () => {
    h.dataset = [
      conference('c1'),
      variant('backed', 'c1'),
      variant('standalone', 'c1'),
      ...[
        ['task', 'c1', 'backed'],
        ['foreign', 'c2', 'standalone'],
        ['drafts.task', 'c1', 'standalone'],
        ['versions.release.task', 'c1', 'standalone'],
      ].map(([_id, conf, ref]) => ({
        _id,
        _type: 'marketingTask',
        conference: { _ref: conf },
        variant: { _ref: ref },
      })),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.due.map((v) => [v._id, v.marketingTaskId])).toEqual([
      ['backed', 'task'],
      ['standalone', null],
    ])
  })

  it('returns due variants grouped per conference, capped, oldest first, with orgId', async () => {
    h.dataset = [
      conference('c1'),
      conference('c2'),
      variant('v3', 'c1', { scheduledAt: '2026-09-13T09:03:00Z' }),
      variant('v1', 'c1', { scheduledAt: '2026-09-13T09:01:00Z' }),
      variant('v2', 'c1', { scheduledAt: '2026-09-13T09:02:00Z' }),
      variant('w1', 'c2', { scheduledAt: '2026-09-13T09:59:00Z' }),
      variant('future', 'c2', { scheduledAt: '2026-09-13T10:30:00Z' }),
      variant('draft-status', 'c2', { status: 'draft' }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )

    expect(work.due.map((v) => v._id)).toEqual(['v1', 'v2', 'w1'])
    expect(work.due[0]).toMatchObject({
      conferenceId: 'c1',
      orgId: 'org-c1',
      _rev: 'rev-v1',
    })
    expect(h.queries).toHaveLength(1)
  })

  it("joins each due variant with its post's attachments, only when the post is the same conference's (#1005)", async () => {
    h.dataset = [
      conference('c1'),
      conference('c2'),
      post('post-c1', 'c1'),
      post('post-c2', 'c2'),
      variant('v1', 'c1', {
        attachments: [{ source: 'att-1', altOverride: 'Ours' }],
      }),
      // A hand-edited variant pointing at another conference's post must
      // not pull that tenant's images into the tick.
      variant('w1', 'c2', { post: { _ref: 'post-c1' } }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )

    expect(work.due.map((v) => v._id)).toEqual(['v1', 'w1'])
    expect(work.due[0].postAttachments).toEqual([
      {
        _key: 'att-1',
        assetId: ASSET,
        // No asset document in the fixture: the size comes from the id.
        width: 2000,
        height: 1000,
        hotspot: { x: 0.7, y: 0.4 },
        crop: null,
        alt: 'Keynote crowd',
      },
    ])
    expect(work.due[1].postAttachments).toEqual([])
    // The link-card host policy comes from the variant's OWN conference.
    expect(work.due.map((v) => v.conferenceDomains)).toEqual([
      ['c1.example.no'],
      ['c2.example.no'],
    ])
    expect(h.queries).toHaveLength(1)
  })

  it('never returns a Studio draft twin or a Content Release version copy', async () => {
    h.dataset = [
      conference('c1'),
      variant('live', 'c1'),
      variant('drafts.live', 'c1'),
      variant('versions.rel1.live', 'c1'),
      variant('drafts.only-draft', 'c1'),
      variant('p', 'c1', {
        status: 'publishing',
        claimedAt: '2026-09-13T09:00:00Z',
      }),
      variant('drafts.p', 'c1', {
        status: 'publishing',
        claimedAt: '2026-09-13T09:00:00Z',
      }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )

    expect(work.due.map((v) => v._id)).toEqual(['live'])
    expect(work.stale.map((v) => v._id)).toEqual(['p'])
  })

  it('a draft twin of the CONFERENCE does not create a duplicate group', async () => {
    h.dataset = [
      conference('c1'),
      { ...conference('c1'), _id: 'drafts.c1' },
      variant('v1', 'c1'),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.due.map((v) => v._id)).toEqual(['v1'])
  })

  it('compares instants, not strings: an offset-form value stored by hand is still due', async () => {
    h.dataset = [
      conference('c1'),
      variant('offset', 'c1', { scheduledAt: '2026-09-13T11:30:00+02:00' }),
      variant('offset-future', 'c1', {
        scheduledAt: '2026-09-13T12:30:00+02:00',
      }),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.due.map((v) => v._id)).toEqual(['offset'])
  })

  it('the stale sweep returns only publishing claims older than the cutoff, or with no claim time', async () => {
    h.dataset = [
      conference('c1'),
      variant('fresh', 'c1', {
        status: 'publishing',
        claimedAt: '2026-09-13T09:58:00Z',
      }),
      variant('old', 'c1', {
        status: 'publishing',
        claimedAt: '2026-09-13T09:00:00Z',
      }),
      variant('unknown', 'c1', { status: 'publishing', claimedAt: null }),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.stale.map((v) => v._id).sort()).toEqual(['old', 'unknown'])
  })
})

describe('listSocialPostVariants', () => {
  it('is scoped to the conference, skips drafts and versions, and never derefs a foreign post', async () => {
    h.dataset = [
      {
        _id: 'post-c1',
        _type: 'socialPost',
        conference: { _ref: 'c1' },
        defaultScheduledAt: '2026-10-01T08:00:00Z',
      },
      {
        _id: 'post-c2',
        _type: 'socialPost',
        conference: { _ref: 'c2' },
        defaultScheduledAt: 'SECRET',
      },
      variant('ours', 'c1'),
      variant('drafts.ours', 'c1'),
      variant('versions.r.ours', 'c1'),
      variant('theirs', 'c2'),
      // A Studio-edited ref across conferences must not leak the other post.
      variant('cross', 'c1', { post: { _ref: 'post-c2' } }),
    ]

    const rows = await listSocialPostVariants('c1')

    expect(rows.map((r) => r._id).sort()).toEqual(['cross', 'ours'])
    expect(rows.find((r) => r._id === 'ours')?.postDefaultScheduledAt).toBe(
      '2026-10-01T08:00:00Z',
    )
    expect(rows.find((r) => r._id === 'cross')?.postDefaultScheduledAt).toBe(
      null,
    )
  })

  it('sorts actionable rows before published history so the bound never hides new work', async () => {
    h.dataset = [
      variant('old-published', 'c1', {
        status: 'published',
        scheduledAt: '2026-01-01T08:00:00Z',
      }),
      variant('new-draft', 'c1', { status: 'draft', scheduledAt: null }),
      variant('manual', 'c1', {
        status: 'awaiting-manual',
        scheduledAt: '2026-09-13T09:00:00Z',
      }),
    ]
    const rows = await listSocialPostVariants('c1')
    expect(rows.map((r) => r._id)).toEqual([
      'manual',
      'new-draft',
      'old-published',
    ])
  })
})

const ASSET = 'image-0123456789abcdef0123456789abcdef01234567-2000x1000-jpg'

const post = (
  id: string,
  conf: string,
  overrides: Record<string, unknown> = {},
) => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'socialPost',
  conference: { _ref: conf },
  body: 'hi',
  defaultScheduledAt: '2026-10-01T08:00:00Z',
  attachments: [
    {
      _key: 'att-1',
      image: {
        asset: { _ref: ASSET },
        hotspot: { x: 0.7, y: 0.4, width: 0.2, height: 0.2 },
      },
      alt: 'Keynote crowd',
    },
  ],
  ...overrides,
})

describe('getSocialVariantEditorData — the editor read', () => {
  it('projects the variant with its post attachments, sizing from asset metadata', async () => {
    h.dataset = [
      conference('conf-A'),
      post('post-conf-A', 'conf-A'),
      {
        _id: ASSET,
        _type: 'sanity.imageAsset',
        metadata: { dimensions: { width: 4000, height: 2000 } },
      },
      variant('v-1', 'conf-A', {
        attachments: [
          {
            _key: 'k',
            source: 'att-1',
            crop: { x: 0.1, y: 0, width: 0.5, height: 1 },
          },
        ],
      }),
    ]
    const data = await getSocialVariantEditorData('v-1')
    expect(data?.variant.attachments).toEqual([
      {
        source: 'att-1',
        crop: { x: 0.1, y: 0, width: 0.5, height: 1 },
        altOverride: null,
      },
    ])
    expect(data?.post).toEqual({
      defaultScheduledAt: '2026-10-01T08:00:00Z',
      attachments: [
        {
          _key: 'att-1',
          assetId: ASSET,
          width: 4000,
          height: 2000,
          hotspot: { x: 0.7, y: 0.4 },
          crop: null,
          alt: 'Keynote crowd',
        },
      ],
    })
  })

  it('falls back to the size encoded in the asset id when metadata is missing', async () => {
    h.dataset = [
      conference('conf-A'),
      post('post-conf-A', 'conf-A'),
      variant('v-1', 'conf-A'),
    ]
    const data = await getSocialVariantEditorData('v-1')
    expect(data?.post.attachments[0]).toMatchObject({
      width: 2000,
      height: 1000,
    })
  })

  it('never follows a post reference into another conference', async () => {
    h.dataset = [
      conference('conf-A'),
      conference('conf-B'),
      post('post-conf-B', 'conf-B'),
      // A hand-edited variant of conf-A pointing at conf-B's post.
      variant('v-1', 'conf-A', { post: { _ref: 'post-conf-B' } }),
    ]
    const data = await getSocialVariantEditorData('v-1')
    expect(data?.variant._id).toBe('v-1')
    expect(data?.post).toEqual({ attachments: [], defaultScheduledAt: null })
  })
})

describe('updateSocialVariantContent — compare-and-set', () => {
  const content = {
    body: 'x',
    link: null,
    attachments: [],
    scheduledAt: '2026-10-01T08:00:00Z',
    usesCustomTime: false,
  }

  it('guards the variant on the revision the editor loaded, and the post when following its default', async () => {
    const landed = await updateSocialVariantContent('v-1', content, {
      ifRevision: 'rev-editor',
      followsPost: { id: 'post-conf-A', rev: 'rev-post' },
    })
    expect(landed).toBe(true)
    expect(h.guarded).toEqual(['v-1@rev-editor', 'post-conf-A@rev-post'])
  })

  it('reports a lost race as false, never as a throw', async () => {
    h.state.commitError = Object.assign(new Error('revision mismatch'), {
      statusCode: 409,
    })
    await expect(
      updateSocialVariantContent('v-1', content, { ifRevision: 'rev-old' }),
    ).resolves.toBe(false)
  })
})

describe('updateSocialPostDefaultTime — the cascade', () => {
  it('rewrites only followers that can still be queued, and guards the post itself', async () => {
    h.dataset = [
      conference('conf-A'),
      post('post-conf-A', 'conf-A'),
      variant('follower', 'conf-A', { status: 'draft' }),
      variant('custom', 'conf-A', { usesCustomTime: true }),
      variant('done', 'conf-A', { status: 'published' }),
      variant('foreign', 'conf-B'),
    ]
    const result = await updateSocialPostDefaultTime(
      'post-conf-A',
      'conf-A',
      '2026-10-02T08:00:00Z',
    )
    expect(result).toEqual({ rewritten: 1 })
    expect(h.guarded).toEqual([
      'post-conf-A@rev-post-conf-A',
      'follower@rev-follower',
    ])
  })
})

describe('addSocialPostAttachment — asset tenancy', () => {
  const input = { assetId: ASSET, alt: 'x', hotspot: null, crop: null }

  it("refuses an asset that only another conference's documents reference", async () => {
    h.dataset = [post('post-conf-B', 'conf-B')]
    const result = await addSocialPostAttachment('post-conf-A', 'conf-A', input)
    expect(result).toEqual({ refused: 'foreign-asset' })
    expect(h.patched).toEqual([])
  })

  it('accepts a fresh upload nobody references yet, and one of our own', async () => {
    h.dataset = []
    await expect(
      addSocialPostAttachment('post-conf-A', 'conf-A', input),
    ).resolves.toEqual({ key: expect.any(String) })
    h.dataset = [post('post-conf-A', 'conf-A'), post('post-conf-B', 'conf-B')]
    await expect(
      addSocialPostAttachment('post-conf-A', 'conf-A', input),
    ).resolves.toEqual({ key: expect.any(String) })
  })
})

it('persists the failure event attempt key unchanged for notification identity', async () => {
  h.appended.length = 0
  const landed = await sanitySocialVariantStore.transition(
    'variant-1',
    {
      status: 'failed',
      attempt: {
        _key: 'specific-failure',
        at: NOW.toISOString(),
        outcome: 'rejected',
      },
    },
    { ifRevision: 'rev-1' },
  )
  expect(landed).toBe(true)
  expect(h.appended).toEqual([
    { _key: 'specific-failure', at: NOW.toISOString(), outcome: 'rejected' },
  ])
})
