import { describe, it, expect, vi } from 'vitest'
import {
  MAX_PER_CONFERENCE_PER_TICK,
  pickFairly,
  PUBLISH_RESERVE_MS,
  runPublishTick,
  type VariantFailureEvent,
} from '../publish-engine'
import type {
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from '../provider/types'
import { STALE_CLAIM_MINUTES } from '../state-machine'
import type { PublishableVariant } from '../store'
import { MemoryVariantStore, makeVariant } from './memory-store'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString()

function fakeAdapter(
  outcome: PublishOutcome | Error,
  issues: ValidationIssue[] = [],
): SocialPublishAdapter & {
  publish: ReturnType<typeof vi.fn>
  validate: ReturnType<typeof vi.fn>
} {
  return {
    platform: 'bluesky',
    constraints: {
      maxLength: 300,
      counting: 'graphemes',
      maxImages: 4,
      imageMimeTypes: ['image/jpeg'],
      requiresImage: false,
      requiresAlt: true,
      urlLengthCost: null,
      linkPlacement: 'card',
      imageAspectRatio: null,
      maxBytes: null,
      linkCardDisplacesImages: false,
    },
    validate: vi.fn(() => issues),
    publish: vi.fn(async () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    }),
  }
}

const noAdapter = async () => null

describe('runPublishTick — due scan and dispatch', () => {
  it('moves a due variant to awaiting-manual with an audit entry when no adapter is configured', async () => {
    const store = new MemoryVariantStore([makeVariant()])

    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ due: 1, awaitingManual: 1, errors: [] })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('awaiting-manual')
    expect(doc.claimedAt).toBeNull()
    expect(doc.attempts).toHaveLength(1)
    expect(doc.attempts[0]).toMatchObject({
      at: NOW.toISOString(),
      outcome: 'awaiting-manual',
    })
  })

  it('a resolver that throws (secrets blip) is a safe transient re-queue, not a stale-claim failure', async () => {
    const store = new MemoryVariantStore([makeVariant()])

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => {
        throw new Error('secret store unreachable')
      },
      now: NOW,
    })

    expect(summary).toMatchObject({ requeued: 1, failed: 0, errors: [] })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('scheduled')
    expect(doc.claimedAt).toBeNull()
    expect(doc.attempts[0]).toMatchObject({
      outcome: 'transient',
      error: 'Adapter resolution failed: secret store unreachable',
    })
  })

  it('ignores variants that are not yet due or not scheduled', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ _id: 'future', scheduledAt: '2026-09-13T10:01:00.000Z' }),
      makeVariant({ _id: 'draft', status: 'draft' }),
      makeVariant({ _id: 'done', status: 'published' }),
    ])

    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })

    expect(summary.due).toBe(0)
    expect(store.get('future').status).toBe('scheduled')
    expect(store.get('draft').status).toBe('draft')
  })

  it('publishes through the adapter and records the result and an attempt', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({
      ok: true,
      externalId: 'at://did/post/1',
      url: 'https://bsky.app/profile/x/post/1',
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ published: 1 })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('published')
    expect(doc.publishResult).toEqual({
      externalId: 'at://did/post/1',
      url: 'https://bsky.app/profile/x/post/1',
    })
    expect(doc.attempts).toHaveLength(1)
    expect(doc.attempts[0]).toMatchObject({
      at: NOW.toISOString(),
      outcome: 'published',
    })
    expect(adapter.publish).toHaveBeenCalledWith({
      text: 'Hello from the conference',
      media: [],
      link: undefined,
    })
  })

  it('re-queues a transient failure with backoff and records the attempt', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({
      ok: false,
      kind: 'transient',
      message: 'ECONNRESET before send',
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ requeued: 1, failed: 0 })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('scheduled')
    expect(doc.scheduledAt).toBe('2026-09-13T10:05:00.000Z')
    // The backoff slot is the engine's override, so a default-time edit on
    // the post must not pull the retry back.
    expect(doc.usesCustomTime).toBe(true)
    expect(doc.attemptCount).toBe(1)
    expect(doc.claimedAt).toBeNull()
    expect(doc.attempts[0]).toMatchObject({
      outcome: 'transient',
      error: 'ECONNRESET before send',
    })
  })

  it('fails a rejected outcome immediately', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({
      ok: false,
      kind: 'rejected',
      message: 'duplicate post',
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ failed: 1, requeued: 0 })
    expect(store.get('variant-1').status).toBe('failed')
  })

  it('fails on the third transient attempt instead of re-queuing forever', async () => {
    const store = new MemoryVariantStore([
      makeVariant({
        attemptCount: 2,
        attempts: [
          { _key: 'a', at: minutesAgo(20), outcome: 'transient' },
          { _key: 'b', at: minutesAgo(5), outcome: 'transient' },
        ],
      }),
    ])
    const adapter = fakeAdapter({
      ok: false,
      kind: 'transient',
      message: 'still down',
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ failed: 1 })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    expect(doc.attempts).toHaveLength(3)
    expect(doc.attemptCount).toBe(3)
  })

  it('an organizer retry starts a fresh cycle: history stays, the cap counts from zero', async () => {
    // Three historical attempts, but the organizer re-scheduled (attemptCount
    // reset to 0). The retry must get its full budget, not fail on the spot.
    const store = new MemoryVariantStore([
      makeVariant({
        attemptCount: 0,
        attempts: [
          { _key: 'a', at: minutesAgo(60), outcome: 'transient' },
          { _key: 'b', at: minutesAgo(50), outcome: 'transient' },
          { _key: 'c', at: minutesAgo(30), outcome: 'transient' },
        ],
      }),
    ])
    const adapter = fakeAdapter({
      ok: false,
      kind: 'transient',
      message: 'flaky',
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ requeued: 1, failed: 0 })
    const doc = store.get('variant-1')
    expect(doc.attempts).toHaveLength(4)
    expect(doc.attemptCount).toBe(1)
  })

  it('treats a validation failure as rejected and never calls publish', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({ ok: true, externalId: 'never' }, [
      { field: 'body', message: 'exceeds 300 graphemes' },
    ])

    await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(adapter.publish).not.toHaveBeenCalled()
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    expect(doc.attempts[0]).toMatchObject({
      outcome: 'rejected',
      error: 'body: exceeds 300 graphemes',
    })
  })

  it('treats a validate() that throws as rejected and never calls publish', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({ ok: true, externalId: 'never' })
    adapter.validate.mockImplementation(() => {
      throw new Error('bad grapheme lib')
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ failed: 1, requeued: 0 })
    expect(adapter.publish).not.toHaveBeenCalled()
    expect(store.get('variant-1').attempts[0]).toMatchObject({
      outcome: 'rejected',
      error: 'Adapter validate threw: bad grapheme lib',
    })
  })

  it('treats an adapter that throws as ambiguous and fails — never a retry', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter(new Error('socket hang up after POST'))

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ failed: 1, requeued: 0 })
    expect(store.get('variant-1').attempts[0]).toMatchObject({
      outcome: 'ambiguous',
    })
  })
})

describe('runPublishTick — the MANUAL hand-over (spec §3.1, #1134)', () => {
  const OURS =
    'https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_campaign=earlyBird'

  /**
   * A LinkedIn variant scheduled BEFORE the first-comment rule existed: it
   * passed save, schedule and approve under the old rules, resolves no
   * adapter, and would otherwise be handed to an organizer as ready to post.
   */
  const legacy = () =>
    new MemoryVariantStore(
      [
        makeVariant({
          platform: 'linkedin',
          body: `Tickets are live → ${OURS}`,
          link: OURS,
        }),
      ],
      {},
      { 'conf-1': ['cloudnativebergen.no'] },
    )

  it('refuses to hand over a body that links to our own site, so the organizer can still fix it', async () => {
    const store = legacy()
    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })
    // Fails on the variant being ACCEPTED into the manual queue.
    expect(summary.awaitingManual).toBe(0)
    expect(summary.failed).toBe(1)
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    // `failed` IS editable (EDITABLE_STATUSES), `awaiting-manual` is not —
    // that is the whole point of refusing rather than handing over.
    expect(doc.attempts[0]).toMatchObject({
      outcome: 'rejected',
      error: expect.stringContaining('first comment'),
    })
    expect(doc.attempts[0].error).toContain(OURS)
  })

  it('still hands over the same variant when the conference has no such domain', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ platform: 'linkedin', body: `Tickets → ${OURS}` }),
    ])
    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })
    expect(summary.awaitingManual).toBe(1)
    expect(store.get('variant-1').status).toBe('awaiting-manual')
  })

  it('still hands over a clean LinkedIn body, and a Bluesky body carrying the link', async () => {
    for (const overrides of [
      {
        platform: 'linkedin' as const,
        body: 'Tickets — link in the comments.',
      },
      { platform: 'bluesky' as const, body: `Tickets → ${OURS}` },
    ]) {
      const store = new MemoryVariantStore(
        [makeVariant(overrides)],
        {},
        { 'conf-1': ['cloudnativebergen.no'] },
      )
      const summary = await runPublishTick({
        store,
        resolveAdapter: noAdapter,
        now: NOW,
      })
      expect(summary.awaitingManual, overrides.platform).toBe(1)
      expect(store.get('variant-1').status).toBe('awaiting-manual')
    }
  })
})

describe("runPublishTick — the adapter's pre-publish validation", () => {
  it("hands validate the variant's conference domains, so the tenant rules apply at publish too (#1134)", async () => {
    const store = new MemoryVariantStore(
      [makeVariant()],
      {},
      { 'conf-1': ['cloudnativebergen.no'] },
    )
    const adapter = fakeAdapter({ ok: true, externalId: 'at://1' })
    await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })
    expect(adapter.publish).toHaveBeenCalledTimes(1)
    // A VALUE: `{}` here would silently disable every tenant-dependent rule
    // on the last line of defence before a post goes out.
    expect(adapter.validate.mock.calls[0][1]).toEqual({
      conferenceDomains: ['cloudnativebergen.no'],
    })
  })
})

describe('runPublishTick — compare-and-set claims', () => {
  it('a competing tick that claims first wins; the loser touches nothing', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({ ok: true, externalId: 'ext' })
    // Simulate the OTHER tick claiming between our read and our claim.
    store.beforeClaim = (variant) => {
      store.beforeClaim = null
      void store.claim(variant, NOW)
    }

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ due: 1, lostRace: 1, published: 0 })
    expect(adapter.publish).not.toHaveBeenCalled()
    expect(store.get('variant-1').status).toBe('publishing')
  })

  it('a stale publishing claim surfaces as failed with a stale-claim attempt and is not re-posted', async () => {
    const store = new MemoryVariantStore([
      makeVariant({
        _id: 'stale',
        status: 'publishing',
        claimedAt: minutesAgo(STALE_CLAIM_MINUTES + 1),
      }),
    ])
    const adapter = fakeAdapter({ ok: true, externalId: 'ext' })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ staleFailed: 1, due: 0 })
    expect(adapter.publish).not.toHaveBeenCalled()
    const doc = store.get('stale')
    expect(doc.status).toBe('failed')
    expect(doc.claimedAt).toBeNull()
    expect(doc.attempts[0]).toMatchObject({ outcome: 'stale-claim' })
  })

  it('leaves a fresh publishing claim alone', async () => {
    const store = new MemoryVariantStore([
      makeVariant({
        _id: 'fresh',
        status: 'publishing',
        claimedAt: minutesAgo(1),
      }),
    ])

    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })

    expect(summary.staleFailed).toBe(0)
    expect(store.get('fresh').status).toBe('publishing')
  })

  it('isolates a throwing store write to that variant and keeps going', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ _id: 'bad', scheduledAt: minutesAgo(3) }),
      makeVariant({ _id: 'good', scheduledAt: minutesAgo(2) }),
    ])
    const originalTransition = store.transition.bind(store)
    store.transition = async (id, ...rest) => {
      if (id === 'bad') throw new Error('sanity 500')
      return originalTransition(id, ...rest)
    }

    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })

    expect(summary.awaitingManual).toBe(1)
    expect(summary.errors).toEqual(['bad: sanity 500'])
    expect(store.get('good').status).toBe('awaiting-manual')
  })
})

describe('pickFairly — no tenant starves the others', () => {
  const at = (i: number) => new Date(NOW.getTime() - i * 60_000).toISOString()

  it('caps each conference per tick and fills the rest from the others', () => {
    const hog = Array.from({ length: 40 }, (_, i) =>
      makeVariant({
        _id: `hog-${i}`,
        conferenceId: 'hog',
        scheduledAt: at(100 - i),
      }),
    )
    const others = ['a', 'b', 'c'].map((c) =>
      makeVariant({ _id: `v-${c}`, conferenceId: c, scheduledAt: at(1) }),
    )
    // The hog's variants are all older, so they lead the time-ordered scan.
    const picked = pickFairly([...hog, ...others], 50)

    expect(picked.filter((v) => v.conferenceId === 'hog')).toHaveLength(
      MAX_PER_CONFERENCE_PER_TICK,
    )
    expect(picked.map((v) => v._id)).toEqual(
      expect.arrayContaining(['v-a', 'v-b', 'v-c']),
    )
  })

  it('a tick against a hog with a backlog far beyond the window still serves every other tenant', async () => {
    // 1,000 overdue variants from one conference, all older than everyone
    // else's. Fairness must hold in the READ, not only in the pure picker.
    const hog = Array.from({ length: 1000 }, (_, i) =>
      makeVariant({
        _id: `hog-${i}`,
        conferenceId: 'hog',
        scheduledAt: at(5000 - i),
      }),
    )
    const others = ['a', 'b', 'c'].map((c) =>
      makeVariant({ _id: `v-${c}`, conferenceId: c, scheduledAt: at(1) }),
    )
    const store = new MemoryVariantStore([...hog, ...others])

    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      now: NOW,
    })

    expect(summary.candidates).toBe(MAX_PER_CONFERENCE_PER_TICK + 3)
    expect(summary.awaitingManual).toBe(MAX_PER_CONFERENCE_PER_TICK + 3)
    for (const c of ['a', 'b', 'c']) {
      expect(store.get(`v-${c}`).status).toBe('awaiting-manual')
    }
  })

  it('a settle that loses to the stale sweep never overwrites the sweep verdict', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter({ ok: true, externalId: 'ext' })
    // Between our claim and our settle, "another tick's" stale sweep fails
    // the variant (it bumps the revision).
    const originalClaim = store.claim.bind(store)
    store.claim = async (variant, now) => {
      const claimed = await originalClaim(variant, now)
      if (claimed) {
        await store.transition(claimed._id, {
          status: 'failed',
          claimedAt: null,
          attempt: { at: now.toISOString(), outcome: 'stale-claim' },
        })
      }
      return claimed
    }

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ published: 0, settleLost: 1 })
    expect(store.get('variant-1').status).toBe('failed')
  })

  it('respects the total limit', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeVariant({ _id: `v-${i}`, conferenceId: `c-${i}` }),
    )
    expect(pickFairly(many, 5)).toHaveLength(5)
  })

  it('round-robins a conference-grouped list so late groups are served before early groups get seconds', () => {
    // 20 conferences × 10 due, grouped as the store returns them.
    const grouped = Array.from({ length: 20 }, (_, c) =>
      Array.from({ length: 10 }, (_, i) =>
        makeVariant({ _id: `c${c}-v${i}`, conferenceId: `c${c}` }),
      ),
    ).flat()
    const picked = pickFairly(grouped, 50)
    const perConference = new Map<string, number>()
    for (const v of picked) {
      perConference.set(
        v.conferenceId,
        (perConference.get(v.conferenceId) ?? 0) + 1,
      )
    }
    expect(perConference.size).toBe(20)
    for (const n of perConference.values()) expect(n).toBeLessThanOrEqual(3)
  })
})

describe('runPublishTick — the tick deadline (#1005)', () => {
  it('claims nothing once the function deadline is within the publish reserve, and reports the deferral', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ _id: 'a' }),
      makeVariant({ _id: 'b', conferenceId: 'conf-2' }),
    ])
    const adapter = fakeAdapter({ ok: true, externalId: 'x' })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
      deadline: new Date(Date.now() + 1_000),
    })

    expect(summary).toMatchObject({ due: 2, deferred: 2, published: 0 })
    expect(adapter.publish).not.toHaveBeenCalled()
    expect(store.get('a').status).toBe('scheduled')
    expect(store.get('b').claimedAt).toBeNull()
  })

  it('an adapter resolver that stalls is cut off and re-queued as a transient, never left holding the claim', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const summary = await runPublishTick({
      store,
      resolveAdapter: () => new Promise(() => {}),
      now: NOW,
      resolveTimeoutMs: 20,
    })
    expect(summary).toMatchObject({ requeued: 1, errors: [] })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('scheduled')
    expect(doc.attempts[0]).toMatchObject({ outcome: 'transient' })
    expect(doc.attempts[0].error).toContain('Adapter resolution')
  })

  it('a claim that lands slowly releases itself instead of starting a publish it cannot see through', async () => {
    vi.useFakeTimers({ now: NOW })
    try {
      const store = new MemoryVariantStore([makeVariant()])
      // Past the pre-claim reserve by a hair, but the claim takes 10 s.
      const deadline = new Date(NOW.getTime() + PUBLISH_RESERVE_MS + 2_000)
      store.beforeClaim = () =>
        vi.setSystemTime(new Date(NOW.getTime() + 10_000))
      const adapter = fakeAdapter({ ok: true, externalId: 'x' })

      const summary = await runPublishTick({
        store,
        resolveAdapter: async () => adapter,
        now: NOW,
        deadline,
      })

      expect(summary).toMatchObject({ deferred: 1, published: 0, errors: [] })
      expect(adapter.publish).not.toHaveBeenCalled()
      const doc = store.get('variant-1')
      expect(doc.status).toBe('scheduled')
      expect(doc.claimedAt).toBeNull()
      expect(doc.scheduledAt).toBe('2026-09-13T09:59:00.000Z')
      expect(doc.attemptCount).toBe(0)
      expect(doc.attempts).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a comfortable deadline changes nothing', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => fakeAdapter({ ok: true, externalId: 'x' }),
      now: NOW,
      deadline: new Date(Date.now() + 10 * 60_000),
    })
    expect(summary).toMatchObject({ published: 1, deferred: 0 })
  })
})

describe('runPublishTick — media threading (#1005)', () => {
  const postAttachment = {
    _key: 'img-1',
    assetId: 'image-0123456789abcdef0123456789abcdef01234567-1200x800-png',
    width: 1200,
    height: 800,
    hotspot: null,
    crop: null,
    alt: 'Keynote speaker on stage',
  }

  it("hands the adapter the post's attachments resolved to renditions, with per-variant alt overrides", async () => {
    const store = new MemoryVariantStore(
      [
        makeVariant({
          attachments: [
            { source: 'img-1', crop: null, altOverride: 'Our keynote' },
          ],
          link: 'https://cloudnativedays.no/tickets',
        }),
      ],
      { 'post-1': [postAttachment] },
    )
    const adapter = fakeAdapter({ ok: true, externalId: 'x' })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ published: 1, errors: [] })
    expect(adapter.publish).toHaveBeenCalledWith({
      text: 'Hello from the conference',
      link: 'https://cloudnativedays.no/tickets',
      media: [
        {
          url: 'https://cdn.sanity.io/images/mock/image.png',
          mimeType: 'image/png',
          alt: 'Our keynote',
        },
      ],
    })
  })

  it('refuses to publish a variant whose attachment the post no longer has — never text-only by accident', async () => {
    const store = new MemoryVariantStore(
      [
        makeVariant({
          attachments: [{ source: 'gone', crop: null, altOverride: null }],
        }),
      ],
      { 'post-1': [postAttachment] },
    )
    const adapter = fakeAdapter({ ok: true, externalId: 'x' })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({ failed: 1, published: 0 })
    expect(adapter.publish).not.toHaveBeenCalled()
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    expect(doc.attempts[0]).toMatchObject({ outcome: 'rejected' })
    expect(doc.attempts[0].error).toContain('gone')
  })
})

describe('the manual Channel hand-over (#1006)', () => {
  const linkedin = (id: string, postId = 'post-1') =>
    makeVariant({ _id: id, postId, platform: 'linkedin' })

  it('hands the tick’s awaiting-manual variants to the hook once, with the post creator, and no adapter publishes', async () => {
    const { ManualChannelProvider } = await import('../provider/manual')
    const publish = vi.spyOn(ManualChannelProvider.prototype, 'publish')
    const { resolveSocialPublishAdapter } = await import('../provider')
    const store = new MemoryVariantStore(
      [linkedin('v-a'), linkedin('v-b', 'post-2')],
      {},
      {},
      { 'post-1': 'sp-owner' },
    )
    const onAwaitingManual = vi.fn<
      (variants: PublishableVariant[]) => Promise<void>
    >(async () => {})

    const summary = await runPublishTick({
      store,
      // The REAL resolver: LinkedIn has no connection family, so it answers
      // null without consulting the secret store.
      resolveAdapter: resolveSocialPublishAdapter,
      onAwaitingManual,
      now: NOW,
    })

    expect(summary).toMatchObject({ due: 2, awaitingManual: 2, errors: [] })
    expect(publish).not.toHaveBeenCalled()
    expect(onAwaitingManual).toHaveBeenCalledTimes(1)
    const handed = onAwaitingManual.mock.calls[0][0]
    expect(handed.map((v) => [v._id, v.status, v.postCreatedBy])).toEqual([
      ['v-a', 'awaiting-manual', 'sp-owner'],
      ['v-b', 'awaiting-manual', null],
    ])
    expect(store.get('v-a').status).toBe('awaiting-manual')
    publish.mockRestore()
  })

  it('does not call the hook when nothing was handed over, and a hook failure is an error, not a rollback', async () => {
    const quiet = vi.fn(async () => {})
    await runPublishTick({
      store: new MemoryVariantStore([makeVariant({ status: 'draft' })]),
      resolveAdapter: noAdapter,
      onAwaitingManual: quiet,
      now: NOW,
    })
    expect(quiet).not.toHaveBeenCalled()

    const store = new MemoryVariantStore([linkedin('v-a')])
    const summary = await runPublishTick({
      store,
      resolveAdapter: noAdapter,
      onAwaitingManual: async () => {
        throw new Error('hub down')
      },
      now: NOW,
    })
    expect(summary.awaitingManual).toBe(1)
    expect(summary.errors).toEqual(['awaiting-manual notification: hub down'])
    expect(store.get('v-a').status).toBe('awaiting-manual')
  })

  it('a lost hand-over (another tick swept the claim) is not reported to the hook', async () => {
    const store = new MemoryVariantStore([linkedin('v-a')])
    const onAwaitingManual = vi.fn(async () => {})
    const summary = await runPublishTick({
      store,
      resolveAdapter: async (variant) => {
        // Between the claim and the hand-over, someone else moved it.
        await store.transition(variant._id, { status: 'failed' })
        return null
      },
      onAwaitingManual,
      now: NOW,
    })
    // The hand-over itself was attempted and lost — not a resolver failure.
    expect(summary).toMatchObject({ settleLost: 1, awaitingManual: 0 })
    expect(store.get('v-a').status).toBe('failed')
    expect(onAwaitingManual).not.toHaveBeenCalled()
  })
})

describe('immediate failure hooks (#1015)', () => {
  it('completes an asynchronous failure notification before resolving the next variant', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ _id: 'first' }),
      makeVariant({ _id: 'second' }),
    ])
    const events: string[] = []
    let finishDelivery!: () => void
    const delivered = new Promise<void>((resolve) => {
      finishDelivery = resolve
    })

    const summary = await runPublishTick({
      store,
      now: NOW,
      onFailed: async ({ variant }) => {
        // Cross an event-loop turn: recording synchronously only proves that
        // the hook was invoked, even if its promise is never awaited.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        events.push(`delivered:${variant._id}`)
        finishDelivery()
      },
      resolveAdapter: async (variant) => {
        events.push(`resolve:${variant._id}`)
        return fakeAdapter(
          variant._id === 'first'
            ? { ok: false, kind: 'rejected', message: 'bad copy' }
            : { ok: true, externalId: 'p', url: 'https://example.com/p' },
        )
      },
    })
    // Drain the hook even under the fire-and-forget sabotage so the failure
    // compares completed delivery order, without leaking work into other tests.
    await delivered
    expect(summary).toMatchObject({ failed: 1, published: 1, errors: [] })
    expect(events).toEqual([
      'resolve:first',
      'delivered:first',
      'resolve:second',
    ])
  })

  it.each([
    ['rejected', { ok: false, kind: 'rejected', message: 'bad copy' }, 0],
    [
      'credential-expired',
      { ok: false, kind: 'credential-expired', message: 'expired' },
      0,
    ],
    [
      'rate-limited',
      { ok: false, kind: 'rate-limited', message: 'limited' },
      2,
    ],
    ['ambiguous', new Error('unknown platform result'), 0],
    ['transient', { ok: false, kind: 'transient', message: 'down' }, 99],
  ] as const)(
    'notifies %s terminal failure before resolving the next variant',
    async (kind, outcome, attemptCount) => {
      const store = new MemoryVariantStore([
        makeVariant({ _id: 'first', attemptCount }),
        makeVariant({ _id: 'second' }),
      ])
      const events: string[] = []
      let failuresBeforeSecond = 0
      const hook = vi.fn(async ({ variant }: VariantFailureEvent) => {
        events.push(`failed:${variant._id}`)
      })
      const adapter = fakeAdapter(outcome)
      await runPublishTick({
        store,
        now: NOW,
        onFailed: hook,
        resolveAdapter: async (variant) => {
          events.push(`resolve:${variant._id}`)
          if (variant._id === 'second')
            failuresBeforeSecond = hook.mock.calls.length
          return adapter
        },
      })
      // Assertions must stay outside resolver/hook callbacks: the engine catches
      // their exceptions so a failed assertion there can silently pass the test.
      expect(failuresBeforeSecond).toBe(1)
      expect(events.slice(0, 3)).toEqual([
        'resolve:first',
        'failed:first',
        'resolve:second',
      ])
      expect(hook.mock.calls[0]).toEqual([
        {
          variant: expect.objectContaining({ _id: 'first' }),
          attempt: expect.objectContaining({
            _key: store.get('first').attempts[0]._key,
            outcome: kind,
          }),
        },
      ])
    },
  )

  it('validation refusal emits rejected failure with no platform call', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const adapter = fakeAdapter(
      { ok: true, externalId: 'p', url: 'https://example.com/p' },
      [{ field: 'body', message: 'too long' }],
    )
    const onFailed = vi.fn(async () => {})
    const summary = await runPublishTick({
      store,
      now: NOW,
      resolveAdapter: async () => adapter,
      onFailed,
    })
    expect(summary.failed).toBe(1)
    expect(onFailed.mock.calls[0]).toEqual([
      expect.objectContaining({
        attempt: expect.objectContaining({ outcome: 'rejected' }),
      }),
    ])
    expect(adapter.publish).toHaveBeenCalledTimes(0)
  })

  it('lost terminal settlement never emits another failure', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const transition = store.transition.bind(store)
    store.transition = async (id, patch, options) => {
      await transition(id, { status: 'failed' }, options)
      return false
    }
    const onFailed = vi.fn(async () => {})
    const summary = await runPublishTick({
      store,
      now: NOW,
      onFailed,
      resolveAdapter: async () =>
        fakeAdapter({ ok: false, kind: 'rejected', message: 'bad' }),
    })
    expect(summary.settleLost).toBe(1)
    expect(onFailed).toHaveBeenCalledTimes(0)
  })

  it('notification hook failure cannot undo failed status or stop the next dispatch', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ _id: 'a' }),
      makeVariant({ _id: 'b' }),
    ])
    const summary = await runPublishTick({
      store,
      now: NOW,
      resolveAdapter: async () =>
        fakeAdapter({ ok: false, kind: 'rejected', message: 'bad' }),
      onFailed: async () => {
        throw new Error('hub down')
      },
    })
    expect(summary.failed).toBe(2)
    expect(store.get('a').status).toBe('failed')
    expect(store.get('b').status).toBe('failed')
    expect(summary.errors).toHaveLength(2)
  })
})
