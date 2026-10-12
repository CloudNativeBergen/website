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
  /** How many times after-response work was scheduled. */
  scheduled: 0,
}))
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: () => {
    h.scheduled += 1
  },
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

import { workshopAccessOf } from '@/lib/tickets/classification'
import { notSetTicketTypes, reportNotSetTicketTypes } from './not-set-notice'

const MARKED = [{ typeName: 'Workshop day', grantsWorkshop: true }]

beforeEach(() => {
  h.rule = null
  h.scheduled = 0
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

    // Whatever the rule answers for such an entry is what this follows:
    // `denied` before #1332, `unclassified` once it has landed.
    expect(notSetTicketTypes(['Crew'], roles)).toEqual(
      workshopAccessOf('Crew', roles) === 'unclassified' ? ['Crew'] : [],
    )

    // And the dependency itself, with the rule's answer swapped each way.
    h.rule = (name) => (name === 'Crew' ? 'denied' : 'granted')
    expect(notSetTicketTypes(['Crew'], roles)).toEqual([])
    h.rule = (name) => (name === 'Crew' ? 'unclassified' : 'granted')
    expect(notSetTicketTypes(['Crew'], roles)).toEqual(['Crew'])
  })
})

describe('reportNotSetTicketTypes', () => {
  it('returns, and says so in the log, when deciding throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // A type name that is not a string, as a malformed provider payload cast
    // through the types would deliver it: the rule's own `typeKey` throws.
    expect(() =>
      reportNotSetTicketTypes({
        conferenceId: 'conf-a',
        typeNames: [42 as unknown as string],
        ticketTypeRoles: MARKED,
        source: 'ticket-sold',
      }),
    ).not.toThrow()

    expect(console.error).toHaveBeenCalledWith(
      'workshop.ticket-type.not-set: could not be raised',
      expect.any(TypeError),
    )
  })

  it('keeps one memo for the process, whichever copy of the module raises', async () => {
    // Next builds pages and route handlers into separate bundles, each with
    // its own copy of this module. Two copies stand for the two bundles.
    const raise = (
      copy: { reportNotSetTicketTypes: typeof reportNotSetTicketTypes },
      typeName: string,
    ) =>
      copy.reportNotSetTicketTypes({
        conferenceId: 'conf-memo',
        typeNames: [typeName],
        ticketTypeRoles: MARKED,
        source: 'portal-refusal',
      })
    const page = await import('./not-set-notice')
    vi.resetModules()
    const route = await import('./not-set-notice')
    expect(route.reportNotSetTicketTypes).not.toBe(page.reportNotSetTicketTypes)

    raise(page, 'Early Bird')
    expect(h.scheduled).toBe(1)
    raise(route, 'Early Bird')
    expect(h.scheduled).toBe(1)

    raise(route, 'Late Bird')
    expect(h.scheduled).toBe(2)
    raise(page, 'Late Bird')
    expect(h.scheduled).toBe(2)
  })
})
