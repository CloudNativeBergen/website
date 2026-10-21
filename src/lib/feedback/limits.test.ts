import { describe, expect, it, vi } from 'vitest'
import { MAX_RESPONSES_PER_REQUEST, removeInRequests } from './limits'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`)

describe('removeInRequests', () => {
  it('sends a range larger than one request allows in several, in order', async () => {
    const send = vi.fn<(chunk: string[]) => Promise<void>>(async () => {})
    await removeInRequests(ids(2400), send)
    expect(send.mock.calls.map(([chunk]) => chunk.length)).toEqual([
      MAX_RESPONSES_PER_REQUEST,
      400,
    ])
    expect(send.mock.calls.flatMap(([chunk]) => chunk)).toEqual(ids(2400))
  })

  it('says how many went when a later request fails, and sends no more', async () => {
    const send = vi
      .fn<(chunk: string[]) => Promise<unknown>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
    await expect(removeInRequests(ids(4500), send)).rejects.toThrow(
      'Removed 2000 of 4500 responses. Reload to see what’s left, then remove those.',
    )
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('passes the first request’s own error on unchanged', async () => {
    const error = new Error('Removed 300 of 2000 responses.')
    await expect(
      removeInRequests(ids(10), vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error)
  })
})
