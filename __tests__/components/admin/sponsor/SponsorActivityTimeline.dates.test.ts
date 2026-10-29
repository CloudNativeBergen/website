import {
  getDateKey,
  getDateLabel,
} from '@/components/admin/sponsor/SponsorActivityTimeline'

describe('SponsorActivityTimeline day grouping', () => {
  it('groups by the Oslo day, not the UTC day', () => {
    // 23:30 UTC on 9 Feb is 00:30 on 10 Feb in Oslo.
    expect(getDateKey('2026-02-09T23:30:00Z')).toBe('2026-02-10')
  })

  it('labels today and yesterday by the Oslo day', () => {
    const now = new Date('2026-02-10T08:00:00Z')
    expect(getDateLabel('2026-02-09T23:30:00Z', now)).toBe('Today')
    expect(getDateLabel('2026-02-09T12:00:00Z', now)).toBe('Yesterday')
    expect(getDateLabel('2026-02-06T12:00:00Z', now)).toBe('Friday, February 6')
  })
})
