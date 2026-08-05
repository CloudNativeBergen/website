import { describe, it, expect, vi, afterEach } from 'vitest'
import { hasSubmittableFormats, isCfpOpen } from './state'
import type { Conference } from './types'
import { Format } from '@/lib/proposal/types'

/** An open CFP window around the frozen "now" used below. */
const OPEN_WINDOW = {
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-06-01',
}

function conference(overrides: Partial<Conference> = {}): Conference {
  return { _id: 'conf-1', ...OPEN_WINDOW, ...overrides } as Conference
}

afterEach(() => {
  vi.useRealTimers()
})

function freezeInsideWindow() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
}

describe('hasSubmittableFormats', () => {
  it('is false for a conference that configured no formats', () => {
    expect(hasSubmittableFormats(conference({ formats: [] }))).toBe(false)
  })

  it('is false when the field is absent entirely (a fresh tenant)', () => {
    expect(hasSubmittableFormats({} as Conference)).toBe(false)
  })

  it('is true once a single format is configured', () => {
    expect(
      hasSubmittableFormats(conference({ formats: [Format.lightning_10] })),
    ).toBe(true)
  })
})

describe('the CFP-open / can-submit split', () => {
  it('an open window with no formats is open but unsubmittable', () => {
    freezeInsideWindow()
    const conf = conference({ formats: [] })

    // The window really is open — this is the trap the predicate exists for:
    // an "open" CFP that cannot accept a submission, because a proposal must
    // carry a format. Surfaces that INVITE a new submission must test both.
    expect(isCfpOpen(conf)).toBe(true)
    expect(hasSubmittableFormats(conf)).toBe(false)
  })

  it('does NOT widen isCfpOpen itself', () => {
    freezeInsideWindow()
    // The homepage lifecycle stage, the admin phase summary and the
    // edit/unsubmit gates all read `isCfpOpen`; widening it would silently
    // change all of them. It stays purely date-based.
    expect(isCfpOpen(conference({ formats: [] }))).toBe(true)
    expect(isCfpOpen(conference({}))).toBe(true)
  })

  it('a closed window is closed regardless of formats', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    const conf = conference({ formats: [Format.lightning_10] })
    expect(isCfpOpen(conf)).toBe(false)
    expect(hasSubmittableFormats(conf)).toBe(true)
  })
})
