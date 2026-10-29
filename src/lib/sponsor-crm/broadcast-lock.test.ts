import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A one-document store with Sanity's create and `ifRevisionId` semantics. */
const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown> & { _rev: string }>()
  let n = 0
  const conflict = () =>
    Object.assign(new Error('conflict'), { statusCode: 409 })
  const client = {
    create: async (doc: Record<string, unknown>) => {
      const id = doc._id as string
      if (docs.has(id)) throw conflict()
      const saved = { ...doc, _rev: `r${++n}` }
      docs.set(id, saved)
      return saved
    },
    getDocument: async (id: string) => docs.get(id),
    patch: (id: string) => {
      let rev: string | undefined
      let sets: Record<string, unknown> = {}
      const p = {
        ifRevisionId: (r: string) => ((rev = r), p),
        set: (s: Record<string, unknown>) => ((sets = s), p),
        commit: async () => {
          const cur = docs.get(id)
          if (!cur || (rev && cur._rev !== rev)) throw conflict()
          const saved = { ...cur, ...sets, _rev: `r${++n}` }
          docs.set(id, saved)
          return saved
        },
      }
      return p
    },
  }
  return { docs, client }
})

vi.mock('@/lib/sanity/client', () => ({ clientWrite: store.client }))

import {
  BROADCAST_LOCK_TTL_MS,
  acquireBroadcastLock,
  extendBroadcastLock,
  holdsBroadcastLock,
  releaseBroadcastLock,
} from './broadcast-lock'

const T0 = Date.parse('2026-10-29T12:00:00Z')

beforeEach(() => store.docs.clear())

describe('sponsor broadcast lock', () => {
  it('lets one send in and refuses the next while it is held', async () => {
    expect(await acquireBroadcastLock('conf-a', T0)).toBeTruthy()
    expect(await acquireBroadcastLock('conf-a', T0 + 1000)).toBeNull()
  })

  it('is per conference', async () => {
    await acquireBroadcastLock('conf-a', T0)
    expect(await acquireBroadcastLock('conf-b', T0)).toBeTruthy()
  })

  it('is free again once released', async () => {
    const lock = await acquireBroadcastLock('conf-a', T0)
    await releaseBroadcastLock(lock!)
    expect(await acquireBroadcastLock('conf-a', T0 + 1000)).toBeTruthy()
  })

  it('expires, so a crashed send cannot block forever', async () => {
    await acquireBroadcastLock('conf-a', T0)
    expect(
      await acquireBroadcastLock('conf-a', T0 + BROADCAST_LOCK_TTL_MS - 1),
    ).toBeNull()
    expect(
      await acquireBroadcastLock('conf-a', T0 + BROADCAST_LOCK_TTL_MS + 1),
    ).toBeTruthy()
  })

  it('a send that outlived its claim cannot release the newer one', async () => {
    const stale = await acquireBroadcastLock('conf-a', T0)
    await acquireBroadcastLock('conf-a', T0 + BROADCAST_LOCK_TTL_MS + 1)
    await releaseBroadcastLock(stale!)
    expect(
      await acquireBroadcastLock('conf-a', T0 + BROADCAST_LOCK_TTL_MS + 2),
    ).toBeNull()
  })

  it('A, taken over after expiry, no longer holds it and cannot extend it', async () => {
    const a = await acquireBroadcastLock('conf-a', T0)
    expect(await holdsBroadcastLock(a!)).toBe(true)
    const b = await acquireBroadcastLock(
      'conf-a',
      T0 + BROADCAST_LOCK_TTL_MS + 1,
    )
    expect(b).toBeTruthy()
    expect(await holdsBroadcastLock(a!)).toBe(false)
    expect(await extendBroadcastLock(a!)).toBe(false)
    expect(await holdsBroadcastLock(b!)).toBe(true)
  })

  it('an extension keeps the claim alive past the original expiry', async () => {
    const a = await acquireBroadcastLock('conf-a', T0)
    expect(await extendBroadcastLock(a!, T0 + BROADCAST_LOCK_TTL_MS - 1)).toBe(
      true,
    )
    expect(
      await acquireBroadcastLock('conf-a', T0 + BROADCAST_LOCK_TTL_MS + 1),
    ).toBeNull()
    expect(await holdsBroadcastLock(a!)).toBe(true)
  })

  it('rethrows errors that are not a conflict', async () => {
    const spy = vi
      .spyOn(store.client, 'create')
      .mockRejectedValueOnce(new Error('network down'))
    await expect(acquireBroadcastLock('conf-a', T0)).rejects.toThrow(
      'network down',
    )
    spy.mockRestore()
  })
})
