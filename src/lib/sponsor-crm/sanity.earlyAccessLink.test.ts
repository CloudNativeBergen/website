/**
 * @vitest-environment node
 *
 * The sponsor CRM's reads say WHETHER a sponsor has a workshop early-access
 * link (#1346), and never carry the link's token: these reads fill the CRM
 * board, so everything they answer is in every organizer's browser for every
 * sponsor of the conference. The token leaves the server only as the address
 * an organizer asks for (`sponsor.crm.earlyAccess.getAddress`).
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

import { getSponsorForConference, listSponsorsForConference } from './sanity'

const CONF = 'conf-a'
const TOKEN = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const sponsor = (id: string, token?: string) => ({
  _id: id,
  _type: 'sponsorForConference',
  _rev: 'r0',
  _createdAt: '2026-01-01T00:00:00Z',
  conference: ref(CONF),
  sponsor: ref('sponsor-acme'),
  status: 'closed-won',
  ...(token && { workshopEarlyAccessToken: token }),
})

beforeEach(() => {
  h.store!.reset([
    { _id: CONF, _type: 'conference' },
    { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
    sponsor('sfc-linked', TOKEN),
    sponsor('sfc-plain'),
  ])
})

describe('whether a sponsor has an early-access link, as the CRM reads it', () => {
  it('the list answers yes or no for each sponsor, and the token for none', async () => {
    const { sponsors, error } = await listSponsorsForConference(CONF)

    expect(error).toBeUndefined()
    expect(
      Object.fromEntries(
        (sponsors ?? []).map((each) => [
          each._id,
          each.hasWorkshopEarlyAccessLink,
        ]),
      ),
    ).toEqual({ 'sfc-linked': true, 'sfc-plain': false })
    expect(JSON.stringify(sponsors)).not.toContain(TOKEN)
  })

  it('one sponsor read by id answers the same, without the token', async () => {
    const { sponsorForConference } = await getSponsorForConference('sfc-linked')

    expect(sponsorForConference?.hasWorkshopEarlyAccessLink).toBe(true)
    expect(JSON.stringify(sponsorForConference)).not.toContain(TOKEN)
  })
})
