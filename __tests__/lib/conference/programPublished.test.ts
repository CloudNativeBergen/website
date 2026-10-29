import { describe, expect, it } from 'vitest'
import { isProgramPublished } from '@/lib/conference/state'

// The programme goes public at 00:00 Oslo time on `programDate`.
describe('isProgramPublished at Oslo midnight', () => {
  const at = (programDate: string, iso: string) =>
    isProgramPublished({ programDate }, new Date(iso))

  it('flips at 00:00 Oslo in summer (UTC+2)', () => {
    expect(at('2026-05-01', '2026-04-30T21:59:59Z')).toBe(false)
    expect(at('2026-05-01', '2026-04-30T22:00:00Z')).toBe(true)
  })

  it('flips at 00:00 Oslo in winter (UTC+1)', () => {
    expect(at('2026-01-15', '2026-01-14T22:59:59Z')).toBe(false)
    expect(at('2026-01-15', '2026-01-14T23:00:00Z')).toBe(true)
  })

  it('is false for a missing date', () => {
    expect(at('', '2026-05-01T12:00:00Z')).toBe(false)
  })

  it('is false for an invalid clock instead of throwing', () => {
    expect(at('2026-05-01', 'not a date')).toBe(false)
  })
})
