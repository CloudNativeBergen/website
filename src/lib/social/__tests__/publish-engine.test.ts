import { describe, it, expect, vi } from 'vitest'
import {
  MAX_PER_CONFERENCE_PER_TICK,
  pickFairly,
  runPublishTick,
} from '../publish-engine'
import type {
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from '../provider/types'
import { STALE_CLAIM_MINUTES } from '../state-machine'
import { MemoryVariantStore, makeVariant } from './memory-store'

const NOW = new Date('2026-09-13T10:00:00.000Z')
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString()

function fakeAdapter(
  outcome: PublishOutcome | Error,
  issues: ValidationIssue[] = [],
): SocialPublishAdapter & { publish: ReturnType<typeof vi.fn> } {
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
      linkInBody: true,
      imageAspectRatio: null,
      maxBytes: null,
      linkCardDisplacesImages: false,
    },
    validate: () => issues,
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
    adapter.validate = () => {
      throw new Error('bad grapheme lib')
    }

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
