import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the ATOMIC Sanity persistence of push subscriptions (#444, S3).
 *
 * The point of the rework is that mutations are expressed as atomic
 * unset/insert patches keyed by endpoint — never a read-modify-write of the
 * whole `pushSubscriptions` array — so concurrent device changes can't clobber
 * each other and a prune can't resurrect a rotated endpoint. These tests assert
 * the SHAPE of the emitted mutations rather than a final array value.
 */

// Recording mock for the Sanity write client. Each patch builder records the
// operations invoked on it so a test can assert unset/setIfMissing/insert.
interface RecordedOp {
  kind: 'unset' | 'setIfMissing' | 'insert' | 'set'
  args: unknown[]
}
let txPatches: Array<{ id: string; ops: RecordedOp[] }> = []
let standalonePatches: Array<{ id: string; ops: RecordedOp[] }> = []
let fetchResult: unknown = null
let fetchCalls: unknown[][] = []

function makePatchBuilder(sink: RecordedOp[]) {
  const builder: Record<string, unknown> = {}
  const record = (kind: RecordedOp['kind']) =>
    vi.fn((...args: unknown[]) => {
      sink.push({ kind, args })
      return builder
    })
  builder.unset = record('unset')
  builder.setIfMissing = record('setIfMissing')
  builder.insert = record('insert')
  builder.set = record('set')
  builder.commit = vi.fn().mockResolvedValue(undefined)
  return builder
}

vi.mock('@/lib/sanity/client', () => {
  const transaction = () => {
    const tx: Record<string, unknown> = {}
    tx.patch = vi.fn((id: string, fn: (b: unknown) => void) => {
      const ops: RecordedOp[] = []
      fn(makePatchBuilder(ops))
      txPatches.push({ id, ops })
      return tx
    })
    tx.commit = vi.fn().mockResolvedValue(undefined)
    return tx
  }
  return {
    clientWrite: {
      transaction: vi.fn(transaction),
      patch: vi.fn((id: string) => {
        const ops: RecordedOp[] = []
        const b = makePatchBuilder(ops)
        standalonePatches.push({ id, ops })
        return b
      }),
    },
    clientReadUncached: {
      fetch: vi.fn(async (...args: unknown[]) => {
        fetchCalls.push(args)
        return fetchResult
      }),
    },
  }
})

import {
  addPushSubscription,
  removePushSubscription,
  getSpeakerPushStates,
  MAX_SUBSCRIPTIONS_PER_SPEAKER,
} from '@/lib/push/sanity'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

const SPEAKER = 'speaker-abc'

function stored(endpoint: string, createdAt: string) {
  return {
    _key: `push-${endpoint}`,
    endpoint,
    keys: { p256dh: 'p', auth: 'a' },
    createdAt,
  }
}

beforeEach(() => {
  txPatches = []
  standalonePatches = []
  fetchResult = null
  fetchCalls = []
})

describe('removePushSubscription', () => {
  it('issues a single atomic unset keyed by endpoint (no full-array set)', async () => {
    await removePushSubscription(SPEAKER, 'https://push.example/a')
    expect(standalonePatches).toHaveLength(1)
    expect(standalonePatches[0].id).toBe(SPEAKER)
    const ops = standalonePatches[0].ops
    expect(ops.map((o) => o.kind)).toEqual(['unset'])
    expect(ops[0].args[0]).toEqual([
      'pushSubscriptions[endpoint=="https://push.example/a"]',
    ])
  })
})

describe('addPushSubscription', () => {
  it('unsets the incoming endpoint then inserts the new record (dedup + append)', async () => {
    fetchResult = { pushSubscriptions: [] }
    await addPushSubscription(SPEAKER, {
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'p', auth: 'a' },
    })

    // Two patches in one transaction: unset-first, then setIfMissing + insert.
    expect(txPatches).toHaveLength(2)
    expect(txPatches[0].ops.map((o) => o.kind)).toEqual(['unset'])
    expect(txPatches[0].ops[0].args[0]).toEqual([
      'pushSubscriptions[endpoint=="https://push.example/new"]',
    ])
    const addOps = txPatches[1].ops.map((o) => o.kind)
    expect(addOps).toEqual(['setIfMissing', 'insert'])
    const insert = txPatches[1].ops[1]
    expect(insert.args[0]).toBe('after')
    expect(insert.args[1]).toBe('pushSubscriptions[-1]')
    const [item] = insert.args[2] as Array<{ _key: string; endpoint: string }>
    expect(item.endpoint).toBe('https://push.example/new')
    expect(item._key).toMatch(/^push-/)
  })

  it('never rewrites the whole array (no `set` op)', async () => {
    fetchResult = { pushSubscriptions: [stored('https://push.example/x', '1')] }
    await addPushSubscription(SPEAKER, {
      endpoint: 'https://push.example/y',
      keys: { p256dh: 'p', auth: 'a' },
    })
    const allKinds = txPatches.flatMap((p) => p.ops.map((o) => o.kind))
    expect(allKinds).not.toContain('set')
  })

  it('evicts the oldest endpoint when the device cap is exceeded', async () => {
    // MAX existing OTHER endpoints → adding one more must evict the oldest first.
    const existing = Array.from(
      { length: MAX_SUBSCRIPTIONS_PER_SPEAKER },
      (_, i) =>
        stored(
          `https://push.example/${i}`,
          `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
    )
    fetchResult = { pushSubscriptions: existing }

    await addPushSubscription(SPEAKER, {
      endpoint: 'https://push.example/fresh',
      keys: { p256dh: 'p', auth: 'a' },
    })

    const unsetPaths = txPatches[0].ops[0].args[0] as string[]
    // Unsets the incoming endpoint (dedup) AND the single oldest existing one.
    expect(unsetPaths).toContain(
      'pushSubscriptions[endpoint=="https://push.example/fresh"]',
    )
    expect(unsetPaths).toContain(
      'pushSubscriptions[endpoint=="https://push.example/0"]',
    )
  })
})

describe('getSpeakerPushStates (batched fan-out read)', () => {
  it('reads EVERY recipient in ONE query and keys the result by speaker id', async () => {
    // The push bridge called `getSpeakerPushState` once per recipient, so a
    // 200-speaker announcement cost 200 reads. This is the batched replacement;
    // the assertion is on the read COUNT, which an N+1 regression fails.
    fetchResult = [
      {
        _id: 'sp-1',
        pushSubscriptions: [
          {
            endpoint: 'https://push.example/a',
            keys: { p256dh: 'p', auth: 'a' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pushPreferences: { ...DEFAULT_PUSH_PREFERENCES, messages: false },
      },
      { _id: 'sp-2', pushSubscriptions: [], pushPreferences: undefined },
    ]

    const states = await getSpeakerPushStates(['sp-1', 'sp-2'])

    expect(fetchCalls).toHaveLength(1)
    const [query, params] = fetchCalls[0] as [string, Record<string, unknown>]
    expect(query).toContain('_type == "speaker"')
    expect(query).toContain('_id in $speakerIds')
    expect(query).toContain('pushSubscriptions')
    expect(query).toContain('pushPreferences')
    expect(params.speakerIds).toEqual(['sp-1', 'sp-2'])

    expect(states.get('sp-1')!.subscriptions).toHaveLength(1)
    expect(states.get('sp-1')!.preferences.messages).toBe(false)
    // A speaker with no stored preferences still gets the normalised defaults.
    expect(states.get('sp-2')!.preferences).toEqual(DEFAULT_PUSH_PREFERENCES)
  })

  it('never mixes one speaker’s subscriptions into another’s entry', async () => {
    fetchResult = [
      {
        _id: 'sp-1',
        pushSubscriptions: [
          {
            endpoint: 'https://push.example/one',
            keys: { p256dh: 'p', auth: 'a' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        _id: 'sp-2',
        pushSubscriptions: [
          {
            endpoint: 'https://push.example/two',
            keys: { p256dh: 'p', auth: 'a' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]
    const states = await getSpeakerPushStates(['sp-1', 'sp-2'])
    expect(states.get('sp-1')!.subscriptions.map((s) => s.endpoint)).toEqual([
      'https://push.example/one',
    ])
    expect(states.get('sp-2')!.subscriptions.map((s) => s.endpoint)).toEqual([
      'https://push.example/two',
    ])
  })

  it('drops malformed subscription records exactly as the single-speaker read does', async () => {
    fetchResult = [
      {
        _id: 'sp-1',
        pushSubscriptions: [
          { endpoint: 'https://push.example/nokeys' },
          {
            endpoint: 'https://push.example/ok',
            keys: { p256dh: 'p', auth: 'a' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]
    const states = await getSpeakerPushStates(['sp-1'])
    expect(states.get('sp-1')!.subscriptions.map((s) => s.endpoint)).toEqual([
      'https://push.example/ok',
    ])
  })

  it('leaves a speaker with no document ABSENT from the map', async () => {
    fetchResult = [{ _id: 'sp-1', pushSubscriptions: [] }]
    const states = await getSpeakerPushStates(['sp-1', 'ghost'])
    expect(states.has('ghost')).toBe(false)
  })

  it('dedupes and drops blank ids, and reads nothing for an empty set', async () => {
    fetchResult = []
    await getSpeakerPushStates(['sp-1', 'sp-1', ''])
    const [, params] = fetchCalls[0] as [string, Record<string, unknown>]
    expect(params.speakerIds).toEqual(['sp-1'])

    fetchCalls = []
    const empty = await getSpeakerPushStates([])
    expect(empty.size).toBe(0)
    expect(fetchCalls).toHaveLength(0)
  })
})
