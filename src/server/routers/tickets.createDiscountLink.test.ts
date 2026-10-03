/**
 * @vitest-environment node
 *
 * A SPONSOR-ROW CREATE STORES ITS LINK (#1262). Once a sponsor stores any
 * code, the name heuristic is off for it — so a code created from its row in
 * the discount code manager must be linked as it is created, or it is
 * attributed to nobody: the row keeps offering Create, its usage is lost, and
 * Send has nothing to preselect.
 *
 * Through `createCaller`, with Sanity and the ticketing provider mocked at the
 * boundary.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  tenant: null as Record<string, unknown> | null,
  links: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ id: string; items: unknown[] }>,
  creates: [] as Array<Record<string, unknown>>,
  insertShouldThrow: false,
  linksShouldThrow: false,
  /** `discountCodeClaim` documents by id, and every claim op in order. */
  claims: new Map<string, Record<string, unknown>>(),
  claimOps: [] as Array<{ op: string; id: string; sfc?: string }>,
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async () => ({ _id: 'org-A', name: 'Org A' }),
  getOrganizationRefForCurrentConference: async () => null,
  getOrganizationRefViaParentConference: async () => 'org-A',
  organizationField: (ref: string | null) =>
    ref ? { organization: { _type: 'reference', _ref: ref } } : {},
}))
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingCredentials: async () => ({ apiKey: 'k', apiSecret: 's' }),
  getTicketingProvider: () => ({
    listDiscounts: h.listDiscounts,
    createDiscount: h.createDiscount,
  }),
}))
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params?: Record<string, unknown>) => {
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.includes('"linkedCodes"')) {
      if (h.linksShouldThrow)
        throw new Error('sanity transport: socket hang up')
      return h.links
    }
    if (query.includes('_type == "discountCodeClaim"')) {
      const doc = h.claims.get(params?.id as string)
      if (!doc) return null
      const holder = doc.sponsorForConference as { _ref: string }
      return { ...doc, sponsorForConferenceId: holder._ref }
    }
    return null
  }
  const patch = (id: string) => {
    const chain = {
      setIfMissing: () => chain,
      insert: (_pos: string, _at: string, items: unknown[]) => {
        h.inserts.push({ id, items })
        return chain
      },
      commit: async () => {
        if (h.insertShouldThrow) throw new Error('sanity down')
        return {}
      },
    }
    return chain
  }
  const client = {
    fetch,
    patch,
    create: async (doc: Record<string, unknown>) => {
      if (doc._type === 'discountCodeClaim') {
        const id = doc._id as string
        if (h.claims.has(id)) {
          throw Object.assign(
            new Error(`Document by ID "${id}" already exists`),
            { statusCode: 409 },
          )
        }
        h.claims.set(id, { ...doc, _rev: 'rev-1' })
        h.claimOps.push({
          op: 'create',
          id,
          sfc: (doc.sponsorForConference as { _ref: string })._ref,
        })
        return doc
      }
      h.creates.push(doc)
      return { _id: `act-${h.creates.length}` }
    },
    delete: async (id: string) => {
      h.claims.delete(id)
      h.claimOps.push({ op: 'delete', id })
      return {}
    },
  }
  return {
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { ticketsRouter } from './tickets'

const t = initTRPC.context<Context>().create()
const ORG = 'org-A'
const CONF = 'conf-A'
const EVENT = 4242
const SFC = 'sfc-acme'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const tickets = () => t.createCallerFactory(ticketsRouter)(ctx())

const INPUT = {
  eventId: EVENT,
  discountCode: 'ACMECLOUD5678',
  numberOfTickets: 5,
  sponsorName: 'Acme Cloud',
  tierTitle: 'Gold',
  sponsorForConferenceId: SFC,
  selectedTicketTypes: [],
}

const assignLog = () =>
  h.creates.find((d) => d.activityType === 'discount_codes_assigned')

beforeEach(() => {
  vi.clearAllMocks()
  h.tenant = { _type: 'sponsorForConference', conferenceId: CONF }
  h.links = [
    {
      _id: SFC,
      sponsorId: 'sponsor-acme',
      name: 'Acme Cloud',
      // The code it was sent before, since deleted at the provider.
      linkedCodes: ['ACMECLOUD1234'],
    },
  ]
  h.inserts = []
  h.creates = []
  h.insertShouldThrow = false
  h.linksShouldThrow = false
  h.claims = new Map()
  h.claimOps = []
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      organization: { _ref: ORG },
      checkinEventId: EVENT,
      checkinCustomerId: 7,
      sponsors: [{ sponsor: { _id: 'sponsor-acme', name: 'Acme Cloud' } }],
    },
    domain: 'localhost',
    error: null,
  })
  h.listDiscounts.mockResolvedValue({ discounts: [], ticketTypes: [] })
  h.createDiscount.mockResolvedValue({ triggerValue: 'ACMECLOUD5678' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('tickets.admin.createDiscountCode for a sponsor row', () => {
  it('stores the new code on the sponsor, marked as created', async () => {
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).resolves.toMatchObject({ success: true, linkedCodes: ['ACMECLOUD5678'] })
    expect(h.createDiscount).toHaveBeenCalledTimes(1)
    expect(h.inserts).toEqual([
      {
        id: SFC,
        items: [
          expect.objectContaining({
            code: 'ACMECLOUD5678',
            providerCodeId: 'ACMECLOUD5678',
            linkedVia: 'create',
          }),
        ],
      },
    ])
  })

  it('logs the link on the sponsor’s timeline', async () => {
    await tickets().admin.createDiscountCode(INPUT)
    expect(assignLog()).toMatchObject({
      sponsorForConference: { _ref: SFC },
      description: 'Discount code ACMECLOUD5678 assigned',
      createdBy: { _ref: 'sp-admin' },
    })
  })

  it("refuses another tenant's sponsor before the provider is touched", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.createDiscount).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })

  it('a failed link write never fails a code the provider already created', async () => {
    h.insertShouldThrow = true
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).resolves.toMatchObject({
      success: true,
      linkedCodes: [],
      linkFailed: true,
    })
    expect(assignLog()).toBeUndefined()
  })

  it('refuses, before the provider, a code another sponsor already stores', async () => {
    // A stale link: the code is gone at the provider but Globex still stores it.
    h.links.push({
      _id: 'sfc-globex',
      sponsorId: 'sponsor-globex',
      name: 'Globex',
      linkedCodes: ['ACMECLOUD5678'],
    })
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Discount code "ACMECLOUD5678" is already linked to Globex',
    })
    expect(h.createDiscount).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })

  it('fails closed when the links cannot be read — and mints nothing', async () => {
    h.linksShouldThrow = true
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'Could not read this conference’s sponsors, so a code cannot be checked against them. Try again.',
    })
    expect(h.createDiscount).not.toHaveBeenCalled()
  })

  it('a first link from a sponsor-row create adopts the sponsor’s name-matched codes', async () => {
    h.links[0].linkedCodes = null
    h.listDiscounts.mockResolvedValue({
      discounts: [
        { triggerValue: 'ACMECLOUD1234' },
        { triggerValue: 'COMMUNITY2026' },
      ],
      ticketTypes: [],
    })
    await tickets().admin.createDiscountCode(INPUT)
    expect(h.inserts).toEqual([
      {
        id: SFC,
        items: [
          expect.objectContaining({
            code: 'ACMECLOUD5678',
            linkedVia: 'create',
          }),
          expect.objectContaining({
            code: 'ACMECLOUD1234',
            linkedVia: 'adopt',
          }),
        ],
      },
    ])
  })

  /**
   * IDENTITY FROM THE GUARDED RECORD (Codex bot): the tenancy guard proves
   * the CRM record is this conference's, not that `sponsorName` names it.
   */
  it('names the sponsor from its CRM record, never from a mismatched sponsorName', async () => {
    const result = await tickets().admin.createDiscountCode({
      ...INPUT,
      sponsorName: 'Globex',
    })
    expect(result.message).toContain('for Acme Cloud (Gold tier)')
    expect(result.message).not.toContain('Globex')
  })

  it('treats a create carrying only the CRM record as a sponsor code, not a standalone one', async () => {
    // Without the record's identity this would hit the standalone guard and be
    // refused for containing the sponsor's own name.
    h.links[0].linkedCodes = null // matched by name, so the guard would bite
    const { sponsorName: _unused, ...withoutName } = INPUT
    void _unused
    await expect(
      tickets().admin.createDiscountCode(withoutName),
    ).resolves.toMatchObject({ success: true })
    expect(h.createDiscount).toHaveBeenCalledTimes(1)
  })

  it('a standalone code links to nobody', async () => {
    await tickets().admin.createDiscountCode({
      eventId: EVENT,
      discountCode: 'COMMUNITY2026',
      numberOfTickets: 5,
      discountPercentage: 20,
      selectedTicketTypes: [],
    })
    expect(h.createDiscount).toHaveBeenCalledTimes(1)
    expect(h.inserts).toHaveLength(0)
  })
})

/** The ownership lock on the create path (PR #1272 review). */
describe('the claim on a sponsor-row create', () => {
  const claimFor = (code: string) =>
    [...h.claims.values()].find((c) => c.code === code)

  it('claims the code for the sponsor BEFORE the provider mints it', async () => {
    await tickets().admin.createDiscountCode(INPUT)
    expect(h.claimOps[0]).toMatchObject({ op: 'create', sfc: SFC })
    expect(h.createDiscount).toHaveBeenCalledTimes(1)
    expect(h.createDiscount.mock.invocationCallOrder[0]).toBeGreaterThan(0)
    expect(
      (claimFor('ACMECLOUD5678')?.sponsorForConference as { _ref: string })
        ._ref,
    ).toBe(SFC)
  })

  it('refuses a code another sponsor just claimed, before the provider is touched', async () => {
    const id = `discountCodeClaim-${CONF}-ACMECLOUD5678`
    h.claims.set(id, {
      _id: id,
      _rev: 'rev-foreign',
      _type: 'discountCodeClaim',
      code: 'ACMECLOUD5678',
      sponsorForConference: { _ref: 'sfc-globex' },
      claimedAt: new Date().toISOString(),
    })
    h.links.push({
      _id: 'sfc-globex',
      sponsorId: 'sponsor-globex',
      name: 'Globex',
      linkedCodes: null,
    })
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Discount code "ACMECLOUD5678" is already linked to Globex',
    })
    expect(h.createDiscount).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })

  it('releases the claim when the provider refuses to mint the code', async () => {
    h.createDiscount.mockRejectedValue(new Error('checkin: 500'))
    await expect(tickets().admin.createDiscountCode(INPUT)).rejects.toThrow()
    expect(h.claimOps.map((o) => o.op)).toEqual(['create', 'delete'])
    expect(h.claims.size).toBe(0)
  })

  it('a failed link write frees the adopted claims and keeps only the minted code’s', async () => {
    h.links[0].linkedCodes = null
    h.listDiscounts.mockResolvedValue({
      discounts: [{ triggerValue: 'ACMECLOUD1234' }],
      ticketTypes: [],
    })
    h.insertShouldThrow = true
    await expect(
      tickets().admin.createDiscountCode(INPUT),
    ).resolves.toMatchObject({ success: true, linkFailed: true })
    const held = [...h.claims.values()].map((c) => c.code)
    expect(held).toEqual(['ACMECLOUD5678'])
  })

  it('a standalone create claims nothing', async () => {
    await tickets().admin.createDiscountCode({
      eventId: EVENT,
      discountCode: 'COMMUNITY2026',
      numberOfTickets: 5,
      discountPercentage: 20,
      selectedTicketTypes: [],
    })
    expect(h.claimOps).toHaveLength(0)
  })
})
