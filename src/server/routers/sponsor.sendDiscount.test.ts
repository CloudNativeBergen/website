/**
 * @vitest-environment node
 *
 * THE DISCOUNT KIND of `sponsor.crm.sendCommunication` (#1262).
 *
 * Through `createCaller`, with Sanity, the Resend sender and the ticketing
 * provider mocked at the boundary and the real render path between. The
 * codes the organizer picks are checked against the conference's OWN provider
 * event, mailed in a codes block, listed on the audit record, and appended to
 * the sponsor's stored link — only after the provider accepted the send.
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
  getOrganizationById: vi.fn(),
  tenant: null as Record<string, unknown> | null,
  sfc: null as Record<string, unknown> | null,
  /** Every sponsor of the conference with its stored codes. */
  links: [] as Array<Record<string, unknown>>,
  fetches: [] as Array<{ query: string; params?: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ id: string; at: string; items: unknown[] }>,
  insertShouldThrow: false,
  send: vi.fn(),
  listDiscounts: vi.fn(),
  credentials: vi.fn(),
}))

vi.mock('@/lib/sponsor/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getSponsorEmailTemplate: async () => ({ template: undefined }),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: async () => null,
  getOrganizationRefViaParentConference: async () => 'org-ref',
  organizationField: (ref: string | null) =>
    ref ? { organization: { _type: 'reference', _ref: ref } } : {},
}))
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingCredentials: h.credentials,
  getTicketingProvider: () => ({ listDiscounts: h.listDiscounts }),
}))
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params?: Record<string, unknown>) => {
    h.fetches.push({ query, params })
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.includes('"linkedCodes"')) return h.links
    if (query.includes('_type == "sponsorForConference"')) return h.sfc
    return null
  }
  const patch = (id: string) => {
    const chain = {
      set: () => chain,
      unset: () => chain,
      setIfMissing: () => chain,
      insert: (_pos: string, at: string, items: unknown[]) => {
        h.inserts.push({ id, at, items })
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
      h.creates.push(doc)
      return { _id: `act-${h.creates.length}` }
    },
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})
vi.mock('@/lib/email/config', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  resolveEmailSender: async () => ({ client: { emails: { send: h.send } } }),
  retryWithBackoff: async <T>(fn: () => Promise<T>) => fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'
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

const sponsor = () => t.createCallerFactory(sponsorRouter)(ctx())

const INPUT = {
  sponsorForConferenceId: SFC,
  kind: 'discount' as const,
  recipientKeys: ['c-primary'],
  subject: 'Your sponsor tickets',
  message: JSON.stringify([
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Here are your codes.' }],
    },
  ]),
  discountCodes: ['ACME-2026'],
}

const discount = (triggerValue: string) => ({
  trigger: 'coupon',
  type: 'percent',
  value: '100',
  triggerValue,
  affects: 'total',
  includeBooking: false,
  affectsValue: null,
  modes: [],
  tickets: [],
  ticketsOnly: false,
  times: 0,
  timesTotal: 5,
})

const linkInserts = () => h.inserts.filter((i) => i.id === SFC)
const record = () =>
  h.creates.find((d) => d._type === 'sponsorActivity' && d.communicationKind)

beforeEach(() => {
  vi.clearAllMocks()
  h.fetches = []
  h.creates = []
  h.inserts = []
  h.insertShouldThrow = false
  h.tenant = { _type: 'sponsorForConference', conferenceId: CONF }
  h.sfc = {
    _id: SFC,
    status: 'closed-won',
    contactPersons: [
      {
        _key: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        isPrimary: true,
      },
    ],
    sponsor: { name: 'Acme AS' },
    tier: { title: 'Gold' },
  }
  h.links = [
    {
      _id: SFC,
      sponsorId: 'sponsor-acme',
      name: 'Acme AS',
      linkedCodes: null,
    },
    {
      _id: 'sfc-globex',
      sponsorId: 'sponsor-globex',
      name: 'Globex',
      linkedCodes: ['GLOBEX-VIP'],
    },
  ]
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organizer: 'CNDN',
      organization: { _ref: ORG },
      checkinEventId: 4242,
      sponsors: [
        { sponsor: { _id: 'sponsor-acme', name: 'Acme AS' } },
        { sponsor: { _id: 'sponsor-globex', name: 'Globex' } },
      ],
      sponsorEmail: 'sponsors@example.test',
      sponsorRegistrationLink: 'https://tickets.example.test/sponsor?a=1&b=2',
      city: 'Bergen',
      country: 'Norway',
      startDate: '2026-10-28',
      domains: ['cloudnativebergen.dev'],
    },
    domain: 'localhost',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue({ _id: ORG, name: 'CNDN' })
  h.credentials.mockResolvedValue({ apiKey: 'k', apiSecret: 's' })
  h.listDiscounts.mockResolvedValue({
    discounts: [
      discount('ACME-2026'),
      discount('ACME-WORKSHOP'),
      discount('GLOBEX-VIP'),
      discount('<b>X</b>'),
    ],
    ticketTypes: [],
  })
  h.send.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a discount send', () => {
  it('mails the chosen codes with the sponsor ticket link and lists them on the record', async () => {
    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      // Lower-case input resolves to the provider's own spelling.
      discountCodes: ['acme-2026', 'ACME-WORKSHOP'],
    })

    const sent = h.send.mock.calls[0][0]
    expect(sent.to).toEqual(['kari@acme.test'])
    expect(sent.html).toContain('Here are your codes.')
    expect(sent.html).toContain('ACME-2026')
    expect(sent.html).toContain('ACME-WORKSHOP')
    expect(sent.html).toContain(
      'https://tickets.example.test/sponsor?a=1&amp;b=2',
    )

    expect(record()).toMatchObject({
      communicationKind: 'discount',
      deliveryStatus: 'sent',
      description: 'Discount codes sent to Kari Nordmann',
      attachments: [
        {
          label: 'Discount code ACME-2026',
          url: 'https://tickets.example.test/sponsor?a=1&b=2',
        },
        {
          label: 'Discount code ACME-WORKSHOP',
          url: 'https://tickets.example.test/sponsor?a=1&b=2',
        },
      ],
    })
    expect(record()!.body).toBe(sent.html)
    expect(result).toMatchObject({
      success: true,
      linkedCodes: ['ACME-2026', 'ACME-WORKSHOP'],
    })
  })

  it('escapes a code before it reaches the HTML', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      discountCodes: ['<b>X</b>'],
    })
    const html = h.send.mock.calls[0][0].html as string
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
    expect(html).not.toContain('<b>X</b>')
  })

  it('reads the provider event of the REQUEST conference, never one from input', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.credentials).toHaveBeenCalledWith(ORG, 'checkin')
    expect(h.listDiscounts).toHaveBeenCalledWith(4242)
  })
})

describe('the stored sponsor↔code link', () => {
  it('appends the sent codes to the sponsor in one insert, marked as sent', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      discountCodes: ['ACME-2026', 'ACME-WORKSHOP'],
    })
    expect(linkInserts()).toHaveLength(1)
    expect(linkInserts()[0].at).toBe('discountCodes[-1]')
    expect(linkInserts()[0].items).toEqual([
      expect.objectContaining({
        code: 'ACME-2026',
        providerCodeId: 'ACME-2026',
        linkedVia: 'send',
        _key: expect.any(String),
      }),
      expect.objectContaining({ code: 'ACME-WORKSHOP', linkedVia: 'send' }),
    ])
  })

  it('never stores a code twice', async () => {
    h.links[0].linkedCodes = ['acme-2026']
    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      discountCodes: ['ACME-2026', 'ACME-WORKSHOP', 'ACME-WORKSHOP'],
    })
    expect(linkInserts()).toHaveLength(1)
    expect(linkInserts()[0].items).toEqual([
      expect.objectContaining({ code: 'ACME-WORKSHOP' }),
    ])
    expect(result.linkedCodes).toEqual(['ACME-WORKSHOP'])
  })

  it('writes nothing when every code is already stored — the email still goes', async () => {
    h.links[0].linkedCodes = ['ACME-2026']
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(linkInserts()).toHaveLength(0)
  })

  it('is not written when the provider refuses the send', async () => {
    h.send.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(record()).toMatchObject({ deliveryStatus: 'failed' })
    expect(linkInserts()).toHaveLength(0)
  })

  it('a failed link write never fails a send the provider accepted', async () => {
    h.insertShouldThrow = true
    await expect(sponsor().crm.sendCommunication(INPUT)).resolves.toMatchObject(
      { success: true, linkedCodes: [], linkFailed: true },
    )
    expect(record()).toMatchObject({ deliveryStatus: 'sent' })
  })
})

describe('codes are refused before anything is sent', () => {
  it('a code that is not on the event', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        discountCodes: ['ACME-2026', 'MADE-UP'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Discount code "MADE-UP" does not exist on this event',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.creates).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('a code already stored on ANOTHER sponsor', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        discountCodes: ['globex-vip'],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Discount code "GLOBEX-VIP" is already linked to Globex',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })

  it('a conference without a ticketing event', async () => {
    const { conference } = await h.getConference()
    h.getConference.mockResolvedValue({
      conference: { ...conference, checkinEventId: undefined },
      domain: 'localhost',
      error: null,
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Ticketing is not configured for this conference',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('an org the credential seam does not serve', async () => {
    h.credentials.mockResolvedValue(null)
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Ticketing is not configured for this conference',
    })
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it("another tenant's sponsor, before the provider or the sponsor is read", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.fetches.some((f) => f.query.includes('"linkedCodes"'))).toBe(false)
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('the input shape', () => {
  it('a discount send needs at least one code', async () => {
    await expect(
      sponsor().crm.sendCommunication({ ...INPUT, discountCodes: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('an information send may not carry codes', async () => {
    await expect(
      sponsor().crm.sendCommunication({ ...INPUT, kind: 'information' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.send).not.toHaveBeenCalled()
  })
})

/**
 * Discount code manager → Assign to sponsor: the same link, written without a
 * send, and logged on the sponsor's timeline.
 */
describe('sponsor.crm.assignDiscountCodes', () => {
  const ASSIGN = { sponsorForConferenceId: SFC, discountCodes: ['acme-2026'] }
  const assignLog = () =>
    h.creates.find((d) => d.activityType === 'discount_codes_assigned')

  it('stores the code on the sponsor, marked as assigned, and sends nothing', async () => {
    await expect(
      sponsor().crm.assignDiscountCodes(ASSIGN),
    ).resolves.toMatchObject({ success: true, linkedCodes: ['ACME-2026'] })
    expect(linkInserts()).toHaveLength(1)
    expect(linkInserts()[0].items).toEqual([
      expect.objectContaining({ code: 'ACME-2026', linkedVia: 'assign' }),
    ])
    expect(h.send).not.toHaveBeenCalled()
  })

  it('logs the assignment as an activity by the organizer', async () => {
    await sponsor().crm.assignDiscountCodes(ASSIGN)
    expect(assignLog()).toMatchObject({
      sponsorForConference: { _ref: SFC },
      description: 'Discount code ACME-2026 assigned',
      createdBy: { _ref: 'sp-admin' },
    })
  })

  it('logs nothing and writes nothing when the code is already stored', async () => {
    h.links[0].linkedCodes = ['ACME-2026']
    await expect(
      sponsor().crm.assignDiscountCodes(ASSIGN),
    ).resolves.toMatchObject({ linkedCodes: [] })
    expect(linkInserts()).toHaveLength(0)
    expect(assignLog()).toBeUndefined()
  })

  it('refuses a code stored on another sponsor', async () => {
    await expect(
      sponsor().crm.assignDiscountCodes({
        ...ASSIGN,
        discountCodes: ['GLOBEX-VIP'],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(h.inserts).toHaveLength(0)
    expect(assignLog()).toBeUndefined()
  })

  it('refuses a code that is not on the event', async () => {
    await expect(
      sponsor().crm.assignDiscountCodes({ ...ASSIGN, discountCodes: ['NOPE'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.inserts).toHaveLength(0)
  })

  it("refuses another tenant's sponsor before the provider is read", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(
      sponsor().crm.assignDiscountCodes(ASSIGN),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.inserts).toHaveLength(0)
  })

  it('surfaces a failed link write — nothing was sent, so nothing hides it', async () => {
    h.insertShouldThrow = true
    await expect(
      sponsor().crm.assignDiscountCodes(ASSIGN),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(assignLog()).toBeUndefined()
  })
})

/**
 * THE TICKETING KILL SWITCH (#850), carried over from the removed
 * `sendDiscountEmail` onto the discount KIND and the Assign action.
 *
 * Asserted on the exact message, not merely FORBIDDEN: `adminProcedure`'s
 * own waist also throws FORBIDDEN, and here the caller IS an organizer of the
 * request org, so only the switch can produce this error. The opposite
 * direction is pinned too — a ticketing deny is not a sponsor-contact ban —
 * and the positive controls succeed for real (rule 2 of
 * `features/ticketing.ts`: a community org with no plan keeps the surface).
 * The gate resolves through the REAL `platform-default` over a mocked
 * `getOrganizationById`.
 */
describe('an operator deny of ticketing (#850)', () => {
  const KILL_SWITCH =
    'The "ticketing" feature has been switched off for this organization'
  const deny = (extra: Record<string, unknown> = {}) =>
    h.getOrganizationById.mockResolvedValue({
      _id: ORG,
      name: 'CNDN',
      ...extra,
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })

  it('refuses a discount send with the kill-switch message, reading nothing', async () => {
    deny()
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: KILL_SWITCH,
    })
    expect(h.fetches).toHaveLength(0)
    expect(h.listDiscounts).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses a PAID org too — a deny beats the plan that sells ticketing', async () => {
    deny({ plan: 'pro' })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      message: KILL_SWITCH,
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses an Assign, writing nothing', async () => {
    deny()
    await expect(
      sponsor().crm.assignDiscountCodes({
        sponsorForConferenceId: SFC,
        discountCodes: ['ACME-2026'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: KILL_SWITCH })
    expect(h.fetches).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('leaves an information send alone — a ticketing deny is not a contact ban', async () => {
    deny()
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        kind: 'information',
        discountCodes: undefined,
      }),
    ).resolves.toMatchObject({ success: true })
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'an EXPIRED deny or a deny on another feature',
      () =>
        h.getOrganizationById.mockResolvedValue({
          _id: ORG,
          featureOverrides: [
            {
              feature: 'ticketing',
              enabled: false,
              expiresAt: '2020-01-01T00:00:00.000Z',
            },
            { feature: 'badges', enabled: false },
          ],
        }),
    ],
    [
      'a REJECTED organization read — an accident is not a decision',
      () =>
        h.getOrganizationById.mockRejectedValue(
          new Error('sanity unavailable'),
        ),
    ],
    [
      'the production shape — pro plan, no overrides',
      () =>
        h.getOrganizationById.mockResolvedValue({
          _id: ORG,
          plan: 'pro',
          featureOverrides: null,
        }),
    ],
  ])('still sends discount codes on %s', async (_label, arrange) => {
    arrange()
    await expect(sponsor().crm.sendCommunication(INPUT)).resolves.toMatchObject(
      { success: true },
    )
    expect(h.send).toHaveBeenCalledTimes(1)
  })
})

/**
 * What the Send modal's code picker offers: the event's codes, with the ones
 * attributed to THIS sponsor preselected (stored link first, the name
 * heuristic only for a sponsor that stores nothing) and the ones stored on
 * another sponsor marked so they cannot be picked.
 */
describe('sponsor.crm.discountCodeOptions', () => {
  const OPTIONS = { sponsorForConferenceId: SFC }

  const renameAcme = async (name: string) => {
    const { conference } = await h.getConference()
    h.getConference.mockResolvedValue({
      conference: {
        ...conference,
        sponsors: [
          { sponsor: { _id: 'sponsor-acme', name } },
          { sponsor: { _id: 'sponsor-globex', name: 'Globex' } },
        ],
      },
      domain: 'localhost',
      error: null,
    })
  }

  it('preselects by name for a sponsor that stores nothing, and marks codes stored elsewhere', async () => {
    await renameAcme('Acme')
    const result = await sponsor().crm.discountCodeOptions(OPTIONS)
    expect(result.ticketUrl).toBe(
      'https://tickets.example.test/sponsor?a=1&b=2',
    )
    expect(result.codes).toEqual([
      { code: 'ACME-2026', selected: true, linked: false },
      { code: 'ACME-WORKSHOP', selected: true, linked: false },
      {
        code: 'GLOBEX-VIP',
        selected: false,
        linked: false,
        linkedTo: 'Globex',
      },
      { code: '<b>X</b>', selected: false, linked: false },
    ])
  })

  it('preselects ONLY the stored codes once the sponsor stores any', async () => {
    await renameAcme('Acme')
    h.links[0].linkedCodes = ['acme-workshop']
    const result = await sponsor().crm.discountCodeOptions(OPTIONS)
    expect(result.codes.filter((c) => c.selected)).toEqual([
      { code: 'ACME-WORKSHOP', selected: true, linked: true },
    ])
  })

  it('says when a code is counted for ANOTHER sponsor by name, since sending it moves it', async () => {
    const { conference } = await h.getConference()
    h.getConference.mockResolvedValue({
      conference: {
        ...conference,
        sponsors: [
          { sponsor: { _id: 'sponsor-acme', name: 'Acme AS' } },
          { sponsor: { _id: 'sponsor-workshop', name: 'Workshop' } },
        ],
      },
      domain: 'localhost',
      error: null,
    })
    const result = await sponsor().crm.discountCodeOptions(OPTIONS)
    expect(result.codes.find((c) => c.code === 'ACME-WORKSHOP')).toEqual({
      code: 'ACME-WORKSHOP',
      selected: false,
      linked: false,
      attributedTo: 'Workshop',
    })
  })

  it('a CRM prospect that is not a conference sponsor never claims a code by name', async () => {
    // Same rule as the usage view and the entitlement count: the name
    // heuristic runs over the conference's sponsors only.
    await renameAcme('Acme')
    h.links.unshift({
      _id: 'sfc-prospect',
      sponsorId: 'sponsor-prospect',
      name: 'Ac',
      linkedCodes: null,
    })
    const result = await sponsor().crm.discountCodeOptions(OPTIONS)
    expect(result.codes.find((c) => c.code === 'ACME-2026')).toMatchObject({
      selected: true,
    })
  })

  it("refuses another tenant's sponsor before the provider is read", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(
      sponsor().crm.discountCodeOptions(OPTIONS),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.listDiscounts).not.toHaveBeenCalled()
  })

  it('is kill-switched like the send', async () => {
    h.getOrganizationById.mockResolvedValue({
      _id: ORG,
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
    await expect(
      sponsor().crm.discountCodeOptions(OPTIONS),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('switched off'),
    })
    expect(h.fetches).toHaveLength(0)
  })

  it('says so when the conference has no ticketing event', async () => {
    h.credentials.mockResolvedValue(null)
    await expect(
      sponsor().crm.discountCodeOptions(OPTIONS),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Ticketing is not configured for this conference',
    })
  })
})
