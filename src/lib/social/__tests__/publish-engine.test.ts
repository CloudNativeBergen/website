import { describe, it, expect, vi } from 'vitest'
import {
  MAX_CONFIRMS_PER_TICK,
  MAX_PER_CONFERENCE_PER_TICK,
  pickFairly,
  PUBLISH_RESERVE_MS,
  runPublishTick,
  type VariantFailureEvent,
} from '../publish-engine'
import type {
  ConfirmCheck,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from '../provider/types'
import { CONFIRM_TIMEOUT_MINUTES, STALE_CLAIM_MINUTES } from '../state-machine'
import type { PublishableVariant } from '../store'
import type { SocialPostVariant } from '../types'
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

// ---------------------------------------------------------------------------
// The ASYNCHRONOUS path (#1128): accept → submitted → confirm sweep
// ---------------------------------------------------------------------------

/** An adapter that ACCEPTS rather than publishes, and can be read back. */
function asyncAdapter(
  checks: ConfirmCheck[] | Error = [{ state: 'pending' }],
  accepted: PublishOutcome = {
    ok: true,
    result: 'accepted',
    vendorPostId: 'buffer-1',
  },
) {
  const queue = Array.isArray(checks) ? [...checks] : checks
  return {
    ...fakeAdapter(accepted),
    platform: 'linkedin' as const,
    confirm: vi.fn(async () => {
      if (queue instanceof Error) throw queue
      return queue.shift() ?? { state: 'pending' as const }
    }),
  }
}

function submittedVariant(
  submission: Partial<NonNullable<SocialPostVariant['submission']>> = {},
  overrides: Partial<SocialPostVariant> = {},
) {
  return makeVariant({
    platform: 'linkedin',
    status: 'submitted',
    claimedAt: null,
    attemptCount: 1,
    attempts: [
      { _key: 'submit', at: minutesAgo(5), outcome: 'submitted' as const },
    ],
    submission: {
      vendorPostId: 'buffer-1',
      submittedAt: minutesAgo(5),
      lastCheckedAt: null,
      ...submission,
    },
    ...overrides,
  })
}

describe('an accepted publish lands in submitted (#1128)', () => {
  it('records the SUBMIT leg and the vendor receipt, and does NOT mark the post published', async () => {
    const store = new MemoryVariantStore([
      makeVariant({ platform: 'linkedin' }),
    ])
    const adapter = asyncAdapter()

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({
      due: 1,
      submitted: 1,
      published: 0,
      errors: [],
    })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('submitted')
    // The claim is released — the vendor holds the post now.
    expect(doc.claimedAt).toBeNull()
    expect(doc.submission).toEqual({
      vendorPostId: 'buffer-1',
      submittedAt: NOW.toISOString(),
      lastCheckedAt: null,
    })
    // The vendor id must NOT hide in the native-id field.
    expect(doc.publishResult).toBeNull()
    expect(doc.attempts).toEqual([
      expect.objectContaining({ at: NOW.toISOString(), outcome: 'submitted' }),
    ])
  })

  it('stamps submittedAt when the VENDOR ANSWERED, not when the tick began', async () => {
    // Buffer's create took 10.9 s in the spike, and earlier work in the same
    // tick adds more. `submittedAt` is what the confirm cadence and the
    // 15-minute timeout are measured from, so stamping it with the tick's
    // start polls the submission early and can fail it `ambiguous` before it
    // has actually waited the promised interval.
    const ACCEPTED_AT = new Date(NOW.getTime() + 11_000)
    const store = new MemoryVariantStore([
      makeVariant({ platform: 'linkedin' }),
    ])

    await runPublishTick({
      store,
      resolveAdapter: async () => asyncAdapter(),
      now: NOW,
      // The tick still reasons about what is due from `now`; only the
      // completion stamp comes from here.
      clock: () => ACCEPTED_AT,
    })

    const doc = store.get('variant-1')
    // On the VALUE: 11 seconds of real waiting that the old stamp threw away.
    expect(doc.submission?.submittedAt).toBe(ACCEPTED_AT.toISOString())
    expect(doc.submission?.submittedAt).not.toBe(NOW.toISOString())
    expect(doc.attempts.at(-1)?.at).toBe(ACCEPTED_AT.toISOString())
  })

  it('surfaces the vendor receipt when the submit WRITE throws', async () => {
    // The receipt exists in exactly one place at this moment: it came back
    // from `publish()` and the write that would have stored it just failed.
    // Without this the throw reaches dispatch's catch, which logs the Sanity
    // error alone — the document stays `publishing`, is stale-failed 15
    // minutes later, and the only id that could reconcile a possibly-live
    // post is gone. The lost-CAS path already logged it; a throw did not.
    const store = new MemoryVariantStore([
      makeVariant({ platform: 'linkedin' }),
    ])
    store.transition = vi.fn(async () => {
      throw new Error('Sanity is unreachable')
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => asyncAdapter(),
      now: NOW,
    })

    // ON THE VALUE: the vendor's id has to be in what an organizer can read,
    // not merely "an error was logged".
    expect(summary.errors.join('\n')).toContain('buffer-1')
    expect(summary.errors.join('\n')).toMatch(/do NOT retry/i)
  })

  it('surfaces the CONFIRMED receipt when the settle write throws', async () => {
    // The vendor said the post is live and named it; the write that would
    // have recorded that just failed. The sweep's catch logged the Sanity
    // error alone, the variant stayed `submitted`, and if the vendor record
    // was gone by the next read it settled `ambiguous` — for a post the
    // engine had proof of. The submit write and the lost-CAS branch already
    // surfaced their receipt; this write did not.
    const store = new MemoryVariantStore([submittedVariant()])
    store.transition = vi.fn(async () => {
      throw new Error('Sanity is unreachable')
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () =>
        asyncAdapter([
          {
            state: 'published',
            externalId: 'urn:li:share:7',
            url: 'https://www.linkedin.com/feed/update/7',
          },
        ]),
      now: NOW,
    })

    // ON THE VALUE: the platform's own id and address are in what an
    // organizer can read, not merely "an error was logged".
    const errors = summary.errors.join('\n')
    expect(errors).toContain('urn:li:share:7')
    expect(errors).toContain('https://www.linkedin.com/feed/update/7')
    expect(errors).toMatch(/do NOT retry/i)
  })

  it('a synchronous adapter still publishes in one step — Bluesky is untouched', async () => {
    const store = new MemoryVariantStore([makeVariant()])
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () =>
        fakeAdapter({
          ok: true,
          externalId: 'at://x',
          url: 'https://bsky.app/x',
        }),
      now: NOW,
    })
    expect(summary).toMatchObject({ published: 1, submitted: 0 })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('published')
    expect(doc.submission).toBeNull()
  })
})

describe('never-double-post across the new state (#1128)', () => {
  it('a submitted variant is never picked up by the due scan, and the adapter is never asked to publish', async () => {
    const store = new MemoryVariantStore([
      submittedVariant({}, { scheduledAt: minutesAgo(30) }),
    ])
    const before = store.get('variant-1')
    const adapter = asyncAdapter()

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary.candidates).toBe(0)
    expect(summary.due).toBe(0)
    // Fails on the ACTION happening, not on an absence of error.
    expect(adapter.publish).not.toHaveBeenCalled()
    const after = store.get('variant-1')
    expect(after.status).toBe('submitted')
    expect(after.attempts).toHaveLength(before.attempts.length)
  })

  // NOT evidence about `sanitySocialVariantStore`: a Sanity patch cannot
  // carry a status precondition, so the real claim is revision-only and the
  // status guard lives in the due READ (proved in `sanity.groq.test.ts`,
  // including for a submitted variant whose scheduledAt is already past).
  // This pins the FAKE's extra strictness so an engine test can never claim
  // a submitted variant by accident and read as a pass.
  it('the in-memory claim refuses a submitted variant handed straight to it', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const claimed = await store.claim(store.get('variant-1'), NOW)
    expect(claimed).toBeNull()
    expect(store.get('variant-1').status).toBe('submitted')
    expect(store.get('variant-1').claimedAt).toBeNull()
  })

  it('the stale-claim sweep ignores it: `submitted` is not a claim, and it must never be failed as one', async () => {
    const store = new MemoryVariantStore([
      submittedVariant({ submittedAt: minutesAgo(STALE_CLAIM_MINUTES + 30) }),
    ])
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => asyncAdapter([{ state: 'pending' }]),
      now: NOW,
    })
    expect(summary.staleFailed).toBe(0)
    // It settles through the CONFIRM path instead (timed out → ambiguous).
    expect(store.get('variant-1').attempts.at(-1)).toMatchObject({
      outcome: 'ambiguous',
    })
  })
})

describe('the confirm sweep (#1128)', () => {
  it('a sent post becomes published with the platform ids, as a SECOND attempt leg', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const adapter = asyncAdapter([
      {
        state: 'published',
        externalId: 'urn:li:share:7',
        url: 'https://www.linkedin.com/feed/update/7',
      },
    ])

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary).toMatchObject({
      confirmChecked: 1,
      confirmPublished: 1,
      errors: [],
    })
    expect(adapter.confirm).toHaveBeenCalledWith('buffer-1')
    const doc = store.get('variant-1')
    expect(doc.status).toBe('published')
    expect(doc.publishResult).toEqual({
      externalId: 'urn:li:share:7',
      url: 'https://www.linkedin.com/feed/update/7',
    })
    expect(doc.attempts.map((a) => a.outcome)).toEqual([
      'submitted',
      'published',
    ])
    expect(doc.submission?.lastCheckedAt).toBe(NOW.toISOString())
  })

  it('a vendor error fails the variant terminally, carries its message and notifies', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const failures: VariantFailureEvent[] = []

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () =>
        asyncAdapter([{ state: 'failed', message: 'LinkedIn said no' }]),
      now: NOW,
      onFailed: async (event) => {
        failures.push(event)
      },
    })

    expect(summary).toMatchObject({ confirmFailed: 1, errors: [] })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    expect(doc.attempts.at(-1)).toMatchObject({
      outcome: 'rejected',
      error: 'LinkedIn said no',
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].variant._id).toBe('variant-1')
  })

  it('a post gone from the vendor is AMBIGUOUS, never rejected — it may have gone out', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    await runPublishTick({
      store,
      resolveAdapter: async () => asyncAdapter([{ state: 'gone' }]),
      now: NOW,
    })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('failed')
    expect(doc.attempts.at(-1)?.outcome).toBe('ambiguous')
  })

  it('a pending post stays submitted and only its lastCheckedAt moves', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => asyncAdapter([{ state: 'pending' }]),
      now: NOW,
    })
    expect(summary).toMatchObject({
      confirmChecked: 1,
      confirmPublished: 0,
      confirmFailed: 0,
    })
    const doc = store.get('variant-1')
    expect(doc.status).toBe('submitted')
    expect(doc.submission?.lastCheckedAt).toBe(NOW.toISOString())
    expect(doc.attempts).toHaveLength(1)
  })

  it('is not due again straight after a check: the backoff is honoured', async () => {
    const store = new MemoryVariantStore([
      submittedVariant({ lastCheckedAt: minutesAgo(0) }),
    ])
    const adapter = asyncAdapter()
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })
    expect(adapter.confirm).not.toHaveBeenCalled()
    expect(summary.confirmDeferred).toBe(1)
  })

  it('an unresolved submission past the confirm timeout fails as ambiguous — after ONE last read', async () => {
    // REVERSED deliberately. This asserted `confirm` was NOT called, on the
    // reasoning that a timed-out submission's answer could not change the
    // verdict. It can: `decideAfterConfirm` returns `published` for a
    // `published` check whatever the clock says, and the test below proves it.
    // Skipping the read threw away an authoritative answer — and the post's
    // URL with it — for a post the vendor could still name.
    const store = new MemoryVariantStore([
      submittedVariant({
        submittedAt: minutesAgo(CONFIRM_TIMEOUT_MINUTES + 1),
        lastCheckedAt: minutesAgo(0),
      }),
    ])
    const adapter = asyncAdapter()

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    // Asked once — the cost is one read per submission, since a timed-out
    // submission settles either way and is never read again.
    expect(adapter.confirm).toHaveBeenCalledTimes(1)
    expect(summary).toMatchObject({ confirmFailed: 1, confirmChecked: 1 })
    const doc = store.get('variant-1')
    // Still ambiguous when that read says nothing — the verdict is unchanged
    // for the case the old test was really about.
    expect(doc.status).toBe('failed')
    expect(doc.attempts.at(-1)?.outcome).toBe('ambiguous')
  })

  it('a timed-out submission the vendor CAN name is published, not lost', async () => {
    // The case the old behaviour destroyed, and the reason for the reversal
    // above: the first revisit after the deadline is often the first revisit
    // at all (cron downtime, a deferred tick). The vendor knows the post went
    // out; fabricating `pending` marked it ambiguous and discarded the URL.
    const store = new MemoryVariantStore([
      submittedVariant({
        submittedAt: minutesAgo(CONFIRM_TIMEOUT_MINUTES + 1),
        lastCheckedAt: null,
      }),
    ])
    const adapter = {
      ...asyncAdapter(),
      confirm: vi.fn(async () => ({
        state: 'published' as const,
        externalId: 'urn:li:share:7238',
        url: 'https://www.linkedin.com/posts/cloudnativebergen_activity-7238',
      })),
    }

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    // ON THE VALUE the organizer would otherwise have had to find by hand.
    const doc = store.get('variant-1')
    expect(doc.status).toBe('published')
    expect(doc.publishResult).toEqual({
      externalId: 'urn:li:share:7238',
      url: 'https://www.linkedin.com/posts/cloudnativebergen_activity-7238',
    })
    expect(summary).toMatchObject({ confirmPublished: 1, confirmFailed: 0 })
    // And the CONFIRMATION leg is the published outcome, not the submit.
    expect(doc.attempts.at(-1)?.outcome).toBe('published')
  })

  it('a vendor read that hangs is bounded and leaves the variant submitted — it says nothing about the post', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const adapter = {
      ...asyncAdapter(),
      confirm: vi.fn(() => new Promise<ConfirmCheck>(() => {})),
    }

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
      confirmTimeoutMs: 10,
    })

    expect(store.get('variant-1').status).toBe('submitted')
    expect(summary.errors.join(' ')).toContain('Confirm read took longer')
  })

  it('an adapter that cannot confirm leaves it submitted until the timeout — not failed on the spot', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => fakeAdapter({ ok: true, externalId: 'x' }),
      now: NOW,
    })
    expect(store.get('variant-1').status).toBe('submitted')
    expect(summary.confirmFailed).toBe(0)
  })

  it('runs BEFORE dispatch, so a confirmed post settles even in a tick that also publishes', async () => {
    const order: string[] = []
    const store = new MemoryVariantStore([
      submittedVariant({}, { _id: 'sub-1' }),
      makeVariant({ _id: 'due-1', platform: 'linkedin' }),
    ])
    const adapter = {
      ...asyncAdapter([{ state: 'published', externalId: 'urn:li:share:1' }]),
      publish: vi.fn(async () => {
        order.push('publish')
        return { ok: true, result: 'accepted', vendorPostId: 'b2' } as const
      }),
    }
    adapter.confirm = vi.fn(async () => {
      order.push('confirm')
      return { state: 'published', externalId: 'urn:li:share:1' } as const
    })

    await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(order).toEqual(['confirm', 'publish'])
    expect(store.get('sub-1').status).toBe('published')
    expect(store.get('due-1').status).toBe('submitted')
  })

  it('stops sweeping while a dispatch still needs its reserve, so it cannot starve the publish half', async () => {
    const store = new MemoryVariantStore([
      submittedVariant({}, { _id: 'sub-1' }),
      submittedVariant({}, { _id: 'sub-2' }),
    ])
    const adapter = asyncAdapter()

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
      // Only just over the dispatch reserve: no confirm read fits.
      deadline: new Date(Date.now() + PUBLISH_RESERVE_MS + 100),
    })

    expect(adapter.confirm).not.toHaveBeenCalled()
    expect(summary.confirmDeferred).toBe(2)
    expect(store.get('sub-1').status).toBe('submitted')
  })

  it('a confirmation that loses the compare-and-set leaves the winner alone and says the post IS live', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const adapter = asyncAdapter()
    adapter.confirm = vi.fn(async () => {
      // Another tick settles the same variant between this sweep's read and
      // its write, so the revision the sweep holds is stale.
      await store.transition('variant-1', {
        status: 'published',
        publishResult: { externalId: 'urn:li:share:winner' },
      })
      return { state: 'published', externalId: 'urn:li:share:loser' } as const
    })

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(summary.confirmPublished).toBe(0)
    expect(summary.settleLost).toBe(1)
    // Fails on the VALUE: the winner's result must still be on the document.
    expect(store.get('variant-1').publishResult).toEqual({
      externalId: 'urn:li:share:winner',
    })
    expect(summary.errors.join(' ')).toContain('urn:li:share:loser')
  })

  it('a pending write that loses the compare-and-set can never pull a settled variant back to submitted', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const adapter = asyncAdapter()
    adapter.confirm = vi.fn(async () => {
      await store.transition('variant-1', {
        status: 'published',
        publishResult: { externalId: 'urn:li:share:winner' },
      })
      return { state: 'pending' } as const
    })

    await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })

    expect(store.get('variant-1').status).toBe('published')
  })

  it('the reserve covers adapter RESOLUTION too, not just the vendor read', async () => {
    const store = new MemoryVariantStore([submittedVariant()])
    const adapter = asyncAdapter()

    const summary = await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
      resolveTimeoutMs: 5_000,
      confirmTimeoutMs: 5_000,
      // Room for the dispatch reserve and ONE 5 s read, but not for the 5 s
      // adapter resolution that precedes it: resolving reads tenant secrets,
      // and a slow one would eat the reserve a dispatch is promised.
      deadline: new Date(Date.now() + PUBLISH_RESERVE_MS + 5_000 + 100),
    })

    expect(adapter.confirm).not.toHaveBeenCalled()
    expect(summary.confirmDeferred).toBe(1)
  })

  it("keeps the sweep inside ONE ORGANIZATION's 15-minute vendor budget", async () => {
    // The cap is global and confirms are NOT put through `pickFairly`, so one
    // organization can occupy every slot in a tick. Buffer's 100-per-15-min
    // is per account, i.e. per organization — so the worst case that matters
    // is one org taking the whole cap on every tick.
    //
    // Pinned as ARITHMETIC, not as the literal 5: the test above uses the
    // constant symbolically and therefore follows it wherever it goes. This
    // one fails if someone raises the cap back over budget, which is exactly
    // how it was wrong before (10 * 15 = 150 against a budget of 100).
    const TICKS_PER_15_MIN = 15
    const VENDOR_BUDGET_PER_15_MIN = 100
    const worstCaseReads = MAX_CONFIRMS_PER_TICK * TICKS_PER_15_MIN

    expect(worstCaseReads).toBeLessThanOrEqual(VENDOR_BUDGET_PER_15_MIN)
    // And leaves room for the dispatches the sweep shares the tick with,
    // rather than consuming the budget exactly.
    expect(worstCaseReads).toBeLessThan(VENDOR_BUDGET_PER_15_MIN)
  })

  it('reads at most MAX_CONFIRMS_PER_TICK submissions — the store is asked for no more', async () => {
    const store = new MemoryVariantStore(
      Array.from({ length: MAX_CONFIRMS_PER_TICK + 3 }, (_, i) =>
        submittedVariant({}, { _id: `sub-${i}` }),
      ),
    )
    const adapter = asyncAdapter()
    await runPublishTick({
      store,
      resolveAdapter: async () => adapter,
      now: NOW,
    })
    expect(adapter.confirm).toHaveBeenCalledTimes(MAX_CONFIRMS_PER_TICK)
  })
})
