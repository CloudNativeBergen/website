/**
 * @vitest-environment node
 *
 * THE REGISTRATION KIND of `sponsor.crm.sendCommunication` (#1263).
 *
 * Through `createCaller`, with Sanity and the Resend sender mocked at the
 * boundary and the real render path between. The sponsor's portal link is
 * built from the EXISTING registration token — created once when absent and
 * never rotated — mailed in a server-built card, and listed on the record.
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
  fetches: [] as Array<{ query: string; params?: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  patches: [] as Array<{ id: string; sets: Record<string, unknown> }>,
  /** The token write (the `registrationToken` patch) fails. */
  tokenWriteShouldThrow: false,
  /** Another writer stores this token between our read and our write. */
  raceToken: null as string | null,
  /** A write lands between the status re-read and the flip patch. */
  bumpRevAfterStatusRead: false,
  send: vi.fn(),
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
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params?: Record<string, unknown>) => {
    h.fetches.push({ query, params })
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.includes('{ contractStatus, _rev }')) {
      const snapshot = {
        contractStatus:
          (h.sfc?.contractStatus as string | null | undefined) ?? null,
        _rev: (h.sfc?._rev as string) ?? 'rev-1',
      }
      if (h.bumpRevAfterStatusRead && h.sfc) h.sfc._rev = 'rev-2'
      return snapshot
    }
    if (query.includes('_type == "sponsorForConference"')) return h.sfc
    return null
  }
  const patch = (id: string) => {
    let sets: Record<string, unknown> = {}
    let ifMissing: Record<string, unknown> = {}
    let requiredRev: string | undefined
    const chain = {
      ifRevisionId: (rev: string) => {
        requiredRev = rev
        return chain
      },
      set: (v: Record<string, unknown>) => {
        sets = { ...sets, ...v }
        return chain
      },
      unset: () => chain,
      setIfMissing: (v: Record<string, unknown>) => {
        ifMissing = { ...ifMissing, ...v }
        return chain
      },
      commit: async () => {
        if ('registrationToken' in ifMissing && h.tokenWriteShouldThrow) {
          throw new Error('sanity down')
        }
        const doc = h.sfc && id === h.sfc._id ? h.sfc : {}
        if (requiredRev && (doc._rev ?? 'rev-1') !== requiredRev) {
          throw new Error(
            'Mutation(s) failed with 1 error(s): revision mismatch',
          )
        }
        // A concurrent writer landed first: Sanity keeps THEIR value.
        if ('registrationToken' in ifMissing && h.raceToken) {
          doc.registrationToken = h.raceToken
        }
        // `setIfMissing` only fills fields that are null/absent.
        const applied: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(ifMissing)) {
          if (doc[k] == null) applied[k] = v
        }
        const all = { ...applied, ...sets }
        h.patches.push({ id, sets: all })
        // The store the next read sees, as Sanity would — and the committed
        // document the client returns.
        Object.assign(doc, all)
        return { ...doc }
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
    delete: async () => ({}),
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
const DOMAIN = 'cloudnativebergen.dev'

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
  kind: 'registration' as const,
  recipientKeys: ['c-primary'],
  subject: 'Complete your sponsor registration',
  message: JSON.stringify([
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Welcome aboard.' }],
    },
  ]),
}

const tokenPatches = () =>
  h.patches.filter((p) => p.id === SFC && 'registrationToken' in p.sets)
const statusPatches = () =>
  h.patches.filter((p) => p.id === SFC && 'contractStatus' in p.sets)
const record = () =>
  h.creates.find((d) => d._type === 'sponsorActivity' && d.communicationKind)
const sentHtml = () => h.send.mock.calls[0][0].html as string
const portalUrl = (token: string) => `https://${DOMAIN}/sponsor/portal/${token}`

beforeEach(() => {
  vi.clearAllMocks()
  h.fetches = []
  h.creates = []
  h.patches = []
  h.tokenWriteShouldThrow = false
  h.raceToken = null
  h.bumpRevAfterStatusRead = false
  h.tenant = { _type: 'sponsorForConference', conferenceId: CONF }
  h.sfc = {
    _id: SFC,
    status: 'closed-won',
    contractStatus: 'none',
    registrationToken: null,
    registrationComplete: false,
    contactPersons: [
      {
        _key: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        isPrimary: true,
      },
      { _key: 'c-billing', name: 'Ola Nordmann', email: 'ola@acme.test' },
    ],
    sponsor: { name: 'Acme AS' },
    tier: { title: 'Gold' },
  }
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organizer: 'CNDN',
      organization: { _ref: ORG },
      sponsorEmail: 'sponsors@example.test',
      city: 'Bergen',
      country: 'Norway',
      startDate: '2026-10-28',
      domains: [DOMAIN],
    },
    domain: DOMAIN,
    error: null,
  })
  h.getOrganizationById.mockResolvedValue({ _id: ORG, name: 'CNDN' })
  h.send.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the registration token', () => {
  it('is created ONCE for a sponsor without one, and the link in the email is built from it', async () => {
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, recipientCount: 1 })

    expect(tokenPatches()).toHaveLength(1)
    const token = tokenPatches()[0].sets.registrationToken as string
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentHtml()).toContain(portalUrl(token))
  })

  it('is REUSED on the second send — the link already in the first inbox keeps working', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    const first = tokenPatches()[0].sets.registrationToken as string

    await sponsor().crm.sendCommunication({
      ...INPUT,
      recipientKeys: ['c-billing'],
    })

    expect(tokenPatches()).toHaveLength(1)
    expect(h.send).toHaveBeenCalledTimes(2)
    expect(h.send.mock.calls[1][0].to).toEqual(['ola@acme.test'])
    expect(h.send.mock.calls[1][0].html).toContain(portalUrl(first))
  })

  it('is never rotated when one already exists', async () => {
    h.sfc!.registrationToken = 'tok-existing'
    await sponsor().crm.sendCommunication(INPUT)

    expect(tokenPatches()).toEqual([])
    expect(sentHtml()).toContain(portalUrl('tok-existing'))
  })

  it('loses a first-mint race gracefully — the email carries the token that is STORED, not the one we minted', async () => {
    h.raceToken = 'tok-raced'
    await sponsor().crm.sendCommunication(INPUT)

    // Our own uuid was never stored; the racing writer's token is.
    expect(h.sfc!.registrationToken).toBe('tok-raced')
    expect(sentHtml()).toContain(portalUrl('tok-raced'))
    expect(sentHtml()).not.toMatch(/portal\/[0-9a-f-]{36}/)
  })

  it('refuses before the provider when the token cannot be written', async () => {
    h.tokenWriteShouldThrow = true
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'sanity down',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(record()).toBeUndefined()
  })
})

describe('a portal placeholder left by the composer', () => {
  it('is merged on the server — subject and body — so no sponsor receives it', async () => {
    h.sfc!.registrationToken = 'tok-existing'
    await sponsor().crm.sendCommunication({
      ...INPUT,
      subject: 'Register at {{{SPONSOR_PORTAL_URL}}}',
      message: JSON.stringify([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's1',
              text: 'Your link: {{{SPONSOR_PORTAL_URL}}} today',
            },
          ],
        },
      ]),
    })
    const sent = h.send.mock.calls[0][0]
    expect(sent.subject).toBe(`Register at ${portalUrl('tok-existing')}`)
    expect(sent.html).not.toContain('{{{SPONSOR_PORTAL_URL}}}')
    // Merged AND linked, with the surrounding text intact.
    expect(sent.html).toContain(`href="${portalUrl('tok-existing')}"`)
    expect(sent.html).toMatch(/Your link: .*tok-existing.* today/)
    expect(record()!.subject).toBe(`Register at ${portalUrl('tok-existing')}`)
    expect(record()!.body).not.toContain('{{{SPONSOR_PORTAL_URL}}}')
  })
})

describe('a message already merged once in the composer', () => {
  // The key-collision guard itself is pinned in __tests__/lib/sponsor/templates.test.ts;
  // this is the end-to-end shape through the real renderer.
  it('keeps the existing link AND links the portal URL', async () => {
    h.sfc!.registrationToken = 'tok-existing'
    await sponsor().crm.sendCommunication({
      ...INPUT,
      message: JSON.stringify([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          markDefs: [
            { _key: 'tpl-1', _type: 'link', href: 'https://conf.example' },
          ],
          children: [
            { _type: 'span', _key: 'tpl-2', text: 'Site ', marks: [] },
            {
              _type: 'span',
              _key: 'tpl-3',
              text: 'https://conf.example',
              marks: ['tpl-1'],
            },
            {
              _type: 'span',
              _key: 'tpl-4',
              text: ' and portal {{{SPONSOR_PORTAL_URL}}}',
              marks: [],
            },
          ],
        },
      ]),
    })
    const html = sentHtml()
    expect(html).toContain('href="https://conf.example"')
    expect(html).toContain(`href="${portalUrl('tok-existing')}"`)
    // The portal text is linked to the portal, not to the first link.
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="${portalUrl('tok-existing')}"[^>]*>${portalUrl('tok-existing')}</a>`,
      ),
    )
  })
})

describe('the record', () => {
  it('lists the portal link under attachments', async () => {
    h.sfc!.registrationToken = 'tok-existing'
    await sponsor().crm.sendCommunication(INPUT)

    expect(record()).toMatchObject({
      communicationKind: 'registration',
      deliveryStatus: 'sent',
      providerMessageId: 'resend-msg-1',
      attachments: [
        expect.objectContaining({ url: portalUrl('tok-existing') }),
      ],
    })
    // The body as sent carries the card the server appended.
    expect(record()!.body).toContain(portalUrl('tok-existing'))
  })
})

describe('completed registration', () => {
  it('still sends, reusing the token, and writes a sent record', async () => {
    h.sfc!.registrationToken = 'tok-existing'
    h.sfc!.registrationComplete = true
    const result = await sponsor().crm.sendCommunication(INPUT)

    expect(result).toMatchObject({ success: true })
    expect(tokenPatches()).toEqual([])
    expect(sentHtml()).toContain(portalUrl('tok-existing'))
    expect(record()).toMatchObject({ deliveryStatus: 'sent' })
  })

  it('refuses when registration is complete and no token was ever issued — there is no link to send', async () => {
    h.sfc!.registrationComplete = true
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/already complete/),
    })
    expect(tokenPatches()).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('the contract status', () => {
  it('moves to registration-sent after the provider accepted the send, with a status-change activity', async () => {
    await sponsor().crm.sendCommunication(INPUT)

    expect(statusPatches()).toEqual([
      { id: SFC, sets: { contractStatus: 'registration-sent' } },
    ])
    expect(
      h.creates.find((d) => d.activityType === 'contract_status_change'),
    ).toMatchObject({
      createdBy: { _ref: 'sp-admin' },
    })
  })

  it('is never moved backwards by a contract send that landed during the email round-trip', async () => {
    h.send.mockImplementation(async () => {
      // Another tab sent the contract while the provider was busy.
      h.sfc!.contractStatus = 'contract-sent'
      return { data: { id: 'resend-msg-1' }, error: null }
    })
    await sponsor().crm.sendCommunication(INPUT)
    expect(statusPatches()).toEqual([])
    expect(
      h.creates.find((d) => d.activityType === 'contract_status_change'),
    ).toBeUndefined()
  })

  it('is left alone when a write lands between the status re-read and the flip — the patch is revision-conditional', async () => {
    h.bumpRevAfterStatusRead = true
    const result = await sponsor().crm.sendCommunication(INPUT)
    // The send itself is unaffected.
    expect(result).toMatchObject({ success: true })
    expect(statusPatches()).toEqual([])
    expect(
      h.creates.find((d) => d.activityType === 'contract_status_change'),
    ).toBeUndefined()
  })

  it('is left alone when the deal is already further along', async () => {
    h.sfc!.contractStatus = 'contract-sent'
    await sponsor().crm.sendCommunication(INPUT)
    expect(statusPatches()).toEqual([])
  })

  it('is left alone, and a failed record written, when the provider refused', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(statusPatches()).toEqual([])
    expect(record()).toMatchObject({ deliveryStatus: 'failed', error: 'boom' })
  })
})

describe('refusals', () => {
  it('refuses a sponsor whose deal is not won — before any token is minted', async () => {
    h.sfc!.status = 'negotiation'
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/Closed Won/),
    })
    expect(tokenPatches()).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses to send from localhost — the link would be a localhost bearer URL', async () => {
    h.getConference.mockResolvedValue({
      ...(await h.getConference()),
      domain: 'localhost:3000',
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/localhost/),
    })
    expect(tokenPatches()).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses a foreign sponsor before reading it', async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      h.fetches.filter((f) => f.query.includes('registrationToken')),
    ).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses discount codes on a registration send', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        discountCodes: ['ACME-2026'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.send).not.toHaveBeenCalled()
  })
})
