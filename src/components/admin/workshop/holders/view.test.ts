/**
 * The page's view of `workshop.admin.ticketHolders` (#1333): never a number
 * for a read that did not give one, never another conference's answer, and a
 * retry that is on its way is said.
 */
import { describe, expect, it } from 'vitest'
import { ticketHolderView } from './view'

const CONF = 'conf-1'
const STATS = {
  conferenceId: CONF,
  available: true as const,
  configured: true,
  holders: 3,
  confirmed: 1,
  waitlistOnly: 1,
  notSignedUp: 1,
  flagged: [],
  lockedOut: [],
}
const UNAVAILABLE = { conferenceId: CONF, available: false as const }

describe('ticketHolderView', () => {
  it('is loading until the first answer', () => {
    expect(
      ticketHolderView({ isError: false, isFetching: true }, CONF),
    ).toEqual({ state: 'loading' })
  })

  it('is the numbers once they are read', () => {
    expect(
      ticketHolderView(
        { data: STATS, isError: false, isFetching: false },
        CONF,
      ),
    ).toEqual({ state: 'ready', stats: STATS })
  })

  // TENANCY: an answer read for another conference is never shown, whatever
  // it says. While a read is on its way it is loading; once the server has
  // answered for another conference again, it is unavailable, not loading
  // for ever.
  it.each([
    ['numbers', STATS],
    ['unavailable answer', UNAVAILABLE],
  ])('never shows another conference’s %s', (_, data) => {
    expect(
      ticketHolderView({ data, isError: false, isFetching: true }, 'conf-2'),
    ).toEqual({ state: 'loading' })
    expect(
      ticketHolderView({ data, isError: false, isFetching: false }, 'conf-2'),
    ).toEqual({ state: 'unavailable', retrying: false })
  })

  it.each([
    ['the tickets could not be read', { data: UNAVAILABLE, isError: false }],
    ['the request failed', { isError: true }],
  ])(
    'is unavailable when %s, and says whether a retry is on its way',
    (_, query) => {
      expect(ticketHolderView({ ...query, isFetching: false }, CONF)).toEqual({
        state: 'unavailable',
        retrying: false,
      })
      expect(ticketHolderView({ ...query, isFetching: true }, CONF)).toEqual({
        state: 'unavailable',
        retrying: true,
      })
    },
  )
})
