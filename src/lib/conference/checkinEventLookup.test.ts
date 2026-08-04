/**
 * @vitest-environment node
 *
 * THE TICKET WEBHOOK'S TENANT KEY MUST BE UNAMBIGUOUS (#731 F5).
 *
 * `getConferenceByCheckinEventId` is how the signature-verified ticket-sold
 * webhook decides WHICH tenant a sale belongs to — it arrives with a provider
 * event id and no host, so this lookup IS the tenant resolution. It used to take
 * `[0]` of a match on `checkinEventId`, a client-written field with no
 * uniqueness rule, so two conferences claiming the same id would silently route
 * one tenant's real sales into the other's conference: their attendees receive
 * the wrong event's workshop instructions and the real conference receives none.
 *
 * `conference.updateTicketingIds` now refuses to CREATE that state; this refuses
 * to ACT on it where it already exists.
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: h.fetch },
  clientRead: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConferenceByCheckinEventId } from './sanity'

beforeEach(() => vi.clearAllMocks())

describe('getConferenceByCheckinEventId', () => {
  it('resolves the single claimant', async () => {
    h.fetch.mockResolvedValue([{ _id: 'conf-A', title: 'A' }])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(error).toBeNull()
    expect(conference?._id).toBe('conf-A')
  })

  it('REFUSES when two conferences claim the same event id', async () => {
    h.fetch.mockResolvedValue([{ _id: 'conf-A' }, { _id: 'conf-B' }])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(conference).toBeNull()
    // Naming both ids is the point — an operator has to be able to find them.
    expect(error?.message).toContain('conf-A')
    expect(error?.message).toContain('conf-B')
  })

  it('does not slice the query to one row', async () => {
    // A `[0]` in the query would make the ambiguity invisible here.
    h.fetch.mockResolvedValue([])
    await getConferenceByCheckinEventId(4242)
    expect(h.fetch.mock.calls[0][0]).not.toContain('[0]')
  })

  it('reports no claimant as an error, not a silent null conference', async () => {
    h.fetch.mockResolvedValue([])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(conference).toBeNull()
    expect(error?.message).toContain('4242')
  })

  it('fails closed on a read error', async () => {
    h.fetch.mockRejectedValue(new Error('sanity down'))
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(conference).toBeNull()
    expect(error).toBeTruthy()
  })
})
