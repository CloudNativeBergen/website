import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  canAcceptProposals,
  hasSubmittableFormats,
  hasSubmittableTopics,
  isCfpOpen,
} from './state'
import type { Conference } from './types'
import { Format } from '@/lib/proposal/types'
import { STARTER_SESSION_FORMATS } from '@/lib/onboarding/create'

/** A minimal topic reference, as the `{ topics: true }` join resolves them. */
const TOPIC = { _id: 'topic-1', title: 'Platform engineering' } as never

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
    // No cast: the parameter type admits an absent `formats`, which is the
    // whole reason the predicate exists.
    expect(hasSubmittableFormats({})).toBe(false)
  })

  it('is false for a non-array value from a legacy document', () => {
    expect(
      hasSubmittableFormats({
        formats: 'lightning_10',
      } as unknown as Conference),
    ).toBe(false)
  })

  it('is true once a single format is configured', () => {
    expect(
      hasSubmittableFormats(conference({ formats: [Format.lightning_10] })),
    ).toBe(true)
  })
})

describe('hasSubmittableTopics', () => {
  it('is false for empty, absent and non-array topic lists', () => {
    expect(hasSubmittableTopics(conference({ topics: [] }))).toBe(false)
    expect(hasSubmittableTopics({})).toBe(false)
    expect(
      hasSubmittableTopics({ topics: 'kubernetes' } as unknown as Conference),
    ).toBe(false)
  })

  it('is true once a single topic is configured', () => {
    expect(hasSubmittableTopics(conference({ topics: [TOPIC] }))).toBe(true)
  })
})

describe('canAcceptProposals', () => {
  it('needs BOTH halves — a format and a topic', () => {
    const formatsOnly = conference({
      formats: [...STARTER_SESSION_FORMATS],
      topics: [],
    })
    const topicsOnly = conference({ formats: [], topics: [TOPIC] })

    expect(canAcceptProposals(formatsOnly)).toBe(false)
    expect(canAcceptProposals(topicsOnly)).toBe(false)
    expect(
      canAcceptProposals(
        conference({ formats: [...STARTER_SESSION_FORMATS], topics: [TOPIC] }),
      ),
    ).toBe(true)
  })

  it('rejects a freshly provisioned conference — starter formats are not enough', () => {
    // THE DAY-ONE TRUTH. Provisioning seeds formats but deliberately no topics,
    // and strict submit validation requires at least one topic. A CTA on that
    // conference would lead to a form with an unsatisfiable required field.
    expect(canAcceptProposals({ formats: [...STARTER_SESSION_FORMATS] })).toBe(
      false,
    )
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
