import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/lib/notification/format'

const NOW = new Date('2026-07-09T12:00:00.000Z')
const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

describe('formatRelativeTime', () => {
  it('renders "just now" for sub-minute deltas', () => {
    expect(formatRelativeTime(at(0), NOW)).toBe('just now')
    expect(formatRelativeTime(at(59 * SEC), NOW)).toBe('just now')
  })

  it('renders minutes', () => {
    expect(formatRelativeTime(at(MIN), NOW)).toBe('1m ago')
    expect(formatRelativeTime(at(5 * MIN), NOW)).toBe('5m ago')
    expect(formatRelativeTime(at(59 * MIN), NOW)).toBe('59m ago')
  })

  it('renders hours', () => {
    expect(formatRelativeTime(at(HOUR), NOW)).toBe('1h ago')
    expect(formatRelativeTime(at(23 * HOUR), NOW)).toBe('23h ago')
  })

  it('renders days', () => {
    expect(formatRelativeTime(at(DAY), NOW)).toBe('1d ago')
    expect(formatRelativeTime(at(6 * DAY), NOW)).toBe('6d ago')
  })

  it('renders weeks', () => {
    expect(formatRelativeTime(at(WEEK), NOW)).toBe('1w ago')
    expect(formatRelativeTime(at(4 * WEEK), NOW)).toBe('4w ago')
  })

  it('treats future timestamps as "just now"', () => {
    expect(formatRelativeTime(at(-5 * MIN), NOW)).toBe('just now')
  })

  it('returns empty string for invalid input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})
