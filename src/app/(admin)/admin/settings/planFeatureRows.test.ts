import { describe, it, expect } from 'vitest'
import { applyWorkshopGate, WORKSHOPS_INACTIVE_REASON } from './planFeatureRows'
import type { PlanFeatureRow } from './PlanFeaturesCard'

const workshops: PlanFeatureRow = {
  id: 'workshops',
  title: 'Workshop portal',
  description: 'd',
  readiness: 'ga',
  viaOverride: false,
}
const ticketing: PlanFeatureRow = {
  id: 'ticketing',
  title: 'Ticketing integration',
  description: 'd',
  readiness: 'ga',
  viaOverride: false,
}

describe('applyWorkshopGate (#1295)', () => {
  it('keeps a plan-listed workshops row but marks it INACTIVE when the resolver says off', () => {
    const rows = applyWorkshopGate([ticketing, workshops], false)
    expect(rows.map((r) => r.id)).toEqual(['ticketing', 'workshops'])
    expect(rows[1].inactiveReason).toBe(WORKSHOPS_INACTIVE_REASON)
    expect(rows[0].inactiveReason).toBeUndefined()
  })

  it('leaves the row untouched when the resolver says on', () => {
    expect(applyWorkshopGate([ticketing, workshops], true)).toEqual([
      ticketing,
      workshops,
    ])
  })

  it('never adds a row — a list without workshops stays without it', () => {
    expect(applyWorkshopGate([ticketing], true)).toEqual([ticketing])
    expect(applyWorkshopGate([ticketing], false)).toEqual([ticketing])
  })
})
