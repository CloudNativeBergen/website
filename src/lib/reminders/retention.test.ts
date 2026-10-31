/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  deleted: [] as string[],
  commit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => {
  const tx = {
    delete: (id: string) => {
      h.deleted.push(id)
      return tx
    },
    commit: h.commit,
  }
  return {
    clientReadUncached: { fetch: h.fetch },
    clientWrite: { transaction: () => tx },
  }
})

import { deleteExpiredReminderLogs } from './retention'

beforeEach(() => {
  h.fetch.mockReset()
  h.commit.mockReset()
  h.deleted.length = 0
})

describe('deleteExpiredReminderLogs', () => {
  it('scopes each read to its conference and isolates failures', async () => {
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1' }, { _id: 'c2' }, { _id: 'c3' }])
      .mockResolvedValueOnce(['a', 'b'])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['c'])
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await deleteExpiredReminderLogs()).toEqual({ deleted: 3 })
    expect(h.deleted).toEqual(['a', 'b', 'c'])
    expect(h.commit).toHaveBeenCalledTimes(2)
    const [query, params] = h.fetch.mock.calls[1]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('[0...200]')
    expect(params).toMatchObject({ conferenceId: 'c1' })
  })

  it('writes nothing on a dry run', async () => {
    h.fetch.mockResolvedValueOnce([{ _id: 'c1' }]).mockResolvedValueOnce(['a'])
    expect(await deleteExpiredReminderLogs(true)).toEqual({ deleted: 1 })
    expect(h.commit).not.toHaveBeenCalled()
  })
})
