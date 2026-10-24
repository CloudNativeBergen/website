/**
 * @vitest-environment node
 *
 * The posting limits (Photo Wall spec §6.3): the counts' GROQ EXECUTED with
 * groq-js over a two-tenant fixture, and the pure decision on the counts.
 *
 * Adversarial fixture: the same device key has pending and recent posts on
 * ANOTHER conference's wall, another device has pending posts on this wall,
 * posts sit exactly on and just outside the hour, and a document of another
 * type has the same fields. Each would change an answer if it counted.
 */
import { evaluate, parse } from 'groq-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  queries: [] as string[],
}))

async function run(query: string, params: Record<string, unknown> = {}) {
  h.queries.push(query)
  const value = await evaluate(parse(query), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: run },
  clientReadCached: {
    fetch: async () => {
      throw new Error('a read that decides must not use the CDN client')
    },
  },
  clientWrite: {},
}))

import {
  MAX_PENDING_PER_DEVICE,
  MAX_PENDING_PER_WALL,
  MAX_POSTS_PER_DEVICE_PER_HOUR,
  postingLimitHit,
  readPostingCounts,
} from './limits'

const NOW = new Date('2026-10-26T10:00:00.000Z')
const DEVICE = 'd1'.padEnd(32, '0')
const OTHER_DEVICE = 'd2'.padEnd(32, '0')

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString()

let n = 0
const post = (
  conference: string,
  deviceKey: string,
  status: string,
  submittedAt: string,
  _type = 'wallPost',
) => ({
  _id: `${_type}-${++n}`,
  _type,
  conference: { _type: 'reference', _ref: conference },
  deviceKey,
  status,
  submittedAt,
})

beforeEach(() => {
  n = 0
  h.queries.length = 0
  h.dataset = [
    // This device, this wall: three pending (one two hours old), and one
    // post in every other status inside the hour.
    post('conf-A', DEVICE, 'pending', minutesAgo(120)),
    post('conf-A', DEVICE, 'pending', minutesAgo(50)),
    post('conf-A', DEVICE, 'pending', minutesAgo(10)),
    post('conf-A', DEVICE, 'approved', minutesAgo(10)),
    post('conf-A', DEVICE, 'notShown', minutesAgo(30)),
    post('conf-A', DEVICE, 'deleting', minutesAgo(5)),
    // On and just outside the hour.
    post('conf-A', DEVICE, 'approved', minutesAgo(60)),
    post('conf-A', DEVICE, 'approved', minutesAgo(61)),
    // Another device on this wall.
    post('conf-A', OTHER_DEVICE, 'pending', minutesAgo(3)),
    post('conf-A', OTHER_DEVICE, 'pending', minutesAgo(2)),
    post('conf-A', OTHER_DEVICE, 'approved', minutesAgo(1)),
    // The same device on ANOTHER conference's wall: must not count.
    post('conf-B', DEVICE, 'pending', minutesAgo(1)),
    post('conf-B', DEVICE, 'pending', minutesAgo(2)),
    post('conf-B', DEVICE, 'pending', minutesAgo(3)),
    post('conf-B', DEVICE, 'pending', minutesAgo(4)),
    post('conf-B', OTHER_DEVICE, 'pending', minutesAgo(4)),
    // Another type with the same fields.
    post('conf-A', DEVICE, 'pending', minutesAgo(1), 'feedbackResponse'),
  ]
})

describe('readPostingCounts', () => {
  it('counts this device’s pending posts on this wall only', async () => {
    const counts = await readPostingCounts('conf-A', DEVICE, NOW)
    expect(counts.pendingByDevice).toBe(3)
  })

  it('counts every device’s pending posts on this wall, and none of another wall’s', async () => {
    const counts = await readPostingCounts('conf-A', DEVICE, NOW)
    expect(counts.pendingOnWall).toBe(5)
  })

  it('counts this device’s posts of any status submitted in the last 60 minutes, exclusive', async () => {
    const counts = await readPostingCounts('conf-A', DEVICE, NOW)
    // 50, 10 (pending), 10 (approved), 30 (notShown), 5 (deleting).
    expect(counts.byDeviceInLastHour).toBe(5)
  })

  it('sees the other conference’s posts when asked for that conference', async () => {
    expect(await readPostingCounts('conf-B', DEVICE, NOW)).toEqual({
      pendingByDevice: 4,
      pendingOnWall: 5,
      byDeviceInLastHour: 4,
    })
  })

  it('is zero on every count for an unknown device and an empty wall', async () => {
    expect(await readPostingCounts('conf-A', 'nobody', NOW)).toEqual({
      pendingByDevice: 0,
      pendingOnWall: 5,
      byDeviceInLastHour: 0,
    })
    expect(await readPostingCounts('conf-C', DEVICE, NOW)).toEqual({
      pendingByDevice: 0,
      pendingOnWall: 0,
      byDeviceInLastHour: 0,
    })
  })

  it('reads all three counts in ONE query, on the non-CDN client', async () => {
    await readPostingCounts('conf-A', DEVICE, NOW)
    expect(h.queries).toHaveLength(1)
  })
})

describe('postingLimitHit (§6.3)', () => {
  const fine = { pendingByDevice: 2, pendingOnWall: 199, byDeviceInLastHour: 9 }

  it('allows a post under every limit', () => {
    expect(postingLimitHit(fine)).toBeNull()
    expect(
      postingLimitHit({
        pendingByDevice: 0,
        pendingOnWall: 0,
        byDeviceInLastHour: 0,
      }),
    ).toBeNull()
  })

  it('refuses the fourth post while three of the device’s posts are pending', () => {
    expect(MAX_PENDING_PER_DEVICE).toBe(3)
    expect(postingLimitHit({ ...fine, pendingByDevice: 3 })).toBe(
      'pendingDevice',
    )
  })

  it('refuses the eleventh post of a device within an hour', () => {
    expect(MAX_POSTS_PER_DEVICE_PER_HOUR).toBe(10)
    expect(postingLimitHit({ ...fine, byDeviceInLastHour: 10 })).toBe('hourly')
  })

  it('refuses when 200 posts are pending on the wall', () => {
    expect(MAX_PENDING_PER_WALL).toBe(200)
    expect(postingLimitHit({ ...fine, pendingOnWall: 200 })).toBe('pendingWall')
  })

  it('names the device’s own limit before the wall’s, so the phone gets the message it can act on', () => {
    expect(
      postingLimitHit({
        pendingByDevice: 3,
        pendingOnWall: 200,
        byDeviceInLastHour: 10,
      }),
    ).toBe('pendingDevice')
    expect(
      postingLimitHit({
        pendingByDevice: 0,
        pendingOnWall: 200,
        byDeviceInLastHour: 10,
      }),
    ).toBe('hourly')
  })
})
