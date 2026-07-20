import { describe, it, expect } from 'vitest'
import { shouldSendReminder, reminderLogId, dayOfLogId } from '../marker'
import type { Reminder } from '../types'

const rearming: Reminder = {
  key: 'confirm-talk',
  notificationType: 'proposal_status_changed',
  maxSends: 2,
  spacingDays: 7,
  evaluate: () => null,
}

const NOW = new Date('2026-08-20T06:00:00Z')

describe('shouldSendReminder — cap + spacing gate', () => {
  it('sends when no marker exists', () => {
    expect(shouldSendReminder(undefined, rearming, NOW)).toBe(true)
  })
  it('does not send once the cap is reached', () => {
    expect(
      shouldSendReminder(
        { _id: 'x', count: 2, lastSentAt: '2026-01-01T00:00:00Z' },
        rearming,
        NOW,
      ),
    ).toBe(false)
  })
  it('does not send inside the spacing window', () => {
    // Sent 2 days ago, spacing is 7 days.
    expect(
      shouldSendReminder(
        { _id: 'x', count: 1, lastSentAt: '2026-08-18T06:00:00Z' },
        rearming,
        NOW,
      ),
    ).toBe(false)
  })
  it('sends again once spacing has elapsed and cap not reached', () => {
    // Sent 10 days ago, count 1 < 2.
    expect(
      shouldSendReminder(
        { _id: 'x', count: 1, lastSentAt: '2026-08-10T06:00:00Z' },
        rearming,
        NOW,
      ),
    ).toBe(true)
  })
})

describe('deterministic marker ids', () => {
  it('composes a stable recurring-reminder id', () => {
    expect(reminderLogId('confirm-talk', 'conf-1', 's1')).toBe(
      'reminder.confirm-talk.conf-1.s1',
    )
  })
  it('composes a day-scoped day-of id', () => {
    expect(dayOfLogId('conf-1', 's1', '2026-09-10')).toBe(
      'reminder.day-of.conf-1.s1.2026-09-10',
    )
  })
})
