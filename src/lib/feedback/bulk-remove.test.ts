import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RESPONSES_PER_REQUEST,
  removeInRequests,
  type RemovedCounts,
  type RemoveRequest,
} from './bulk-remove'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`)
const range = (n: number): RemoveRequest => ({
  range: { from: '2026-06-10T10:00:00.000Z', to: '2026-06-10T10:30:00.000Z' },
  responses: ids(n).map((id) => ({ id, submittedAt: '2026-06-10T10:05:00Z' })),
})

describe('removeInRequests', () => {
  it('sends a range larger than one request allows in several, in order', async () => {
    const send = vi.fn(async (chunk: RemoveRequest) => ({
      removed: chunk.responses.length - 2,
      gone: 1,
      changed: 1,
    }))
    // Each request skips one response gone and keeps one changed.
    expect(await removeInRequests(range(2400), send)).toEqual({
      removed: 2396,
      gone: 2,
      changed: 2,
    })
    expect(send.mock.calls.map(([chunk]) => chunk.responses.length)).toEqual([
      MAX_RESPONSES_PER_REQUEST,
      400,
    ])
    expect(
      send.mock.calls.flatMap(([chunk]) => chunk.responses.map((r) => r.id)),
    ).toEqual(ids(2400))
    // Every request carries the range's bounds.
    for (const [chunk] of send.mock.calls)
      expect(chunk.range).toEqual(range(1).range)
  })

  it('says at least how many went when a later request fails, and sends no more', async () => {
    const send = vi
      .fn<(chunk: RemoveRequest) => Promise<RemovedCounts>>()
      .mockResolvedValueOnce({ removed: 1990, gone: 10, changed: 0 })
      .mockRejectedValueOnce(new Error('Removed 300 of 2000 responses.'))
    // The failing request's own count is of its chunk, not of the range.
    await expect(removeInRequests(range(4500), send)).rejects.toThrow(
      'Not all 4500 responses were removed (at least 1990 were). Reload to see what’s left, then remove those.',
    )
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('never passes on a chunk’s count as the range’s when the first of several fails', async () => {
    const send = vi
      .fn<(chunk: RemoveRequest) => Promise<RemovedCounts>>()
      .mockRejectedValue(new Error('Removed 300 of 2000 responses.'))
    await expect(removeInRequests(range(4500), send)).rejects.toThrow(
      'Not all 4500 responses were removed. Reload to see what’s left, then remove those.',
    )
  })

  it('passes a single request’s own error on unchanged: its count is the range’s', async () => {
    const error = new Error('Removed 3 of 10 responses.')
    await expect(
      removeInRequests(range(10), vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error)
  })
})
