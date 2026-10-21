import { describe, expect, it, vi } from 'vitest'
import { MAX_RESPONSES_PER_REQUEST, removeInRequests } from './bulk-remove'

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

  it('says at least how many went when a later request fails, and sends no more', async () => {
    const send = vi
      .fn<(chunk: string[]) => Promise<unknown>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Removed 300 of 2000 responses.'))
    // The failing request's own count is of its chunk, not of the range.
    await expect(removeInRequests(ids(4500), send)).rejects.toThrow(
      'Not all 4500 responses were removed (at least 2000 were). Reload to see what’s left, then remove those.',
    )
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('never passes on a chunk’s count as the range’s when the first of several fails', async () => {
    const send = vi
      .fn<(chunk: string[]) => Promise<unknown>>()
      .mockRejectedValue(new Error('Removed 300 of 2000 responses.'))
    await expect(removeInRequests(ids(4500), send)).rejects.toThrow(
      'Not all 4500 responses were removed. Reload to see what’s left, then remove those.',
    )
  })

  it('passes a single request’s own error on unchanged: its count is the range’s', async () => {
    const error = new Error('Removed 3 of 10 responses.')
    await expect(
      removeInRequests(ids(10), vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error)
  })
})
