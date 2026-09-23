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

const verification = vi.hoisted(() => ({
  verifiedDomains: vi.fn(async (claimed: readonly string[]) => [...claimed]),
}))
vi.mock('@/lib/domain-verification/routing', () => ({
  verifiedDomains: verification.verifiedDomains,
}))

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
  getConferenceDomainsForRule,
  VERIFY_DOMAINS_TIMEOUT_MS,
} from '@/lib/social/sanity'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const STALE_BEFORE = new Date('2026-09-13T09:45:00.000Z')
const BOUNDS = {
  perConference: 2,
  maxConferences: 50,
  staleLimit: 50,
  submittedLimit: 10,
}

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
    // A variant's DRAFT twin goes with it, exactly as the post's own twin goes
    // with the post. It used to be left behind pointing at a deleted post —
    // harmless while `variant.post` was a strong reference, because Sanity
    // refused the delete outright, and not harmless once #1084 weakened it.
    expect(h.deleted).toEqual([
      'a',
      'drafts.a',
      'b',
      'drafts.b',
      'post-c1',
      'drafts.post-c1',
    ])
    // Every variant delete is guarded by a CAS on the revision that was read.
    expect(h.guarded).toEqual(['a@rev-a', 'b@rev-b'])
  })

  it('refuses while something it would not delete still points at the post', async () => {
    // `variant.post` was strong, so Sanity refused this case itself. #1084
    // declared it weak — a Campaign or plan delete cannot chunk its way through
    // strong references — which removed the guard silently. This read
    // enumerates only LIVE, same-conference variants, so a variant belonging to
    // another edition (or a scheduled release version) would have been left
    // pointing at a post that no longer exists, and the next publish or render
    // would find no parent.
    h.dataset = [
      variant('a', 'c1', { status: 'draft' }),
      // Same post, different conference: not enumerated, not deleted.
      variant('foreign', 'c2', { post: { _ref: 'post-c1' } }),
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'referenced',
    })
    expect(h.deleted).toEqual([])
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

  it('refuses while a variant is SUBMITTED — an asynchronous publisher still holds the post (#1128)', async () => {
    h.dataset = [
      variant('s', 'c1', {
        status: 'submitted',
        submission: {
          vendorPostId: 'buffer-1',
          submittedAt: '2026-09-13T09:50:00Z',
        },
      }),
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'in-flight',
    })
    // Fails on the ACTION: nothing may be deleted, not merely "no error".
    expect(h.deleted).toEqual([])
  })

  it('refuses a FAILED variant that may be live — its last attempt could not confirm (#1128)', async () => {
    h.dataset = [
      variant('maybe', 'c1', {
        status: 'failed',
        attempts: [
          { _key: 'a', at: '2026-09-13T09:50:00Z', outcome: 'ambiguous' },
        ],
      }),
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toEqual({
      deleted: false,
      reason: 'may-be-live',
    })
    expect(h.deleted).toEqual([])
    // The control: a post that failed DEFINITELY never went out and deletes.
    h.dataset = [
      variant('never', 'c1', {
        status: 'failed',
        attempts: [
          { _key: 'a', at: '2026-09-13T09:50:00Z', outcome: 'rejected' },
        ],
      }),
    ]
    expect(await deleteSocialPost('post-c1', 'c1')).toMatchObject({
      deleted: true,
    })
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

  it("DEFERS a conference's first-comment variants when its verification read throws; card platforms still dispatch with the RAW list", async () => {
    // Under routing enforcement `verifiedDomains` reads records. One Sanity
    // timeout for one conference must not reject `findWork` (the stale and
    // confirm sweeps and every other tenant ride on it), must not dispatch a
    // LinkedIn body with the rule silently off, and must not strip the list
    // a Bluesky link card is built from — that post would go out without
    // its card, irreversibly. So: LinkedIn waits a tick, Bluesky keeps the
    // raw list, the neighbour is untouched.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    verification.verifiedDomains.mockClear()
    verification.verifiedDomains.mockImplementation(async (claimed) => {
      if (claimed.includes('c2.example.no')) throw new Error('Sanity timeout')
      return [...claimed]
    })
    try {
      h.dataset = [
        conference('c1'),
        conference('c2'),
        variant('v1', 'c1', {
          platform: 'linkedin',
          scheduledAt: '2026-09-13T09:00:00Z',
        }),
        variant('w1', 'c2', {
          platform: 'linkedin',
          scheduledAt: '2026-09-13T09:00:00Z',
        }),
        variant('w2', 'c2', {
          platform: 'bluesky',
          scheduledAt: '2026-09-13T09:01:00Z',
        }),
      ]
      const work = await sanitySocialVariantStore.findWork(
        NOW,
        STALE_BEFORE,
        BOUNDS,
      )
      // ON THE VALUE: the LinkedIn variant of the failing conference is NOT
      // in this tick; the Bluesky one is, with the raw list; the neighbour
      // keeps its verified list; the read was attempted once and logged once.
      expect(work.due.map((v) => v._id).sort()).toEqual(['v1', 'w2'])
      expect(work.due.find((v) => v._id === 'v1')?.conferenceDomains).toEqual([
        'c1.example.no',
      ])
      expect(work.due.find((v) => v._id === 'w2')?.conferenceDomains).toEqual([
        'c2.example.no',
      ])
      expect(
        verification.verifiedDomains.mock.calls.filter((c) =>
          c[0].includes('c2.example.no'),
        ),
      ).toHaveLength(1)
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      error.mockRestore()
      verification.verifiedDomains.mockImplementation(async (claimed) => [
        ...claimed,
      ])
    }
  })

  it('deferred first-comment variants cannot fill the window and starve a card platform in the same conference', async () => {
    // Twelve overdue LinkedIn variants whose verification keeps failing, and
    // one later Bluesky variant. With ONE per-conference window of ten, the
    // same ten LinkedIn rows were read every tick, deferred every tick, and
    // the Bluesky one — which needs no verification — was never read.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    verification.verifiedDomains.mockImplementation(async () => {
      throw new Error('Sanity timeout')
    })
    try {
      h.dataset = [
        conference('c1'),
        ...Array.from({ length: 12 }, (_, i) =>
          variant(`li-${i}`, 'c1', {
            platform: 'linkedin',
            scheduledAt: `2026-09-13T08:${String(i).padStart(2, '0')}:00Z`,
          }),
        ),
        variant('bsky', 'c1', {
          platform: 'bluesky',
          scheduledAt: '2026-09-13T09:30:00Z',
        }),
      ]
      const work = await sanitySocialVariantStore.findWork(NOW, STALE_BEFORE, {
        ...BOUNDS,
        perConference: 10,
      })
      // ON THE VALUE: the Bluesky variant is dispatched this tick, with its
      // raw list; the LinkedIn ones wait.
      expect(work.due.map((v) => v._id)).toEqual(['bsky'])
      expect(work.due[0].conferenceDomains).toEqual(['c1.example.no'])
      expect(h.queries).toHaveLength(1)
    } finally {
      error.mockRestore()
      verification.verifiedDomains.mockImplementation(async (claimed) => [
        ...claimed,
      ])
    }
  })

  it('never verifies for a card platform: Bluesky rows carry the raw list without a read', async () => {
    verification.verifiedDomains.mockClear()
    h.dataset = [
      conference('c1'),
      variant('b1', 'c1', {
        platform: 'bluesky',
        scheduledAt: '2026-09-13T09:00:00Z',
      }),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.due.map((v) => v.conferenceDomains)).toEqual([
      ['c1.example.no'],
    ])
    expect(verification.verifiedDomains).not.toHaveBeenCalled()
  })

  it('does not wait longer than VERIFY_DOMAINS_TIMEOUT_MS for a verification read that hangs — the variant waits a tick', async () => {
    // The Sanity client's own timeout is minutes; the cron has sixty seconds
    // for everything. A read that never returns is bounded and the
    // conference falls back to no rule, like a read that throws.
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    verification.verifiedDomains.mockClear()
    verification.verifiedDomains.mockImplementation(
      () => new Promise<string[]>(() => {}),
    )
    try {
      h.dataset = [
        conference('c1'),
        variant('v1', 'c1', {
          platform: 'linkedin',
          scheduledAt: '2026-09-13T09:00:00Z',
        }),
      ]
      const pending = sanitySocialVariantStore.findWork(
        NOW,
        STALE_BEFORE,
        BOUNDS,
      )
      await vi.advanceTimersByTimeAsync(VERIFY_DOMAINS_TIMEOUT_MS + 1)
      const work = await pending
      // Deferred, not dispatched with the rule off: it is picked up next tick.
      expect(work.due).toEqual([])
      expect(error).toHaveBeenCalledTimes(1)
      expect(String(error.mock.calls[0][1])).toContain('longer than')
    } finally {
      error.mockRestore()
      vi.useRealTimers()
      verification.verifiedDomains.mockImplementation(async (claimed) => [
        ...claimed,
      ])
    }
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

  // #1128: the confirm sweep's work rides in the SAME read.
  it('the confirm sweep returns submitted variants, oldest submission first, capped — and still ONE query', async () => {
    h.dataset = [
      conference('c1'),
      conference('c2'),
      ...['s3', 's1', 's2'].map((id, i) =>
        variant(id, 'c1', {
          status: 'submitted',
          scheduledAt: null,
          submission: {
            vendorPostId: `buffer-${id}`,
            submittedAt: `2026-09-13T09:5${[3, 1, 2][i]}:00Z`,
          },
        }),
      ),
      variant('s-other-tenant', 'c2', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-x',
          submittedAt: '2026-09-13T09:50:00Z',
        },
      }),
      // The never-double-post guard in the READ. A submitted variant KEEPS
      // its scheduledAt, and that time is in the past the moment the vendor
      // accepts the post — so only `status == "scheduled"` keeps it out of
      // the due scan. Its time is older than every due variant's, so a due
      // scan that let it through would claim and re-post it FIRST.
      variant('s-still-due-by-time', 'c1', {
        status: 'submitted',
        scheduledAt: '2026-09-13T08:00:00Z',
        submission: {
          vendorPostId: 'buffer-late',
          submittedAt: '2026-09-13T09:54:00Z',
        },
      }),
      // Not submitted: must not appear.
      variant('due-one', 'c1'),
      variant('claimed', 'c1', {
        status: 'publishing',
        claimedAt: '2026-09-13T09:59:00Z',
      }),
      // A Studio draft twin and a release version would each be a SECOND
      // document for the same submission — and a second confirm read.
      variant('drafts.s1', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-s1',
          submittedAt: '2026-09-13T09:51:00Z',
        },
      }),
      variant('versions.rel1.s1', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-s1',
          submittedAt: '2026-09-13T09:51:00Z',
        },
      }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )

    // GROUPED BY CONFERENCE, not globally sorted — changed deliberately.
    // This used to assert one global oldest-first list, which is exactly what
    // let one tenant's backlog fill the slice. `perConference` is 2 here, so
    // c1 contributes its two least-recently-checked (`s1`, `s2`) and c2 its
    // one; `s3` and `s-still-due-by-time` wait for the next tick rather than
    // pushing another tenant out of this one.
    expect(work.submitted.map((v) => v._id).sort()).toEqual(
      ['s-other-tenant', 's1', 's2'].sort(),
    )
    // Within a conference the order is still least-recently-checked first.
    const c1Ids = work.submitted
      .filter((v) => v._id.startsWith('s') && v._id !== 's-other-tenant')
      .map((v) => v._id)
    expect(c1Ids).toEqual(['s1', 's2'])
    expect(work.submitted.find((v) => v._id === 's1')?.submission).toEqual({
      vendorPostId: 'buffer-s1',
      submittedAt: '2026-09-13T09:51:00Z',
      lastCheckedAt: null,
    })
    // A due variant is never in the submitted list and vice versa.
    expect(work.due.map((v) => v._id)).toEqual(['due-one'])
    expect(h.queries).toHaveLength(1)
  })

  it('a deep backlog in ONE conference cannot starve another tenant', async () => {
    // Rotation alone does not bound the wait: a conference holding more
    // submissions than the cap fills every slice, and at 5 a tick 150 of its
    // rows take half an hour to cycle — past the 15-minute confirm timeout,
    // so a neighbour's submission fails `ambiguous` because of a backlog that
    // is not its own. The per-conference bound is what stops that, and it
    // lives in the READ so the engine never depends on the store's goodwill.
    h.dataset = [
      conference('busy'),
      conference('quiet'),
      ...Array.from({ length: 12 }, (_, i) =>
        variant(`busy-${i}`, 'busy', {
          status: 'submitted',
          scheduledAt: null,
          submission: {
            vendorPostId: `buffer-busy-${i}`,
            // All older than the quiet tenant's, so a global sort puts every
            // one of them ahead of it.
            submittedAt: `2026-09-13T09:0${i % 10}:00Z`,
          },
        }),
      ),
      variant('quiet-1', 'quiet', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-quiet',
          submittedAt: '2026-09-13T09:58:00Z',
        },
      }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )

    // ON THE VALUE: the quiet tenant is read THIS tick, not in half an hour.
    expect(work.submitted.map((v) => v._id)).toContain('quiet-1')
    // And the busy one is held to its share rather than the whole slice.
    expect(
      work.submitted.filter((v) => v._id.startsWith('busy-')),
    ).toHaveLength(BOUNDS.perConference)
  })

  it('shares confirm slots ROUND-ROBIN under the PRODUCTION ratio (per-conference > total)', async () => {
    // The previous fairness fix grouped by conference and then took a GLOBAL
    // PREFIX of the flattened groups. Production passes perConference = 10
    // against submittedLimit = 5, so the first conference supplied ten rows
    // and the prefix of five never reached anyone else — fairness in the
    // tests, none in production. The test above uses the opposite ratio
    // (2 per conference, 10 total), which is exactly why it could not see it.
    const PROD_SHAPED = { ...BOUNDS, perConference: 10, submittedLimit: 5 }
    h.dataset = [
      conference('busy'),
      conference('quiet'),
      ...Array.from({ length: 10 }, (_, i) =>
        variant(`busy-${i}`, 'busy', {
          status: 'submitted',
          scheduledAt: null,
          submission: {
            vendorPostId: `buffer-busy-${i}`,
            submittedAt: `2026-09-13T09:0${i}:00Z`,
          },
        }),
      ),
      variant('quiet-1', 'quiet', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-quiet',
          submittedAt: '2026-09-13T09:58:00Z',
        },
      }),
    ]

    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      PROD_SHAPED,
    )

    // ON THE VALUE: the quiet tenant is read this tick…
    expect(work.submitted.map((v) => v._id)).toContain('quiet-1')
    // …the total is still capped…
    expect(work.submitted).toHaveLength(PROD_SHAPED.submittedLimit)
    // …and the busy tenant gets the rest, oldest-checked first.
    expect(
      work.submitted.filter((v) => v._id.startsWith('busy-')).map((v) => v._id),
    ).toEqual(['busy-0', 'busy-1', 'busy-2', 'busy-3'])
  })

  it('rotates WHICH CONFERENCES get confirm slots across ticks when there are more than the cap', async () => {
    // Round-robin is fair within a tick only. Six conferences with one
    // submission each against a cap of five: in document order the same five
    // would be read every minute and the sixth never — until it timed out
    // `ambiguous` without a single vendor read. Lanes are ordered by their
    // head's confirm key, so a conference just read sorts to the back.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const submitted = (c: string, lastCheckedAt?: string) =>
      variant(`${c}-1`, c, {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: `buffer-${c}`,
          submittedAt: '2026-09-13T09:30:00Z',
          ...(lastCheckedAt ? { lastCheckedAt } : {}),
        },
      })
    const bounds = { ...BOUNDS, perConference: 10, submittedLimit: 5 }

    // Tick 1: nothing has been read yet; document order decides, `f` waits.
    h.dataset = [
      ...ids.map((c) => conference(c)),
      ...ids.map((c) => submitted(c)),
    ]
    const tick1 = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      bounds,
    )
    expect(tick1.submitted.map((v) => v._id)).toEqual([
      'a-1',
      'b-1',
      'c-1',
      'd-1',
      'e-1',
    ])

    // Tick 2: the five read are stamped, in the order the sweep reached them.
    // ON THE VALUE: `f` is read now, and the one that waits is `e` — the most
    // recently read — not `f` again.
    h.dataset = [
      ...ids.map((c) => conference(c)),
      ...ids.map((c, i) =>
        c === 'f' ? submitted(c) : submitted(c, `2026-09-13T09:59:0${i}Z`),
      ),
    ]
    const tick2 = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      bounds,
    )
    expect(tick2.submitted.map((v) => v._id)).toEqual([
      'f-1',
      'a-1',
      'b-1',
      'c-1',
      'd-1',
    ])
  })

  it('orders the confirm sweep by LEAST RECENTLY CHECKED, so a capped slice cannot be monopolised', async () => {
    h.dataset = [
      conference('c1'),
      // Submitted first, but read a moment ago: it is inside its backoff and
      // must not hold a slot against a newer submission that has never been
      // read. Ordering by submittedAt would starve `never-read` until the
      // older ones settled — or timed out as ambiguous with no vendor call.
      variant('checked-just-now', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-a',
          submittedAt: '2026-09-13T09:40:00Z',
          lastCheckedAt: '2026-09-13T09:59:30Z',
        },
      }),
      variant('never-read', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-b',
          submittedAt: '2026-09-13T09:50:00Z',
        },
      }),
      variant('checked-long-ago', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: {
          vendorPostId: 'buffer-c',
          submittedAt: '2026-09-13T09:45:00Z',
          lastCheckedAt: '2026-09-13T09:46:00Z',
        },
      }),
    ]
    const work = await sanitySocialVariantStore.findWork(NOW, STALE_BEFORE, {
      ...BOUNDS,
      submittedLimit: 2,
    })
    expect(work.submitted.map((v) => v._id)).toEqual([
      'checked-long-ago',
      'never-read',
    ])
  })

  it('caps the confirm sweep at submittedLimit so one backlog cannot spend the vendor budget', async () => {
    h.dataset = [
      conference('c1'),
      ...Array.from({ length: 5 }, (_, i) =>
        variant(`s${i}`, 'c1', {
          status: 'submitted',
          scheduledAt: null,
          submission: {
            vendorPostId: `buffer-${i}`,
            submittedAt: `2026-09-13T09:5${i}:00Z`,
          },
        }),
      ),
    ]
    const work = await sanitySocialVariantStore.findWork(NOW, STALE_BEFORE, {
      ...BOUNDS,
      submittedLimit: 2,
    })
    expect(work.submitted.map((v) => v._id)).toEqual(['s0', 's1'])
  })

  it('a submission with no vendor id is no receipt at all — half a record must not be read back', async () => {
    h.dataset = [
      conference('c1'),
      variant('s1', 'c1', {
        status: 'submitted',
        scheduledAt: null,
        submission: { submittedAt: '2026-09-13T09:50:00Z' },
      }),
    ]
    const work = await sanitySocialVariantStore.findWork(
      NOW,
      STALE_BEFORE,
      BOUNDS,
    )
    expect(work.submitted.map((v) => v._id)).toEqual(['s1'])
    expect(work.submitted[0].submission).toBeNull()
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

describe('getConferenceDomainsForRule — the live read the mutations validate against', () => {
  it('returns the conference domains by id — executed GROQ, not a mock', async () => {
    // The first version went through `scopedFetch`, which prepends
    // `conference._ref == $conferenceId`; a conference document has no such
    // field, so the read was null → [] and the first-comment rule was silently
    // OFF at save, schedule and approve. Every router test mocked this
    // function away. This one runs the query.
    h.dataset = [conference('conf-A'), conference('conf-B')]
    expect(await getConferenceDomainsForRule('conf-A')).toEqual([
      'conf-A.example.no',
    ])
    expect(await getConferenceDomainsForRule('conf-B')).toEqual([
      'conf-B.example.no',
    ])
    // An unknown id is an empty list, never another tenant's.
    expect(await getConferenceDomainsForRule('conf-nope')).toEqual([])
  })
})

describe('getSocialVariantEditorData — the editor read', () => {
  it('still loads a LinkedIn editor when the verification read throws or hangs — the warning is advisory', async () => {
    // This read serves mark-posted, delete and set-date too; save, schedule
    // and approve re-read and refuse for themselves. So a failing or hanging
    // verification read must not turn into an error, or a timeout of the
    // Sanity client's length, on every Task flow.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.dataset = [
      conference('conf-A'),
      post('post-conf-A', 'conf-A'),
      variant('v-li', 'conf-A', { platform: 'linkedin' }),
    ]
    try {
      verification.verifiedDomains.mockImplementation(async () => {
        throw new Error('Sanity timeout')
      })
      const thrown = await getSocialVariantEditorData('v-li')
      expect(thrown?.variant._id).toBe('v-li')
      expect(thrown?.conferenceDomains).toEqual([])

      vi.useFakeTimers()
      verification.verifiedDomains.mockImplementation(
        () => new Promise<string[]>(() => {}),
      )
      const pending = getSocialVariantEditorData('v-li')
      await vi.advanceTimersByTimeAsync(VERIFY_DOMAINS_TIMEOUT_MS + 1)
      const hung = await pending
      expect(hung?.variant._id).toBe('v-li')
      expect(hung?.conferenceDomains).toEqual([])
      expect(error).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      error.mockRestore()
      verification.verifiedDomains.mockImplementation(async (claimed) => [
        ...claimed,
      ])
    }
  })

  it('verifies the domains only for a first-comment platform; a Bluesky editor takes the raw list with no read', async () => {
    verification.verifiedDomains.mockClear()
    h.dataset = [
      conference('conf-A'),
      post('post-conf-A', 'conf-A'),
      variant('v-bsky', 'conf-A', { platform: 'bluesky' }),
      variant('v-li', 'conf-A', { platform: 'linkedin' }),
    ]
    const bsky = await getSocialVariantEditorData('v-bsky')
    expect(bsky?.conferenceDomains).toEqual(['conf-A.example.no'])
    expect(verification.verifiedDomains).not.toHaveBeenCalled()
    await getSocialVariantEditorData('v-li')
    expect(verification.verifiedDomains).toHaveBeenCalledTimes(1)
  })

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

  it("projects the variant's OWN conference domains, for the first-comment rule (#1134)", async () => {
    h.dataset = [
      conference('conf-A'),
      conference('conf-B'),
      post('post-conf-A', 'conf-A'),
      variant('v-1', 'conf-A'),
    ]
    const data = await getSocialVariantEditorData('v-1')
    // A VALUE, not a shape: the editor that gets `[]` silently enforces
    // nothing, and `conf-B.example.no` would be another tenant's.
    expect(data?.conferenceDomains).toEqual(['conf-A.example.no'])
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
