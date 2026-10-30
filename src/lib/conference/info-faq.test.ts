import { describe, expect, it } from 'vitest'
import { getScheduleDayInfo } from './info-faq'
import type { ConferenceSchedule } from './types'

const day = (date: string, trackTitle: string) =>
  ({
    date,
    tracks: [{ trackTitle, talks: [{ startTime: '08:00', endTime: '09:00' }] }],
  }) as unknown as ConferenceSchedule

describe('getScheduleDayInfo workshop day', () => {
  it('is day 1 when its tracks are workshops', () => {
    const info = getScheduleDayInfo([
      day('2026-10-26', 'Workshop A'),
      day('2026-10-27', 'Main stage'),
    ])
    expect(info.workshopDay?.date).toBe('2026-10-26')
  })

  it('is absent when a multi-day conference has no workshops', () => {
    const info = getScheduleDayInfo([
      day('2026-10-26', 'Main stage'),
      day('2026-10-27', 'Main stage'),
    ])
    expect(info.workshopDay).toBeNull()
  })
})
