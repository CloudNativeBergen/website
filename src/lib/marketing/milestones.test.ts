import { describe, it, expect } from 'vitest'
import {
  MILESTONES,
  resolveMilestone,
  resolveAllMilestones,
  type MilestoneSource,
} from './milestones'

const base: MilestoneSource = {
  cfpStartDate: '2026-01-10',
  cfpEndDate: '2026-05-01',
  cfpNotifyDate: '2026-06-15',
  programDate: '2026-07-01',
  startDate: '2026-10-15',
  endDate: '2026-10-16',
}

describe('resolveMilestone — required fields', () => {
  it.each([
    ['CFP_OPEN', '2026-01-10'],
    ['CFP_CLOSE', '2026-05-01'],
    ['CFP_NOTIFY', '2026-06-15'],
    ['PROGRAM_PUBLISHED', '2026-07-01'],
    ['CONFERENCE_START', '2026-10-15'],
    ['CONFERENCE_END', '2026-10-16'],
  ] as const)('%s reads its field and is never provisional', (m, date) => {
    expect(resolveMilestone(m, base)).toEqual({ date, provisional: false })
  })

  it('throws when a required field is missing', () => {
    expect(() =>
      resolveMilestone('CFP_OPEN', { ...base, cfpStartDate: undefined }),
    ).toThrow(/cfpStartDate/)
    expect(() =>
      resolveMilestone('CONFERENCE_START', { ...base, startDate: '' }),
    ).toThrow(/startDate/)
  })

  it('throws on a malformed date', () => {
    expect(() =>
      resolveMilestone('CFP_OPEN', { ...base, cfpStartDate: '2026-1-1' }),
    ).toThrow(/cfpStartDate/)
  })
})

describe('resolveMilestone — set optional fields', () => {
  it.each([
    ['EARLY_BIRD_END', 'earlyBirdEndDate'],
    ['REGISTRATION_CLOSE', 'registrationCloseDate'],
    ['SPEAKERS_ANNOUNCED', 'speakersAnnouncedDate'],
    ['SPONSOR_DEADLINE', 'sponsorDeadlineDate'],
    ['RECORDINGS_LIVE', 'recordingsLiveDate'],
  ] as const)('%s returns the set field without the flag', (m, field) => {
    expect(resolveMilestone(m, { ...base, [field]: '2026-03-03' })).toEqual({
      date: '2026-03-03',
      provisional: false,
    })
  })

  it('TICKETS_OPEN reads ticketTargets.salesStartDate when tracking is enabled', () => {
    expect(
      resolveMilestone('TICKETS_OPEN', {
        ...base,
        ticketTargets: { enabled: true, salesStartDate: '2026-06-01' },
      }),
    ).toEqual({ date: '2026-06-01', provisional: false })
  })
})

describe('resolveMilestone — fallbacks flag provisional', () => {
  it('TICKETS_OPEN → CONFERENCE_START − 12 weeks', () => {
    expect(resolveMilestone('TICKETS_OPEN', base)).toEqual({
      date: '2026-07-23',
      provisional: true,
    })
  })

  it('TICKETS_OPEN ignores salesStartDate when tracking is disabled', () => {
    expect(
      resolveMilestone('TICKETS_OPEN', {
        ...base,
        ticketTargets: { enabled: false, salesStartDate: '2026-06-01' },
      }),
    ).toEqual({ date: '2026-07-23', provisional: true })
  })

  it('TICKETS_OPEN falls back when tracking is enabled but the date is blank', () => {
    expect(
      resolveMilestone('TICKETS_OPEN', {
        ...base,
        ticketTargets: { enabled: true, salesStartDate: '' },
      }),
    ).toEqual({ date: '2026-07-23', provisional: true })
  })

  it('EARLY_BIRD_END → PROGRAM_PUBLISHED', () => {
    expect(resolveMilestone('EARLY_BIRD_END', base)).toEqual({
      date: '2026-07-01',
      provisional: true,
    })
  })

  it('REGISTRATION_CLOSE → CONFERENCE_START − 1 week', () => {
    expect(resolveMilestone('REGISTRATION_CLOSE', base)).toEqual({
      date: '2026-10-08',
      provisional: true,
    })
  })

  it('SPEAKERS_ANNOUNCED → CFP_NOTIFY + 1 week', () => {
    expect(resolveMilestone('SPEAKERS_ANNOUNCED', base)).toEqual({
      date: '2026-06-22',
      provisional: true,
    })
  })

  it('SPONSOR_DEADLINE → CONFERENCE_START − 6 weeks', () => {
    expect(resolveMilestone('SPONSOR_DEADLINE', base)).toEqual({
      date: '2026-09-03',
      provisional: true,
    })
  })

  it('RECORDINGS_LIVE → CONFERENCE_END + 2 weeks', () => {
    expect(resolveMilestone('RECORDINGS_LIVE', base)).toEqual({
      date: '2026-10-30',
      provisional: true,
    })
  })

  it('treats null and empty string as unset', () => {
    expect(
      resolveMilestone('EARLY_BIRD_END', { ...base, earlyBirdEndDate: null }),
    ).toEqual({ date: '2026-07-01', provisional: true })
    expect(
      resolveMilestone('EARLY_BIRD_END', { ...base, earlyBirdEndDate: '' }),
    ).toEqual({ date: '2026-07-01', provisional: true })
  })

  it('a fallback that crosses a year boundary stays a calendar date', () => {
    expect(
      resolveMilestone('RECORDINGS_LIVE', { ...base, endDate: '2026-12-25' }),
    ).toEqual({ date: '2027-01-08', provisional: true })
  })

  it('a fallback whose anchor is missing throws on the anchor field', () => {
    expect(() =>
      resolveMilestone('RECORDINGS_LIVE', { ...base, endDate: undefined }),
    ).toThrow(/endDate/)
  })
})

describe('resolveAllMilestones', () => {
  it('resolves every Milestone in the enum', () => {
    const all = resolveAllMilestones(base)
    expect(Object.keys(all).sort()).toEqual([...MILESTONES].sort())
    expect(all.CFP_OPEN).toEqual({ date: '2026-01-10', provisional: false })
    expect(all.SPONSOR_DEADLINE).toEqual({
      date: '2026-09-03',
      provisional: true,
    })
  })
})
