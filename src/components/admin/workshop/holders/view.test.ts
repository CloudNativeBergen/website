/**
 * The page's view of `workshop.admin.ticketHolders` (#1333): never a number
 * for a read that did not give one, and a retry that is on its way is said.
 */
import { describe, expect, it } from 'vitest'
import { ticketHolderView } from './view'

const STATS = {
  available: true as const,
  configured: true,
  holders: 3,
  confirmed: 1,
  waitlistOnly: 1,
  notSignedUp: 1,
  flagged: [],
  lockedOut: [],
}

describe('ticketHolderView', () => {
  it('is loading until the first answer', () => {
    expect(ticketHolderView({ isError: false, isFetching: true })).toEqual({
      state: 'loading',
    })
  })

  it('is the numbers once they are read', () => {
    expect(
      ticketHolderView({ data: STATS, isError: false, isFetching: false }),
    ).toEqual({ state: 'ready', stats: STATS })
  })

  it.each([
    [
      'the tickets could not be read',
      { data: { available: false as const }, isError: false },
    ],
    ['the request failed', { isError: true }],
  ])(
    'is unavailable when %s, and says whether a retry is on its way',
    (_, query) => {
      expect(ticketHolderView({ ...query, isFetching: false })).toEqual({
        state: 'unavailable',
        retrying: false,
      })
      expect(ticketHolderView({ ...query, isFetching: true })).toEqual({
        state: 'unavailable',
        retrying: true,
      })
    },
  )
})
