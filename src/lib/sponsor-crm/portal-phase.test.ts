import { describe, expect, it } from 'vitest'
import { portalPhase } from './portal-phase'

const signed = { contractStatus: 'contract-signed' }
const conf = { startDate: '2026-10-15', endDate: '2026-10-16' }
// 12:00 UTC is the same calendar day in Oslo, summer or winter.
const at = (d: string) => new Date(`${d}T12:00:00Z`)

describe('portalPhase', () => {
  it('is none before signing', () => {
    expect(portalPhase({}, conf, at('2026-10-15'))).toBe('none')
    expect(
      portalPhase({ signatureStatus: 'pending' }, conf, at('2026-10-15')),
    ).toBe('none')
  })

  it('counts a signed signature status as signed', () => {
    expect(
      portalPhase({ signatureStatus: 'signed' }, conf, at('2026-01-01')),
    ).toBe('signed')
  })

  it('switches to event exactly 28 days before the start', () => {
    expect(portalPhase(signed, conf, at('2026-09-16'))).toBe('signed')
    expect(portalPhase(signed, conf, at('2026-09-17'))).toBe('event')
  })

  it('uses the Oslo day, not the UTC day', () => {
    // 22:30 UTC on 16 Sep is 00:30 on 17 Sep in Oslo.
    expect(portalPhase(signed, conf, new Date('2026-09-16T22:30:00Z'))).toBe(
      'event',
    )
    // 21:59 UTC on 16 Oct is 23:59 in Oslo, still the last day.
    expect(portalPhase(signed, conf, new Date('2026-10-16T21:59:00Z'))).toBe(
      'event',
    )
    // 22:30 UTC on 16 Oct is 00:30 on 17 Oct in Oslo: the event is over.
    expect(portalPhase(signed, conf, new Date('2026-10-16T22:30:00Z'))).toBe(
      'after',
    )
  })

  it('stays event through the last day, then after for 90 days', () => {
    expect(portalPhase(signed, conf, at('2026-10-16'))).toBe('event')
    expect(portalPhase(signed, conf, at('2026-10-17'))).toBe('after')
    expect(portalPhase(signed, conf, at('2027-01-14'))).toBe('after')
    expect(portalPhase(signed, conf, at('2027-01-15'))).toBe('none')
  })

  it('falls back to the start date without an end date', () => {
    expect(
      portalPhase(signed, { startDate: '2026-10-15' }, at('2026-10-16')),
    ).toBe('after')
  })

  it('is signed when the conference has no dates', () => {
    expect(portalPhase(signed, {}, at('2026-10-16'))).toBe('signed')
  })
})
