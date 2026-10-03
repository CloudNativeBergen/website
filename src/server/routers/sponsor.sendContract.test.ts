/**
 * @vitest-environment node
 *
 * THE CONTRACT KIND of `sponsor.crm.sendCommunication` (#1264).
 *
 * Through `createCaller`, with Sanity, the Resend sender, the PDF renderer
 * and the signing provider mocked at the boundary and the real render path
 * between. One action, three effects by state: first send (readiness →
 * PDF → agreement → email → contract-sent), reminder (same signing link,
 * no new agreement, reminderCount + 1) and signed copy (the stored document).
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
  /** Tenant answers per probed id (contract templates). */
  tenantById: {} as Record<string, Record<string, unknown> | null>,
  /** The expanded sponsor the scoped read returns. */
  sfc: null as Record<string, unknown> | null,
  fetches: [] as Array<{ query: string; params?: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  patches: [] as Array<{ id: string; sets: Record<string, unknown> }>,
  uploads: [] as Array<{ filename: string; bytes: number }>,
  send: vi.fn(),
  generatePdf: vi.fn(),
  getContractTemplate: vi.fn(),
  findBestContractTemplate: vi.fn(),
  sendForSigning: vi.fn(),
  getTemplate: vi.fn(),
  getTemplateBySlug: vi.fn(),
}))

vi.mock('@/lib/sponsor/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getSponsorEmailTemplate: h.getTemplate,
  getSponsorEmailTemplateBySlug: h.getTemplateBySlug,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: async () => 'org-ref',
  getOrganizationRefViaParentConference: async () => 'org-ref',
  organizationField: (ref: string | null) =>
    ref ? { organization: { _type: 'reference', _ref: ref } } : {},
}))
vi.mock('@/lib/sponsor-crm/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getSponsorForConference: async () => ({ sponsorForConference: h.sfc }),
}))
vi.mock('@/lib/sponsor-crm/contract-templates', () => ({
  getContractTemplate: h.getContractTemplate,
  findBestContractTemplate: h.findBestContractTemplate,
}))
vi.mock('@/lib/sponsor-crm/contract-pdf', () => ({
  generateContractPdf: h.generatePdf,
}))
vi.mock('@/lib/contract-signing', () => ({
  getSigningProvider: () => ({ sendForSigning: h.sendForSigning }),
}))
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params?: Record<string, unknown>) => {
    h.fetches.push({ query, params })
    if (query.includes('"memberOrgIds"')) {
      const id = params?.id as string
      if (id in h.tenantById) return h.tenantById[id]
      return h.tenant
    }
    if (query.includes('{ contractStatus, _rev }')) {
      return {
        contractStatus: h.sfc?.contractStatus ?? null,
        _rev: 'rev-1',
      }
    }
    if (query.includes('_type == "sponsorForConference"')) return h.sfc
    return null
  }
  const patch = (id: string) => {
    let sets: Record<string, unknown> = {}
    const chain = {
      ifRevisionId: () => chain,
      set: (v: Record<string, unknown>) => {
        sets = { ...sets, ...v }
        return chain
      },
      setIfMissing: () => chain,
      unset: () => chain,
      inc: (v: Record<string, number>) => {
        for (const [k, by] of Object.entries(v)) {
          sets[k] = ((h.sfc?.[k] as number | undefined) ?? 0) + by
        }
        return chain
      },
      commit: async () => {
        h.patches.push({ id, sets })
        if (h.sfc && id === h.sfc._id) Object.assign(h.sfc, sets)
        return { ...sets }
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
    assets: {
      upload: async (
        _kind: string,
        buf: Buffer,
        opts: { filename: string },
      ) => {
        h.uploads.push({ filename: opts.filename, bytes: buf.length })
        return { _id: 'file-asset-1' }
      },
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
const DOMAIN = 'cloudnativebergen.dev'
const SIGNING_URL = `https://${DOMAIN}/sponsor/contract/sign/agr-1`

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
  kind: 'contract' as const,
  recipientKeys: ['c-primary'],
  subject: 'Sponsorship Agreement',
  message: JSON.stringify([
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'Please sign.' }],
    },
  ]),
}

const record = () =>
  h.creates.find((d) => d._type === 'sponsorActivity' && d.communicationKind)
const activities = (type: string) =>
  h.creates.filter((d) => d.activityType === type)
const sfcPatches = () => h.patches.filter((p) => p.id === SFC)
const sentHtml = () => h.send.mock.calls[0][0].html as string

const conference = () => ({
  _id: CONF,
  title: 'Cloud Native Days Bergen',
  organizer: 'CNDN',
  organization: { _ref: ORG },
  sponsorEmail: 'sponsors@example.test',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-28',
  endDate: '2026-10-29',
  domains: [DOMAIN],
})

beforeEach(() => {
  vi.clearAllMocks()
  h.fetches = []
  h.creates = []
  h.patches = []
  h.uploads = []
  h.tenant = { _type: 'sponsorForConference', conferenceId: CONF }
  h.tenantById = { 'tpl-A': { _type: 'contractTemplate', conferenceId: CONF } }
  h.sfc = {
    _id: SFC,
    status: 'negotiating',
    contractStatus: 'none',
    signatureStatus: 'not-started',
    contractValue: 50_000,
    contractCurrency: 'NOK',
    registrationComplete: true,
    contactPersons: [
      {
        _key: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        isPrimary: true,
      },
      { _key: 'c-billing', name: 'Ola Nordmann', email: 'ola@acme.test' },
    ],
    sponsor: {
      _id: 'sponsor-acme',
      name: 'Acme AS',
      orgNumber: '123456789',
      address: 'Street 1',
      website: 'https://acme.test',
    },
    tier: { _id: 'tier-gold', title: 'Gold', tagline: 'Top' },
    conference: conference(),
  }
  h.getConference.mockResolvedValue({
    conference: conference(),
    domain: DOMAIN,
    error: null,
  })
  h.getOrganizationById.mockResolvedValue({ _id: ORG, name: 'CNDN' })
  h.getTemplate.mockResolvedValue({ template: undefined })
  h.getTemplateBySlug.mockResolvedValue({ template: undefined })
  h.getContractTemplate.mockResolvedValue({
    template: { _id: 'tpl-A', title: 'Standard', language: 'en' },
  })
  h.findBestContractTemplate.mockResolvedValue({
    template: { _id: 'tpl-A', title: 'Standard', language: 'en' },
  })
  h.generatePdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'))
  h.sendForSigning.mockResolvedValue({
    agreementId: 'agr-1',
    signingUrl: SIGNING_URL,
  })
  h.send.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('first send', () => {
  it('generates the PDF, creates the agreement for the signer, mails the signing link and moves the deal to contract-sent', async () => {
    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      recipientKeys: ['c-primary', 'c-billing'],
      signerKey: 'c-billing',
      contractTemplateId: 'tpl-A',
    })
    expect(result).toMatchObject({ success: true, recipientCount: 2 })

    expect(h.generatePdf).toHaveBeenCalledTimes(1)
    expect(h.uploads).toEqual([
      { filename: 'contract-acme-as.pdf', bytes: expect.any(Number) },
    ])
    expect(h.sendForSigning).toHaveBeenCalledWith(
      expect.objectContaining({
        signerEmail: 'ola@acme.test',
        baseUrl: `https://${DOMAIN}`,
      }),
    )
    expect(h.send.mock.calls[0][0].to).toEqual([
      'kari@acme.test',
      'ola@acme.test',
    ])
    expect(sentHtml()).toContain(`href="${SIGNING_URL}"`)

    const flip = sfcPatches().find((p) => 'contractStatus' in p.sets)
    expect(flip?.sets).toMatchObject({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerEmail: 'ola@acme.test',
      signerName: 'Ola Nordmann',
      contractTemplate: { _ref: 'tpl-A' },
      contractDocument: { asset: { _ref: 'file-asset-1' } },
    })
    expect(activities('contract_status_change')).toHaveLength(1)
    expect(activities('signature_status_change')).toHaveLength(1)
    // Sending a contract advances the deal to Won (a query-conditional patch).
    expect(h.patches.some((p) => p.sets.status === 'closed-won')).toBe(true)

    expect(record()).toMatchObject({
      communicationKind: 'contract',
      deliveryStatus: 'sent',
      attachments: [expect.objectContaining({ url: SIGNING_URL })],
    })
  })

  it('defaults the signer to the primary recipient when none is named', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.sendForSigning).toHaveBeenCalledWith(
      expect.objectContaining({ signerEmail: 'kari@acme.test' }),
    )
  })

  it('refuses before PDF, agreement or send when readiness fails, naming what is missing', async () => {
    h.sfc!.tier = undefined
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/Sponsor tier/),
    })
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
    expect(sfcPatches()).toEqual([])
    expect(record()).toBeUndefined()
  })

  it('leaves the status unchanged and writes a failed record when the provider refuses', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(sfcPatches().some((p) => 'contractStatus' in p.sets)).toBe(false)
    expect(activities('contract_status_change')).toEqual([])
    expect(record()).toMatchObject({
      communicationKind: 'contract',
      deliveryStatus: 'failed',
      error: 'boom',
    })
  })

  it('refuses a foreign contract template before it is read', async () => {
    h.tenantById['tpl-B'] = {
      _type: 'contractTemplate',
      conferenceId: 'conf-other',
    }
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        contractTemplateId: 'tpl-B',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getContractTemplate).not.toHaveBeenCalled()
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('falls back to the best template for the tier when none is named', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.findBestContractTemplate).toHaveBeenCalledWith(CONF, 'tier-gold')
    expect(h.getContractTemplate).toHaveBeenCalledWith('tpl-A')
  })

  it('refuses a signer who is not among the recipients', async () => {
    await expect(
      sponsor().crm.sendCommunication({ ...INPUT, signerKey: 'c-billing' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('reminder', () => {
  beforeEach(() => {
    Object.assign(h.sfc!, {
      status: 'closed-won',
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerEmail: 'kari@acme.test',
      signerName: 'Kari Nordmann',
      reminderCount: 1,
    })
  })

  it('reuses the signing URL, creates no agreement and increments reminderCount', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(sentHtml()).toContain(`href="${SIGNING_URL}"`)
    expect(sfcPatches()).toEqual([{ id: SFC, sets: { reminderCount: 2 } }])
    expect(record()).toMatchObject({
      communicationKind: 'contract',
      attachments: [expect.objectContaining({ url: SIGNING_URL })],
    })
  })

  it('does not count a reminder the provider refused', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(sfcPatches()).toEqual([])
    expect(record()).toMatchObject({ deliveryStatus: 'failed' })
  })
})

describe('signed copy', () => {
  const DOC_URL = 'https://cdn.sanity.io/files/abc/prod/signed.pdf'
  beforeEach(() => {
    Object.assign(h.sfc!, {
      status: 'closed-won',
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      contractDocument: { asset: { _ref: 'file-1', url: DOC_URL } },
    })
  })

  it('links the stored signed document and changes nothing on the deal', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(sentHtml()).toContain(`href="${DOC_URL}"`)
    expect(sfcPatches()).toEqual([])
    expect(record()).toMatchObject({
      attachments: [
        expect.objectContaining({ label: 'Signed agreement', url: DOC_URL }),
      ],
    })
  })

  it('refuses when no signed document is stored', async () => {
    h.sfc!.contractDocument = undefined
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/signed/i),
    })
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('refusals', () => {
  it('refuses a foreign sponsor before reading it', async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses contract-only fields on another kind', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        kind: 'information',
        signerKey: 'c-primary',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.send).not.toHaveBeenCalled()
  })
})
