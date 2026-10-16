/**
 * THE JOIN (#1333, spec §2 and §4): ticket holders joined to sign-ups.
 *
 * Every expected number below is counted by hand from the fixture it sits
 * beside, never recomputed the way the join computes it.
 */
import { describe, expect, it } from 'vitest'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'
import type { TicketTypeRole } from '@/lib/tickets/classification'
import { joinTicketHolders, type HolderSignup } from './holders'

const WORKSHOP = 'Workshop pass'
const CONFERENCE = 'Conference only'
const SPEAKER = 'Speaker ticket'
const VOLUNTEER = 'Volunteer'

/** Configured: workshop pass and speaker grant, conference does not, volunteer not set. */
const ROLES: TicketTypeRole[] = [
  { typeName: WORKSHOP, grantsWorkshop: true },
  { typeName: SPEAKER, grantsWorkshop: true },
  { typeName: CONFERENCE, grantsWorkshop: false },
]

let nextId = 1
function ticket(registeredEmail: string, category: string): TicketCandidate {
  const id = nextId++
  return {
    ticketId: id,
    orderId: id,
    name: `Holder ${id}`,
    email: registeredEmail.trim().toLowerCase(),
    registeredEmail,
    category,
  }
}

function signup(
  userEmail: string,
  status: 'confirmed' | 'waitlist',
  workshop = 'k8s',
): HolderSignup {
  const id = `signup-${nextId++}`
  return {
    _id: id,
    userEmail,
    userName: `Signed up ${id}`,
    status,
    workshop: { _id: workshop, title: `Workshop ${workshop}` },
  }
}

describe('the five numbers', () => {
  it('counts each group on its value, and the holder groups add up', () => {
    const tickets = [
      ticket('ada@x.test', WORKSHOP), // confirmed
      ticket('bob@x.test', WORKSHOP), // waitlist only
      ticket('cy@x.test', SPEAKER), // not signed up
      ticket('dee@x.test', WORKSHOP), // not signed up
      ticket('eve@x.test', CONFERENCE), // signs up anyway: flagged
    ]
    const signups = [
      signup('ada@x.test', 'confirmed'),
      signup('bob@x.test', 'waitlist'),
      signup('eve@x.test', 'confirmed'),
      signup('nobody@x.test', 'waitlist'), // no ticket at all: flagged
    ]

    const join = joinTicketHolders({ tickets, signups, ticketTypeRoles: ROLES })

    expect(join.holders).toHaveLength(4)
    expect(join.confirmed).toHaveLength(1)
    expect(join.waitlistOnly).toHaveLength(1)
    expect(join.notSignedUp).toHaveLength(2)
    expect(join.flagged).toHaveLength(2)
    expect(join.holders.length).toBe(
      join.confirmed.length +
        join.waitlistOnly.length +
        join.notSignedUp.length,
    )
    expect(join.confirmed.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join.waitlistOnly.map((h) => h.email)).toEqual(['bob@x.test'])
    expect(join.notSignedUp.map((h) => h.email).sort()).toEqual([
      'cy@x.test',
      'dee@x.test',
    ])
    expect(join.flagged.map((p) => p.email).sort()).toEqual([
      'eve@x.test',
      'nobody@x.test',
    ])
  })
})

describe('one person, one count', () => {
  it('a person with two workshop tickets is one holder', () => {
    const join = joinTicketHolders({
      tickets: [ticket('ada@x.test', WORKSHOP), ticket('ada@x.test', SPEAKER)],
      signups: [],
      ticketTypeRoles: ROLES,
    })
    expect(join.holders).toHaveLength(1)
    expect(join.notSignedUp).toHaveLength(1)
    expect(join.holders[0].tickets).toHaveLength(2)
  })

  it('a confirmed seat and a waitlist place count as confirmed, once', () => {
    const join = joinTicketHolders({
      tickets: [ticket('ada@x.test', WORKSHOP)],
      signups: [
        signup('ada@x.test', 'waitlist', 'a'),
        signup('ada@x.test', 'confirmed', 'b'),
      ],
      ticketTypeRoles: ROLES,
    })
    expect(join.confirmed).toHaveLength(1)
    expect(join.waitlistOnly).toHaveLength(0)
    expect(join.notSignedUp).toHaveLength(0)
  })

  it('addresses that differ only in case or padding are one person, on both sides', () => {
    const join = joinTicketHolders({
      tickets: [
        ticket('  Ada@X.test ', WORKSHOP),
        ticket('ada@x.test', SPEAKER),
      ],
      signups: [
        signup('ADA@x.test  ', 'waitlist', 'a'),
        signup(' nobody@x.test', 'confirmed', 'a'),
        signup('NOBODY@X.TEST', 'waitlist', 'b'),
      ],
      ticketTypeRoles: ROLES,
    })
    expect(join.holders).toHaveLength(1)
    expect(join.waitlistOnly.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join.flagged).toHaveLength(1)
    expect(join.flagged[0].email).toBe('nobody@x.test')
    expect(join.flagged[0].signups).toHaveLength(2)
  })
})

describe('flagged', () => {
  it('a sign-up whose address holds no workshop ticket is flagged and in none of the four', () => {
    const join = joinTicketHolders({
      tickets: [ticket('eve@x.test', CONFERENCE)],
      signups: [signup('eve@x.test', 'confirmed')],
      ticketTypeRoles: ROLES,
    })
    expect(join.flagged.map((p) => p.email)).toEqual(['eve@x.test'])
    expect(join.holders).toEqual([])
    expect(join.confirmed).toEqual([])
    expect(join.waitlistOnly).toEqual([])
    expect(join.notSignedUp).toEqual([])
  })

  it('unmarking a type moves its holders’ sign-ups to flagged', () => {
    const tickets = [
      ticket('ada@x.test', WORKSHOP),
      ticket('bob@x.test', SPEAKER),
    ]
    const signups = [
      signup('ada@x.test', 'confirmed'),
      signup('bob@x.test', 'confirmed'),
    ]
    const before = joinTicketHolders({
      tickets,
      signups,
      ticketTypeRoles: ROLES,
    })
    expect(before.confirmed).toHaveLength(2)
    expect(before.flagged).toHaveLength(0)

    const unmarked = ROLES.map((role) =>
      role.typeName === SPEAKER ? { ...role, grantsWorkshop: false } : role,
    )
    const after = joinTicketHolders({
      tickets,
      signups,
      ticketTypeRoles: unmarked,
    })
    expect(after.confirmed.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(after.flagged.map((p) => p.email)).toEqual(['bob@x.test'])
    // The sign-up is still there, as it was.
    expect(after.flagged[0].signups).toEqual([signups[1]])
  })

  it('a sign-up with no address is listed on its own', () => {
    const join = joinTicketHolders({
      tickets: [],
      signups: [signup('', 'confirmed', 'a'), signup('  ', 'waitlist', 'b')],
      ticketTypeRoles: ROLES,
    })
    expect(join.flagged).toHaveLength(2)
  })
})

describe('not-set types', () => {
  it('a person with a sign-up and a ticket of a not-set type is flagged and locked out for that type', () => {
    const join = joinTicketHolders({
      tickets: [
        ticket('vic@x.test', VOLUNTEER),
        ticket('val@x.test', VOLUNTEER),
        ticket(' VAL@x.test', 'volunteer '),
        // Holds a workshop ticket too: not locked out.
        ticket('ada@x.test', VOLUNTEER),
        ticket('ada@x.test', WORKSHOP),
      ],
      signups: [signup('vic@x.test', 'waitlist')],
      ticketTypeRoles: ROLES,
    })
    expect(join.flagged.map((p) => p.email)).toEqual(['vic@x.test'])
    expect(join.lockedOut).toEqual([{ typeName: VOLUNTEER, people: 2 }])
    expect(join.holders.map((h) => h.email)).toEqual(['ada@x.test'])
  })

  it('a type answered no locks nobody out', () => {
    const join = joinTicketHolders({
      tickets: [ticket('eve@x.test', CONFERENCE)],
      signups: [],
      ticketTypeRoles: ROLES,
    })
    expect(join.lockedOut).toEqual([])
  })
})

describe('the built-in list', () => {
  it('decides while nothing is marked, as at the gate', () => {
    const join = joinTicketHolders({
      tickets: [
        ticket('ada@x.test', 'Workshop + Conference (2 days)'),
        ticket('bob@x.test', WORKSHOP),
      ],
      signups: [],
      // A lone no marks nothing.
      ticketTypeRoles: [{ typeName: WORKSHOP, grantsWorkshop: false }],
    })
    expect(join.configured).toBe(false)
    expect(join.holders.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join.lockedOut).toEqual([])
  })
})
