import { describe, expect, it } from 'vitest'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import {
  anchoredSlot,
  clampOffset,
  describeAnchor,
  initialAnchor,
  suggestAnchor,
} from './when-model'

const milestones = resolveAllMilestones({
  startDate: '2027-05-01',
  endDate: '2027-05-02',
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
})

describe('anchoredSlot', () => {
  it('resolves the day and takes the Channel slot for a publishing Task', () => {
    expect(
      anchoredSlot(
        { milestone: 'CFP_CLOSE', offsetDays: -3 },
        milestones,
        'publishing',
        'bluesky',
      ),
    ).toEqual({ date: '2027-01-29', time: '18:00', provisional: false })
  })
  it('takes the work slot for every other Kind and reports a fallback date', () => {
    expect(
      anchoredSlot(
        { milestone: 'EARLY_BIRD_END', offsetDays: 0 },
        milestones,
        'checklist',
        'bluesky',
      ),
    ).toEqual({ date: '2027-04-01', time: '09:00', provisional: true })
  })
})

describe('suggestAnchor', () => {
  it('suggests the nearest set Milestone for the Oslo day typed', () => {
    expect(suggestAnchor('2027-02-04T23:30', milestones)).toEqual({
      milestone: 'CFP_CLOSE',
      offsetDays: 3,
    })
  })
  it('suggests nothing for an empty or partial date', () => {
    expect(suggestAnchor('', milestones)).toBeNull()
    expect(suggestAnchor('2027-02', milestones)).toBeNull()
  })
  it('suggests nothing beyond the offset the server accepts', () => {
    expect(suggestAnchor('2029-01-01T10:00', milestones)).toBeNull()
  })
})

describe('initialAnchor', () => {
  it('starts tomorrow, on the nearest Milestone', () => {
    expect(initialAnchor('2027-01-20', milestones)).toEqual({
      milestone: 'CFP_CLOSE',
      offsetDays: -11,
    })
  })
  it('falls back to the conference when nothing is within reach', () => {
    expect(initialAnchor('2030-01-20', milestones)).toEqual({
      milestone: 'CONFERENCE_START',
      offsetDays: 0,
    })
  })
})

describe('clampOffset', () => {
  it.each([
    [900000000, 365],
    [-400, -365],
    [1.9, 1],
    [-14, -14],
  ])('%d → %d', (typed, sent) => expect(clampOffset(typed)).toBe(sent))
})

describe('describeAnchor', () => {
  it.each([
    [-3, '3 days before CFP closes'],
    [-1, '1 day before CFP closes'],
    [0, 'the day of CFP closes'],
    [2, '2 days after CFP closes'],
  ])('%i → %s', (offsetDays, text) => {
    expect(describeAnchor({ milestone: 'CFP_CLOSE', offsetDays })).toBe(text)
  })
})
