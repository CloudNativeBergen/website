import { describe, expect, it } from 'vitest'
import type { RecipeEdits } from '@/lib/marketing/library'
import {
  anchorWords,
  hasBlankSkeleton,
  missingBuiltins,
  patchChannel,
  recipeSummary,
  toggleChannel,
  windowWords,
} from './recipe-model'

const edits: RecipeEdits = {
  title: 'Speaker card',
  channels: {
    linkedin: { skeleton: '{name} speaks at {event}', perWeek: 2 },
    bluesky: { skeleton: '{name} 🎙️', perWeek: 3 },
  },
  window: {
    from: { milestone: 'CFP_NOTIFY', offsetDays: 7 },
    to: { milestone: 'CONFERENCE_START', offsetDays: -7 },
  },
}

describe('a Recipe in words', () => {
  it('names the Milestone, and the offset only when there is one', () => {
    expect(anchorWords({ milestone: 'CFP_CLOSE', offsetDays: 0 })).toBe(
      'CFP closes',
    )
    expect(anchorWords({ milestone: 'CONFERENCE_START', offsetDays: -7 })).toBe(
      'Conference −7 d',
    )
    expect(anchorWords({ milestone: 'CFP_OPEN', offsetDays: 1 })).toBe(
      'CFP opens +1 d',
    )
  })
  it('summarises Channels, rates and the window in one line', () => {
    expect(recipeSummary(edits)).toBe(
      'LinkedIn 2/week · Bluesky 3/week · Speakers notified +7 d → Conference −7 d',
    )
  })
  it('leaves out the rate and the window a non-recurring Recipe has not got', () => {
    expect(
      recipeSummary({
        title: 'Sponsor thank-you card',
        channels: { bluesky: { skeleton: 'Thanks {name}' } },
      }),
    ).toBe('Bluesky')
  })
})

describe('the built-in Campaigns a plan can still be given', () => {
  it('offers every built-in the plan has no key for, described', () => {
    const offers = missingBuiltins(['cfp', 'earlyBird'])
    expect(offers.map((offer) => offer.key)).toEqual([
      'saveTheDate',
      'sponsorAcquisition',
      'keynotes',
      'speakers',
      'programme',
      'finalPush',
      'eventWeek',
      'postEvent',
    ])
    expect(offers.find((offer) => offer.key === 'keynotes')).toEqual({
      key: 'keynotes',
      title: 'Keynotes',
      optional: true,
      window: 'Speakers announced −28 d → Speakers announced',
      tasks: 3,
      recipes: ['Keynote speaker card'],
    })
  })
  it('offers nothing once the plan has every built-in key', () => {
    const all = missingBuiltins([]).map((offer) => offer.key)
    expect(all).toHaveLength(10)
    expect(missingBuiltins(all)).toEqual([])
  })
  it('ignores the hand-built Campaigns a plan also has', () => {
    expect(missingBuiltins(['custom-abc']).map((o) => o.key)).toContain('cfp')
  })
})

describe('edits ↔ form state', () => {
  it('brings the Library copy back when a Channel is switched on', () => {
    const off = toggleChannel(edits, 'linkedin', false, edits)
    expect(off.channels.linkedin).toBeUndefined()
    expect(off.channels.bluesky).toEqual(edits.channels.bluesky)
    const on = toggleChannel(off, 'linkedin', true, edits)
    expect(on.channels.linkedin).toEqual({
      skeleton: '{name} speaks at {event}',
      perWeek: 2,
    })
  })
  it('patches one Channel and leaves its sibling alone', () => {
    const next = patchChannel(edits, 'bluesky', { perWeek: 7 })
    expect(next.channels.bluesky).toEqual({ skeleton: '{name} 🎙️', perWeek: 7 })
    expect(next.channels.linkedin).toEqual(edits.channels.linkedin)
  })
  it('does not invent a Channel that is switched off', () => {
    const off = toggleChannel(edits, 'linkedin', false, edits)
    expect(patchChannel(off, 'linkedin', { skeleton: 'x' })).toBe(off)
  })
  it('spots a chosen Channel with nothing to post', () => {
    expect(hasBlankSkeleton(edits)).toBe(false)
    expect(
      hasBlankSkeleton(patchChannel(edits, 'linkedin', { skeleton: '   ' })),
    ).toBe(true)
  })
  it('reads a window as its two ends', () => {
    expect(windowWords(edits.window!)).toBe(
      'Speakers notified +7 d → Conference −7 d',
    )
  })
})
