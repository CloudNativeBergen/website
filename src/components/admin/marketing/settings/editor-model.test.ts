import { describe, expect, it } from 'vitest'
import { emptyCampaign, needsMeasurementWarning } from './editor-model'
describe('measurement window warning', () => {
  it('warns for the previous or new strict-window metric only when the window changes', () => {
    const previous = {
      ...emptyCampaign,
      primaryOutcome: 'cfpSubmissions' as const,
    }
    const moved = {
      ...emptyCampaign,
      window: { ...emptyCampaign.window, startOffsetDays: -40 },
    }
    expect(needsMeasurementWarning(previous, moved)).toBe(true)
    expect(
      needsMeasurementWarning(emptyCampaign, {
        ...moved,
        primaryOutcome: 'ticketsSoldInWindow',
      }),
    ).toBe(true)
    expect(
      needsMeasurementWarning(previous, { ...previous, title: 'Renamed' }),
    ).toBe(false)
    expect(needsMeasurementWarning(emptyCampaign, moved)).toBe(false)
  })
})
