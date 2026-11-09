import { describe, expect, it } from 'vitest'
import { isSelfWithdrawInThread } from './proposal-copy'

describe('isSelfWithdrawInThread (the Slack skip rule)', () => {
  const self = {
    action: 'withdraw',
    isOrganizer: false,
    postedToThread: true,
    ticketCancellation: { speakers: [], unfiltered: false },
  }
  it('skips a speaker withdrawal whose reason already went out as a thread message', () => {
    expect(isSelfWithdrawInThread(self)).toBe(true)
  })
  it.each([
    ['another action', { action: 'cancel' }],
    ['an organizer', { isOrganizer: true }],
    ['no thread message (every cfp withdrawal)', { postedToThread: false }],
    [
      'tickets to cancel by hand',
      {
        ticketCancellation: {
          speakers: [{ name: 'Ada' }],
          unfiltered: false,
        },
      },
    ],
  ])('alerts for %s', (_, over) => {
    expect(isSelfWithdrawInThread({ ...self, ...over })).toBe(false)
  })
})
