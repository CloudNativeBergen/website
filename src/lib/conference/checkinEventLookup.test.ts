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
import {
  getConferenceByCheckinEventId,
  getConferenceTenantByCheckinEventId,
} from './sanity'

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

  it('a DRAFT of the same conference is not a second claimant', async () => {
    // The write token sees drafts, so a conference with an open draft would
    // otherwise look ambiguous to itself and break its own webhook.
    h.fetch.mockResolvedValue([
      { _id: 'drafts.conf-A' },
      { _id: 'conf-A', title: 'published' },
    ])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(error).toBeNull()
    // …and the PUBLISHED document wins, because that is what the site serves.
    expect(conference?._id).toBe('conf-A')
  })

  it('a draft-only match still resolves', async () => {
    h.fetch.mockResolvedValue([{ _id: 'drafts.conf-A' }])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(error).toBeNull()
    expect(conference?._id).toBe('drafts.conf-A')
  })

  it('two conferences remain ambiguous even when one is a draft', async () => {
    h.fetch.mockResolvedValue([{ _id: 'conf-A' }, { _id: 'drafts.conf-B' }])
    const { conference, error } = await getConferenceByCheckinEventId(4242)
    expect(conference).toBeNull()
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

/**
 * THE PRE-AUTHENTICATION HALF (#886). The webhook must know WHOSE secret to
 * verify a delivery with before it can verify it, so this lookup runs on an
 * UNAUTHENTICATED request keyed on an attacker-supplied event id. It therefore
 * has to answer identically to its sibling — same ambiguity refusal, same draft
 * collapse — while reading as little as possible.
 */
describe('getConferenceTenantByCheckinEventId', () => {
  it('resolves the single claimant to its owning organization', async () => {
    h.fetch.mockResolvedValue([
      { _id: 'conf-A', organization: { _ref: 'org-A' } },
    ])
    const { tenant, error } = await getConferenceTenantByCheckinEventId(4242)
    expect(error).toBeNull()
    expect(tenant?.organization?._ref).toBe('org-A')
  })

  it('REFUSES when two conferences claim the same event id', async () => {
    h.fetch.mockResolvedValue([
      { _id: 'conf-A', organization: { _ref: 'org-A' } },
      { _id: 'conf-B', organization: { _ref: 'org-B' } },
    ])
    const { tenant, error } = await getConferenceTenantByCheckinEventId(4242)
    // Picking either one would hand a delivery to the wrong tenant's secret.
    expect(tenant).toBeNull()
    expect(error?.message).toContain('conf-A')
    expect(error?.message).toContain('conf-B')
  })

  it('prefers the published document over its draft, like its sibling', async () => {
    h.fetch.mockResolvedValue([
      { _id: 'drafts.conf-A', organization: { _ref: 'org-draft' } },
      { _id: 'conf-A', organization: { _ref: 'org-published' } },
    ])
    const { tenant } = await getConferenceTenantByCheckinEventId(4242)
    expect(tenant?.organization?._ref).toBe('org-published')
  })

  it('reads THREE FIELDS, not a whole conference', async () => {
    // The point of this function existing. Widening the projection widens what
    // one unauthenticated POST costs, so the projection is asserted by VALUE.
    h.fetch.mockResolvedValue([])
    await getConferenceTenantByCheckinEventId(4242)
    const query = h.fetch.mock.calls[0][0] as string
    expect(query).toContain('{ _id, organization, ticketingProvider }')
    expect(query).not.toContain('...')
  })

  it('binds the event id as a PARAMETER, never into the query text', async () => {
    h.fetch.mockResolvedValue([])
    await getConferenceTenantByCheckinEventId(4242)
    expect(h.fetch.mock.calls[0][0]).toContain('$eventId')
    expect(h.fetch.mock.calls[0][0]).not.toContain('4242')
    expect(h.fetch.mock.calls[0][1]).toEqual({ eventId: 4242 })
  })

  it('fails closed on a read error', async () => {
    h.fetch.mockRejectedValue(new Error('sanity down'))
    const { tenant, error } = await getConferenceTenantByCheckinEventId(4242)
    expect(tenant).toBeNull()
    expect(error).toBeTruthy()
  })
})
