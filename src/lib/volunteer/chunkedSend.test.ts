import { describe, it, expect, vi } from 'vitest'
import { sendInChunks, VOLUNTEER_EMAIL_CHUNK } from './chunkedSend'

const ids = Array.from(
  { length: VOLUNTEER_EMAIL_CHUNK * 2 + 5 },
  (_, i) => `v${i}`,
)

describe('sendInChunks', () => {
  it('sends sequential chunks, collects failures and reports progress', async () => {
    const send = vi.fn(async (chunk: string[]) => ({
      failed: chunk.includes('v3')
        ? [{ id: 'v3', email: 'x@y', error: 'boom' }]
        : [],
    }))
    const progress: number[] = []
    const res = await sendInChunks(ids, send, (d) => progress.push(d))
    expect(send.mock.calls.map((c) => c[0].length)).toEqual([25, 25, 5])
    expect(progress).toEqual([25, 50, 55])
    expect(res).toEqual({
      done: 55,
      failed: [{ id: 'v3', email: 'x@y', error: 'boom' }],
    })
  })

  it('stops on error and resumes without resending', async () => {
    const seen: string[] = []
    let failOnce = true
    const send = vi.fn(async (chunk: string[]) => {
      if (chunk[0] === 'v25' && failOnce) {
        failOnce = false
        throw new Error('timeout')
      }
      seen.push(...chunk)
      return { failed: [] }
    })
    const first = await sendInChunks(ids, send)
    expect(first.done).toBe(25)
    expect(first.error?.message).toBe('timeout')
    const second = await sendInChunks(ids.slice(first.done), send)
    expect(second.done).toBe(30)
    expect(seen).toEqual(ids) // each id exactly once
  })
})
