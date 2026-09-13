import { describe, it, expect, vi } from 'vitest'
import { runPublishTick } from '../publish-engine'
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
      urlLengthCost: null,
      linkInBody: true,
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
  it('moves a due variant to awaiting-manual with an audit-visible claim release when no adapter is configured', async () => {
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
