/**
 * @vitest-environment node
 *
 * Which ticket types count as not set (#1335). What is written, to whom and
 * at what cost is proven at the two call sites (`eligibility.not-set.test.ts`,
 * `checkin-ticket-sold.not-set.test.ts`) and on the handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The rule runs FOR REAL by default. One case swaps its answer to the one
// #1332 introduces, to show this module follows the rule instead of
// re-deriving it.
const h = vi.hoisted(() => ({
  rule: null as null | ((name: unknown, roles: unknown) => string),
}))
vi.mock('@/lib/tickets/classification', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/tickets/classification')>()
  return {
    ...actual,
    workshopAccessOf: (...args: Parameters<typeof actual.workshopAccessOf>) =>
      h.rule ? h.rule(...args) : actual.workshopAccessOf(...args),
  }
})

import { notSetTicketTypes } from './not-set-notice'

const MARKED = [{ typeName: 'Workshop day', grantsWorkshop: true }]

beforeEach(() => {
  h.rule = null
})

describe('notSetTicketTypes', () => {
  it('names a type with no entry on a conference that has marked one', () => {
    expect(notSetTicketTypes(['Early Bird'], MARKED)).toEqual(['Early Bird'])
  })

  it('names nothing for a type that grants access or one that was answered no', () => {
    const roles = [...MARKED, { typeName: 'Student', grantsWorkshop: false }]

    expect(notSetTicketTypes(['Workshop day', 'Student'], roles)).toEqual([])
  })

  it('names nothing on a conference that has marked no type, whatever is sold', () => {
    expect(notSetTicketTypes(['Early Bird'], [])).toEqual([])
    expect(notSetTicketTypes(['Early Bird'], null)).toEqual([])
    // Entries that only say no leave the built-in list in force (§1).
    expect(
      notSetTicketTypes(
        ['Early Bird'],
        [{ typeName: 'Student', grantsWorkshop: false }],
      ),
    ).toEqual([])
  })

  it('names a type once however many tickets of it there are, in either spelling', () => {
    expect(
      notSetTicketTypes(['Early Bird', ' early bird ', 'Late Bird'], MARKED),
    ).toEqual(['Early Bird', 'Late Bird'])
  })

  it('skips a ticket whose type the provider did not name', () => {
    expect(notSetTicketTypes([null, undefined, '  '], MARKED)).toEqual([])
  })

  it('follows the rule for an entry that carries only the seating answer', () => {
    const roles = [...MARKED, { typeName: 'Crew', admits: true }]

    // Today the rule answers `denied` for it, so it is not a not-set type.
    expect(notSetTicketTypes(['Crew'], roles)).toEqual([])

    // After #1332 the rule answers `unclassified`, and this follows.
    h.rule = (name) => (name === 'Crew' ? 'unclassified' : 'granted')
    expect(notSetTicketTypes(['Crew'], roles)).toEqual(['Crew'])
  })
})
