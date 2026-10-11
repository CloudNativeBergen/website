/**
 * @vitest-environment node
 *
 * The pure half of the not-set notice (#1335): which ticket types count as
 * not set, and what one notification says and is called. The writes, the
 * recipient set and the read count are proven at the two call sites
 * (`eligibility.not-set.test.ts`, `checkin-ticket-sold.not-set.test.ts`).
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

import {
  notSetTicketTypes,
  ticketTypeNotSetNotifications,
} from './not-set-notice'

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

describe('ticketTypeNotSetNotifications', () => {
  const build = (
    over: Partial<Parameters<typeof ticketTypeNotSetNotifications>[0]> = {},
  ) =>
    ticketTypeNotSetNotifications({
      conferenceId: 'conf-a',
      typeName: 'Early Bird',
      organizerIds: ['org-1', 'org-2'],
      ...over,
    })

  it('writes one notification per organizer, naming the type and linking to the workshops page', () => {
    expect(build()).toEqual([
      {
        id: expect.any(String),
        recipientId: 'org-1',
        conferenceId: 'conf-a',
        notificationType: 'workshop_ticket_type_not_set',
        title: '“Early Bird” needs a workshop decision',
        message:
          'Choose whether this ticket type grants workshop access. Until then its holders can’t sign up.',
        link: '/admin/workshops',
      },
      {
        id: expect.any(String),
        recipientId: 'org-2',
        conferenceId: 'conf-a',
        notificationType: 'workshop_ticket_type_not_set',
        title: '“Early Bird” needs a workshop decision',
        message:
          'Choose whether this ticket type grants workshop access. Until then its holders can’t sign up.',
        link: '/admin/workshops',
      },
    ])
  })

  it('gives the same organizer the same document id for the same type, in either spelling', () => {
    const [first] = build()
    const [again] = build({ typeName: '  EARLY bird' })

    expect(again.id).toBe(first.id)
  })

  it('gives a different id per type, per conference and per organizer', () => {
    const ids = [
      ...build(),
      ...build({ typeName: 'Late Bird' }),
      ...build({ conferenceId: 'conf-b' }),
    ].map((item) => item.id)

    expect(new Set(ids).size).toBe(6)
  })

  it('does not let two different triples share an id by moving a separator', () => {
    const [a] = build({ conferenceId: 'conf.a', typeName: 'b' })
    const [b] = build({ conferenceId: 'conf', typeName: 'a.b' })

    expect(a.id).not.toBe(b.id)
  })

  it('produces an id Sanity accepts, whatever the type is called', () => {
    const [item] = build({
      typeName: 'Workshop + Conference (2 days) / “æøå” 🎟️'.repeat(20),
      organizerIds: ['o'.repeat(120)],
    })

    // Sanity ids: a-z, A-Z, 0-9, `.`, `_`, `-`, at most 128 characters.
    expect(item.id).toMatch(/^[A-Za-z0-9._-]{1,128}$/)
  })

  it('keeps a very long type name inside the stored title limit', () => {
    const [item] = build({ typeName: 'x'.repeat(400) })

    // `notification.title` is `Rule.max(200)` in the schema.
    expect(item.title.length).toBeLessThanOrEqual(200)
    expect(item.title).toBe(`“${'x'.repeat(171)}…” needs a workshop decision`)
  })

  it('drops a duplicated or empty organizer id', () => {
    expect(
      build({ organizerIds: ['org-1', '', 'org-1'] }).map(
        (item) => item.recipientId,
      ),
    ).toEqual(['org-1'])
  })
})
