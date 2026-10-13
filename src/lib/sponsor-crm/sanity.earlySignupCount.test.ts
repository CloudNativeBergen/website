/**
 * @vitest-environment node
 *
 * HOW MANY EARLY SIGN-UPS WERE MADE THROUGH A SPONSOR'S LINKS, as the sponsor
 * CRM reads it (#1348, spec §9): a number on the sponsor's record, read with
 * the record and costing no read of its own.
 *
 * It counts sign-ups, not people, confirmed and waitlisted together, and
 * includes the ones made through a link that was revoked since. It agrees
 * with the "Early sign-ups" list narrowed to the sponsor
 * (`listEarlySignups`), which is asserted here on the same documents.
 *
 * REAL: the read functions and their query text, run through `groq-js`.
 * MODELLED: see `__tests__/helpers/versionedSanityStore.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { listEarlySignups } from '@/lib/workshop/early-access/signups'
import { getSponsorForConference, listSponsorsForConference } from './sanity'

const CONF = 'conf-a'
const OTHER_CONF = 'conf-b'
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const sponsor = (id: string, conf: string, token?: string) => ({
  _id: id,
  _type: 'sponsorForConference',
  _rev: 'r0',
  _createdAt: '2026-01-01T00:00:00Z',
  conference: ref(conf),
  sponsor: ref('sponsor-acme'),
  status: 'closed-won',
  ...(token && { workshopEarlyAccessToken: token }),
})
const signup = (
  id: string,
  via: string,
  {
    conf = CONF,
    status = 'confirmed',
    person = id,
  }: { conf?: string; status?: string; person?: string } = {},
) => ({
  _id: id,
  _type: 'workshopSignup',
  _createdAt: '2026-06-09T08:00:00Z',
  userName: `Person ${person}`,
  userEmail: `${person}@example.com`,
  userWorkOSId: `workos-${person}`,
  workshop: ref('ws-1'),
  conference: ref(conf),
  status,
  earlyAccessSponsor: { ...ref(via), _weak: true },
})

beforeEach(() => {
  h.store!.reset([
    { _id: CONF, _type: 'conference' },
    { _id: OTHER_CONF, _type: 'conference' },
    { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
    { _id: 'ws-1', _type: 'talk', title: 'Kubernetes 101' },
    sponsor('sfc-linked', CONF, '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'),
    // Its link was revoked after two people had signed up through it.
    sponsor('sfc-revoked', CONF),
    sponsor('sfc-unused', CONF),
    sponsor('sfc-theirs', OTHER_CONF),

    // Through sfc-linked: ONE person in two workshops, and one on a waitlist.
    signup('su-1', 'sfc-linked', { person: 'ada' }),
    signup('su-2', 'sfc-linked', { person: 'ada' }),
    signup('su-3', 'sfc-linked', { status: 'waitlist' }),
    // Neither a seat nor a place in line: not a sign-up the list shows.
    signup('su-void', 'sfc-linked', { status: 'cancelled' }),
    signup('su-4', 'sfc-revoked'),
    signup('su-5', 'sfc-revoked', { status: 'waitlist' }),
    // A sign-up that is not early records no sponsor.
    { ...signup('su-public', 'sfc-linked'), earlyAccessSponsor: undefined },

    // ANOTHER CONFERENCE'S sign-ups: one through its own sponsor, and two
    // that name THIS conference's sponsors (only a bad write does that).
    signup('su-theirs', 'sfc-theirs', { conf: OTHER_CONF }),
    signup('su-crossed-1', 'sfc-linked', { conf: OTHER_CONF }),
    signup('su-crossed-2', 'sfc-unused', { conf: OTHER_CONF }),
    // And one of ours that names THEIR sponsor.
    signup('su-crossed-3', 'sfc-theirs'),
  ])
})

const counts = (
  sponsors: { _id: string; workshopEarlySignupCount?: number }[] = [],
) =>
  Object.fromEntries(
    sponsors.map((each) => [each._id, each.workshopEarlySignupCount]),
  )

describe('the early sign-ups made through a sponsor’s links, as the CRM reads the count', () => {
  it('the list answers the count of each sponsor: sign-ups not people, both statuses, a revoked link included', async () => {
    const { sponsors, error } = await listSponsorsForConference(CONF)

    expect(error).toBeUndefined()
    expect(counts(sponsors)).toEqual({
      'sfc-linked': 3,
      'sfc-revoked': 2,
      'sfc-unused': 0,
    })
  })

  it('one sponsor read by id answers the same count', async () => {
    const { sponsorForConference } = await getSponsorForConference('sfc-linked')

    expect(sponsorForConference?.workshopEarlySignupCount).toBe(3)
  })

  it("never counts another conference's sign-ups, and theirs never count ours", async () => {
    const { sponsors } = await listSponsorsForConference(OTHER_CONF)

    expect(counts(sponsors)).toEqual({ 'sfc-theirs': 1 })
  })

  it('is the number of rows the list shows when narrowed to that sponsor', async () => {
    expect(
      (await listEarlySignups(CONF, 'sfc-linked')).signups.map(
        (row) => row._id,
      ),
    ).toEqual(expect.arrayContaining(['su-1', 'su-2', 'su-3']))
    expect((await listEarlySignups(CONF, 'sfc-linked')).signups).toHaveLength(3)
    expect((await listEarlySignups(CONF, 'sfc-revoked')).signups).toHaveLength(
      2,
    )
    expect((await listEarlySignups(CONF, 'sfc-unused')).signups).toHaveLength(0)
  })

  it('costs no read of its own: the list is one read, and so is one sponsor', async () => {
    await listSponsorsForConference(CONF)
    expect(h.store!.reads).toHaveLength(1)

    await getSponsorForConference('sfc-linked')
    expect(h.store!.reads).toHaveLength(2)
  })
})
