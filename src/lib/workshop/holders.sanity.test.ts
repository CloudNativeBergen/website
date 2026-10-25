/**
 * @vitest-environment node
 *
 * THE JOIN AS THE PAGE READS IT (#1333): tickets from the provider, roles and
 * sign-ups from stored documents (`__tests__/helpers/versionedSanityStore.ts`:
 * the real client's reads, the query text executed by `groq-js`).
 *
 * The gate case runs the same stored state through `checkWorkshopEligibility`
 * and through the join: the people the portal admits are the holders, and
 * nobody else is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  fetchEventTickets: vi.fn(),
  ticketingDenied: false,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store ??= createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: async () => ({
    configured: true,
    provider: { fetchEventTickets: h.fetchEventTickets },
    eventRef: { customerId: 1, eventId: 2 },
  }),
}))
// The operator's ticketing kill switch (`enabled: false` on the org).
vi.mock('@/lib/features/ticketing', () => ({
  isTicketingDeniedForOrg: async (orgId: string) =>
    orgId === 'org-a' && h.ticketingDenied,
}))
// The gate tells organizers about a not-set type; not under test here.
vi.mock('./not-set-notice', () => ({ reportNotSetTicketTypes: () => {} }))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'contact@x.test',
}))

import { checkWorkshopEligibility } from './eligibility'
import { readTicketHolders } from './holders'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

const CONF = 'conf-a'
const OTHER = 'conf-b'
const CONFERENCE = {
  _id: CONF,
  organization: { _ref: 'org-a' },
  checkinCustomerId: 1,
  checkinEventId: 2,
}

const WORKSHOP = 'Workshop pass'
const SPEAKER = 'Speaker ticket'
const PLAIN = 'Conference only'
const VOLUNTEER = 'Volunteer'

let id = 1
function ticket(email: string, category: string): EventTicket {
  const n = id++
  return {
    id: n,
    order_id: n,
    category,
    crm: { email, first_name: `First${n}`, last_name: 'Last' },
  } as unknown as EventTicket
}

function signupDoc(
  _id: string,
  userEmail: string,
  status: 'confirmed' | 'waitlist',
  conference = CONF,
) {
  return {
    _id,
    _type: 'workshopSignup',
    _rev: 'r0',
    userEmail,
    userName: `Name of ${_id}`,
    status,
    conference: { _type: 'reference', _ref: conference },
    workshop: { _type: 'reference', _ref: `talk-${conference}` },
  }
}

function conferenceDoc(ticketTypeRoles: unknown[]) {
  return { _id: CONF, _type: 'conference', _rev: 'r0', ticketTypeRoles }
}

const ROLES = [
  { _key: 'a', typeName: WORKSHOP, grantsWorkshop: true },
  { _key: 'b', typeName: SPEAKER, grantsWorkshop: true },
  { _key: 'c', typeName: PLAIN, grantsWorkshop: false },
]

const TICKETS = [
  ticket('ada@x.test', WORKSHOP),
  ticket('  BOB@x.test', SPEAKER),
  ticket('bob@x.test', PLAIN),
  ticket('cy@x.test', PLAIN),
  ticket('vic@x.test', VOLUNTEER),
  ticket('Dee@X.test ', WORKSHOP),
  ticket('dee@x.test', WORKSHOP),
  // NFKC folds the ligature in `email`; the gate keys on the address as
  // registered (`registeredEmail`), and so must the join.
  ticket('oﬃce@x.test', WORKSHOP),
]

const talks = [CONF, OTHER].map((conference) => ({
  _id: `talk-${conference}`,
  _type: 'talk',
  _rev: 'r0',
  title: `Workshop of ${conference}`,
  conference: { _type: 'reference', _ref: conference },
}))

beforeEach(() => {
  h.ticketingDenied = false
  __resetRedeemedCache()
  h.fetchEventTickets.mockReset()
  h.fetchEventTickets.mockResolvedValue(TICKETS)
  h.store!.reset([
    conferenceDoc(ROLES),
    { _id: OTHER, _type: 'conference', _rev: 'r0' },
    ...talks,
    signupDoc('s-ada', 'ada@x.test', 'confirmed'),
    signupDoc('s-cy', 'cy@x.test', 'waitlist'),
    signupDoc('s-vic', ' VIC@x.test', 'confirmed'),
  ])
})

describe('readTicketHolders', () => {
  it('the people the gate admits are the holders, and nobody else is', async () => {
    const join = await readTicketHolders(CONFERENCE)
    expect(join).not.toBeNull()

    const addresses = new Set([
      ...TICKETS.map((t) => t.crm.email),
      ...h
        .store!.all()
        .flatMap((d) => (typeof d.userEmail === 'string' ? [d.userEmail] : [])),
    ])
    const admitted = new Set<string>()
    for (const userEmail of addresses) {
      const result = await checkWorkshopEligibility({
        userEmail,
        conference: CONFERENCE,
      })
      if (result.isEligible) admitted.add(userEmail.trim().toLowerCase())
    }

    // Counted by hand: ada (pass), bob (speaker), dee (pass, twice), and the
    // ligature address as registered.
    expect([...admitted].sort()).toEqual([
      'ada@x.test',
      'bob@x.test',
      'dee@x.test',
      'oﬃce@x.test',
    ])
    expect(join!.holders.map((holder) => holder.email).sort()).toEqual(
      [...admitted].sort(),
    )
  })

  it('reads the roles live, and joins the sign-ups as stored', async () => {
    const join = await readTicketHolders(CONFERENCE)
    expect(join!.confirmed.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join!.notSignedUp.map((h) => h.email).sort()).toEqual([
      'bob@x.test',
      'dee@x.test',
      'oﬃce@x.test',
    ])
    expect(join!.flagged.map((p) => [p.email, p.name])).toEqual(
      expect.arrayContaining([
        ['cy@x.test', 'Name of s-cy'],
        ['vic@x.test', 'Name of s-vic'],
      ]),
    )
    expect(join!.flagged).toHaveLength(2)
    expect(join!.flagged.find((p) => p.email === 'cy@x.test')?.signups).toEqual(
      [
        {
          _id: 's-cy',
          userEmail: 'cy@x.test',
          userName: 'Name of s-cy',
          userWorkOSId: null,
          status: 'waitlist',
          workshop: { _id: `talk-${CONF}`, title: `Workshop of ${CONF}` },
        },
      ],
    )
    expect(join!.lockedOut).toEqual([{ typeName: VOLUNTEER, people: 1 }])
  })

  it('sign-ups of another conference never enter the join', async () => {
    h.store!.put(signupDoc('s-ada-b', 'dee@x.test', 'confirmed', OTHER))
    h.store!.put(signupDoc('s-zed-b', 'zed@x.test', 'confirmed', OTHER))

    const join = await readTicketHolders(CONFERENCE)

    // dee's only sign-up is the other conference's: not signed up here.
    expect(join!.notSignedUp.map((h) => h.email)).toContain('dee@x.test')
    expect(join!.confirmed.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join!.flagged.map((p) => p.email)).not.toContain('zed@x.test')
    const signupReads = h.store!.reads.filter((r) =>
      r.query.includes('workshopSignup'),
    )
    expect(signupReads).toHaveLength(1)
    expect(signupReads[0].params).toEqual({ conferenceId: CONF })
  })

  // A bad write (Studio, legacy data): this conference's sign-up pointing at
  // another conference's workshop. The sign-up counts; the foreign workshop's
  // title never leaves the read.
  it('never carries another conference’s workshop', async () => {
    h.store!.put({
      ...signupDoc('s-cross', 'cross@x.test', 'confirmed'),
      workshop: { _type: 'reference', _ref: `talk-${OTHER}` },
    })

    const join = await readTicketHolders(CONFERENCE)

    const cross = join!.flagged.find((p) => p.email === 'cross@x.test')
    expect(cross?.signups.map((s) => [s._id, s.workshop])).toEqual([
      ['s-cross', null],
    ])
    expect(JSON.stringify(join)).not.toContain(`Workshop of ${OTHER}`)
  })

  it('a draft of a sign-up is not a sign-up', async () => {
    h.store!.put(signupDoc('drafts.s-dee', 'dee@x.test', 'confirmed'))
    const join = await readTicketHolders(CONFERENCE)
    expect(join!.notSignedUp.map((h) => h.email)).toContain('dee@x.test')
  })

  it('unmarking a type flags its holders’ sign-ups and writes nothing', async () => {
    h.store!.put(signupDoc('s-bob', 'bob@x.test', 'confirmed'))
    expect((await readTicketHolders(CONFERENCE))!.confirmed).toHaveLength(2)

    h.store!.put(
      conferenceDoc(
        ROLES.map((r) =>
          r.typeName === SPEAKER ? { ...r, grantsWorkshop: false } : r,
        ),
      ),
    )
    const join = await readTicketHolders(CONFERENCE)
    expect(join!.confirmed.map((h) => h.email)).toEqual(['ada@x.test'])
    expect(join!.flagged.map((p) => p.email)).toContain('bob@x.test')
    expect(h.store!.doc('s-bob')).toMatchObject({ status: 'confirmed' })
    expect(h.store!.commits).toEqual([])
  })

  // GUARD BEFORE FETCH: an operator who switched ticketing off for the org
  // gets no ticket read, no holder and no flagged name from this either, as
  // the "Workshop tickets" section next to it shows nothing.
  it('reads nothing when ticketing is switched off for the organization', async () => {
    h.ticketingDenied = true
    const readsBefore = h.store!.reads.length

    expect(await readTicketHolders(CONFERENCE)).toBeNull()
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
    expect(h.store!.reads.slice(readsBefore)).toEqual([])
  })

  it('a failed ticket read is null, not an empty join', async () => {
    h.fetchEventTickets.mockRejectedValue(new Error('provider down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readTicketHolders(CONFERENCE)).toBeNull()
  })

  it('shares the memo by default, and reads the provider again when asked to read fresh', async () => {
    await readTicketHolders(CONFERENCE)
    await readTicketHolders(CONFERENCE)
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(1)

    h.fetchEventTickets.mockResolvedValue([
      ...TICKETS,
      ticket('new@x.test', WORKSHOP),
    ])
    const fresh = await readTicketHolders(CONFERENCE, { fresh: true })
    expect(h.fetchEventTickets).toHaveBeenCalledTimes(2)
    expect(fresh!.notSignedUp.map((h) => h.email)).toContain('new@x.test')
  })
})
