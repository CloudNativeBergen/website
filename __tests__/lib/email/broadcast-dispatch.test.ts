/**
 * @vitest-environment node
 *
 * The sponsor send lock is held until Resend has dispatched the broadcast
 * (#1704): `waitForBroadcastDispatch` polls with a doubling backoff, under a
 * cap, and reports whether the broadcast left draft/queued.
 */
import { describe, expect, it, vi } from 'vitest'
import { waitForBroadcastDispatch } from '@/lib/email/broadcast'

const clientWith = (statuses: Array<string | Error>) => {
  const get = vi.fn(async () => {
    const next = statuses.shift() ?? 'queued'
    if (next instanceof Error) throw next
    return { data: { status: next } }
  })
  return { client: { broadcasts: { get } } as never, get }
}

describe('waitForBroadcastDispatch', () => {
  it('returns once the broadcast has left draft and queued', async () => {
    const { client, get } = clientWith(['queued', 'queued', 'sent'])
    const waits: number[] = []
    const ok = await waitForBroadcastDispatch(
      client,
      'b1',
      60_000,
      async (ms) => {
        waits.push(ms)
      },
    )
    expect(ok).toBe(true)
    expect(get).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1000, 2000, 4000])
  })

  it('gives up at the cap, treating read errors as not yet dispatched', async () => {
    const { client } = clientWith([new Error('503'), 'draft'])
    const waits: number[] = []
    const ok = await waitForBroadcastDispatch(
      client,
      'b1',
      10_000,
      async (ms) => {
        waits.push(ms)
      },
    )
    expect(ok).toBe(false)
    expect(waits.reduce((a, b) => a + b, 0)).toBe(10_000)
  })
})
