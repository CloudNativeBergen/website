import { describe, it, expect } from 'vitest'
import { readBounded } from '../bytes'

function chunked(chunks: number, size: number) {
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === chunks) return controller.close()
      pulled++
      controller.enqueue(new Uint8Array(size).fill(pulled))
    },
  })
  return { stream, pulls: () => pulled }
}

describe('readBounded — the cap bounds consumption, not just the result', () => {
  it('stops pulling the moment the cap is crossed and reports the overflow', async () => {
    const body = chunked(100, 1024)
    const out = await readBounded(new Response(body.stream), 4 * 1024)
    expect(out).toBeNull()
    // Four chunks fit; the fifth crosses the cap; nothing after it is read.
    expect(body.pulls()).toBe(5)
  })

  it('with truncate keeps exactly the first maxBytes and still stops pulling', async () => {
    const body = chunked(100, 1024)
    const out = await readBounded(new Response(body.stream), 2_500, {
      truncate: true,
    })
    expect(out?.byteLength).toBe(2_500)
    expect(out?.[2_499]).toBe(3)
    expect(body.pulls()).toBe(3)
  })

  it('returns the whole body when it fits', async () => {
    const body = chunked(3, 100)
    const out = await readBounded(new Response(body.stream), 300)
    expect(out?.byteLength).toBe(300)
  })
})
