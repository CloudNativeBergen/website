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
  /** A write lands between the reservation read and the reservation patch. */
  bumpRevAfterStateRead: false,
  /** Unsets, recorded apart from sets. */
  unsets: [] as Array<{ id: string; fields: string[] }>,
  /** Every boundary event in order: reserve / send / flip. */
  sequence: [] as string[],
  /** The flip patch (contractStatus) fails. */
  flipShouldThrow: false,
  /** Someone else's contract send completes right before the fresh read. */
  sentByOtherAtFreshRead: false,
  /** The terms the fresh read reports (changed since the request's own read). */
  termsAtFreshRead: null as { contractValue?: number; tierId?: string } | null,
  fetches: [] as Array<{ query: string; params?: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  patches: [] as Array<{ id: string; sets: Record<string, unknown> }>,
  /** Atomic increments, recorded apart from plain sets. */
  incs: [] as Array<{ id: string; field: string; by: number }>,
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
vi.mock('@/lib/pdf/signature-embed', () => ({
  // The real embedder needs a real PDF; the provenance it stamps is what is tested.
  embedSignatureInPdfBuffer: async (buf: Buffer) => buf,
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
    if (query.includes('signatureId, status, tier->{ _id }, contractValue }')) {
      return {
        _rev: (h.sfc?._rev as string) ?? 'rev-1',
        contractStatus: h.sfc?.contractStatus ?? null,
        signatureStatus: h.sfc?.signatureStatus ?? null,
        signatureId: h.sfc?.signatureId ?? null,
        status: h.sfc?.status ?? null,
        tier: h.sfc?.tier ?? null,
        contractValue: h.sfc?.contractValue ?? null,
      }
    }
    if (query.includes('"tierId": tier._ref }')) {
      if (h.sentByOtherAtFreshRead && h.sfc) {
        Object.assign(h.sfc, {
          contractStatus: 'contract-sent',
          signatureStatus: 'pending',
          signatureId: 'agr-other',
          signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-other`,
        })
      }
      const snapshot = {
        _rev: (h.sfc?._rev as string) ?? 'rev-1',
        contractStatus: h.sfc?.contractStatus ?? null,
        signatureStatus: h.sfc?.signatureStatus ?? null,
        signatureId: h.sfc?.signatureId ?? null,
        signingUrl: h.sfc?.signingUrl ?? null,
        contractReservedAt: h.sfc?.contractReservedAt ?? null,
        contractReservedTerms: h.sfc?.contractReservedTerms ?? null,
        contractValue:
          h.termsAtFreshRead?.contractValue ?? h.sfc?.contractValue ?? null,
        contractCurrency: h.sfc?.contractCurrency ?? null,
        tierId:
          h.termsAtFreshRead?.tierId ??
          (h.sfc?.tier as { _id?: string } | undefined)?._id ??
          null,
      }
      if (h.bumpRevAfterStateRead && h.sfc) h.sfc._rev = 'rev-2'
      return snapshot
    }
    if (query.includes('signingUrl, contractReservedAt }')) {
      if (h.sentByOtherAtFreshRead && h.sfc) {
        Object.assign(h.sfc, {
          contractStatus: 'contract-sent',
          signatureStatus: 'pending',
          signatureId: 'agr-other',
          signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-other`,
        })
      }
      const snapshot = {
        _rev: (h.sfc?._rev as string) ?? 'rev-1',
        contractStatus: h.sfc?.contractStatus ?? null,
        signatureStatus: h.sfc?.signatureStatus ?? null,
        signatureId: h.sfc?.signatureId ?? null,
        signingUrl: h.sfc?.signingUrl ?? null,
        contractReservedAt: h.sfc?.contractReservedAt ?? null,
      }
      if (h.bumpRevAfterStateRead && h.sfc) h.sfc._rev = 'rev-2'
      return snapshot
    }
    if (query.includes('_type == "sponsorForConference"')) return h.sfc
    return null
  }
  const patch = (
    selection: string | { query: string; params: Record<string, unknown> },
  ) => {
    // A query-based patch (the release, the closed-won promotion) applies to
    // the sponsor only when its predicate holds against the current document.
    const id =
      typeof selection === 'string'
        ? selection
        : selection.query.includes('signatureId == $ours')
          ? h.sfc &&
            h.sfc.signatureId === selection.params.ours &&
            (!selection.query.includes('contractReservedAt == $reservedAt') ||
              h.sfc.contractReservedAt === selection.params.reservedAt) &&
            (!selection.query.includes('signatureStatus == "not-started"') ||
              h.sfc.signatureStatus === 'not-started')
            ? (selection.params.id as string)
            : 'no-match'
          : (selection as unknown as string)
    let sets: Record<string, unknown> = {}
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
      setIfMissing: () => chain,
      unset: (fields: string[]) => {
        h.unsets.push({ id, fields })
        for (const f of fields) if (h.sfc && id === h.sfc._id) delete h.sfc[f]
        return chain
      },
      inc: (v: Record<string, number>) => {
        for (const [k, by] of Object.entries(v)) {
          h.incs.push({ id, field: k, by })
          sets[k] = ((h.sfc?.[k] as number | undefined) ?? 0) + by
        }
        return chain
      },
      commit: async () => {
        if (
          requiredRev &&
          h.sfc &&
          id === h.sfc._id &&
          ((h.sfc._rev as string) ?? 'rev-1') !== requiredRev
        ) {
          throw new Error(
            'Mutation(s) failed with 1 error(s): revision mismatch',
          )
        }
        if ('signatureId' in sets) h.sequence.push('reserve')
        if ('contractStatus' in sets) {
          if (h.flipShouldThrow) throw new Error('sanity down')
          h.sequence.push('flip')
        }
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
  h.incs = []
  h.unsets = []
  h.sequence = []
  h.flipShouldThrow = false
  h.sentByOtherAtFreshRead = false
  h.termsAtFreshRead = null
  h.bumpRevAfterStateRead = false
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
  h.send.mockImplementation(async () => {
    h.sequence.push('send')
    return { data: { id: 'resend-msg-1' }, error: null }
  })
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

    // The agreement is STORED before the email goes out (the signing page
    // resolves the token through it); the deal flips only after.
    expect(h.sequence).toEqual(['reserve', 'send', 'flip'])
    const reserve = sfcPatches().find((p) => 'signatureId' in p.sets)
    expect(reserve?.sets).toMatchObject({
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerEmail: 'ola@acme.test',
      signerName: 'Ola Nordmann',
      contractTemplate: { _ref: 'tpl-A' },
      contractDocument: { asset: { _ref: 'file-asset-1' } },
      contractReservedAt: expect.any(String),
    })
    const flip = sfcPatches().find((p) => 'contractStatus' in p.sets)
    expect(flip?.sets).toMatchObject({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
    })
    expect(h.unsets).toContainEqual({
      id: SFC,
      fields: ['contractReservedAt', 'contractReservedTerms'],
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

  it('leaves the status unchanged, releases the reserved agreement and writes a failed record when the provider refuses', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(sfcPatches().some((p) => 'contractStatus' in p.sets)).toBe(false)
    expect(activities('contract_status_change')).toEqual([])
    // Nothing went out: the token that was never mailed is gone again.
    expect(h.unsets).toContainEqual({
      id: SFC,
      fields: expect.arrayContaining([
        'signatureId',
        'signingUrl',
        'contractReservedAt',
      ]),
    })
    expect(h.sfc!.signatureId).toBeUndefined()
    expect(record()).toMatchObject({
      communicationKind: 'contract',
      deliveryStatus: 'failed',
      error: 'boom',
    })
  })

  it('never flips back a signature completed through the reserved link while the provider was busy', async () => {
    h.send.mockImplementation(async () => {
      // The sponsor opened the stored link and signed before the email even landed.
      Object.assign(h.sfc!, {
        contractStatus: 'contract-signed',
        signatureStatus: 'signed',
        contractSignedBy: 'Kari Nordmann',
      })
      return { data: { id: 'resend-msg-1' }, error: null }
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(result).not.toHaveProperty('contractStateFailed')
    expect(h.sfc!.signatureStatus).toBe('signed')
    expect(h.sfc!.contractStatus).toBe('contract-signed')
    expect(sfcPatches().some((p) => p.sets.signatureStatus === 'pending')).toBe(
      false,
    )
    expect(activities('contract_status_change')).toEqual([])
  })

  it('does not flip when a later send has replaced the stored agreement meanwhile, and tells the organizer', async () => {
    h.send.mockImplementation(async () => {
      // A very slow provider call: another send reserved after the settle window.
      Object.assign(h.sfc!, {
        signatureId: 'agr-later',
        signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-later`,
      })
      return { data: { id: 'resend-msg-1' }, error: null }
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, contractStateFailed: true })
    expect(h.sfc!.contractStatus).toBe('none')
    expect(sfcPatches().some((p) => 'contractStatus' in p.sets)).toBe(false)
  })

  it('does not move a deal that was closed-lost during the send, and tells the organizer', async () => {
    h.send.mockImplementation(async () => {
      Object.assign(h.sfc!, { status: 'closed-lost' })
      return { data: { id: 'resend-msg-1' }, error: null }
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, contractStateFailed: true })
    expect(h.sfc!.contractStatus).toBe('none')
    expect(sfcPatches().some((p) => 'contractStatus' in p.sets)).toBe(false)
  })

  it('a reused agreement survives a refused retry — the link already delivered stays valid', async () => {
    const STALE_URL = `https://${DOMAIN}/sponsor/contract/sign/agr-stale`
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: STALE_URL,
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      contractReservedTerms: '50000|NOK|tier-gold',
    })
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(h.sfc!.signatureId).toBe('agr-stale')
    expect(h.sfc!.signingUrl).toBe(STALE_URL)
    // The reservation still looks unflipped (its original marker), so the
    // next retry reuses it instead of minting over it.
    expect(typeof h.sfc!.contractReservedAt).toBe('string')
  })

  it('never stamps a counter-signature on a reused agreement (the stored PDF was not re-embedded)', async () => {
    h.sfc!.assignedTo = { _id: 'sp-admin', name: 'Admin', email: 'a@x' }
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-stale`,
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      contractReservedTerms: '50000|NOK|tier-gold',
    })
    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      organizerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })
    expect(result).toMatchObject({ success: true })
    expect(h.sfc!.organizerSignedBy).toBeUndefined()
    expect(h.sfc!.contractStatus).toBe('contract-sent')
  })

  it('issues a FRESH agreement after a rejected or expired signature — never reuses the old token or PDF', async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'contract-sent',
      signatureStatus: 'rejected',
      signatureId: 'agr-rejected',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-rejected`,
      // No in-flight marker: that agreement went through the flip.
      contractReservedAt: undefined,
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.generatePdf).toHaveBeenCalledTimes(1)
    expect(h.sendForSigning).toHaveBeenCalledTimes(1)
    expect(h.sfc!.signatureId).toBe('agr-1')
    expect(sentHtml()).toContain(`href="${SIGNING_URL}"`)
  })

  it('a late failure never clears a later attempt that reused the same agreement', async () => {
    h.send.mockImplementation(async () => {
      // Attempt B reused OUR agreement (same id) with its own marker and sent.
      Object.assign(h.sfc!, { contractReservedAt: '2099-01-01T00:00:00.000Z' })
      return { data: null, error: { message: 'boom', statusCode: 500 } }
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(h.sfc!.signatureId).toBe('agr-1')
    expect(h.sfc!.signingUrl).toBe(SIGNING_URL)
  })

  it('a reused agreement keeps its persisted signer, and refuses a different one', async () => {
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-stale`,
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      contractReservedTerms: '50000|NOK|tier-gold',
      signerName: 'Kari Nordmann',
      signerEmail: 'kari@acme.test',
    })
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        recipientKeys: ['c-primary', 'c-billing'],
        signerKey: 'c-billing',
      }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/already issued to kari@acme.test/),
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sfc!.signerEmail).toBe('kari@acme.test')

    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      recipientKeys: ['c-primary', 'c-billing'],
    })
    expect(result).toMatchObject({ success: true })
    expect(h.sfc!.signerEmail).toBe('kari@acme.test')
    expect(h.sendForSigning).not.toHaveBeenCalled()
  })

  it('a refused reuse-retry leaves the reservation reusable — the next retry still sends the same link', async () => {
    const STALE_URL = `https://${DOMAIN}/sponsor/contract/sign/agr-stale`
    const STALE_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: STALE_URL,
      contractReservedAt: STALE_AT,
      contractReservedTerms: '50000|NOK|tier-gold',
    })
    h.send.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(h.sfc!.contractReservedAt).toBe(STALE_AT)
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.sfc!.signatureId).toBe('agr-stale')
    expect(h.send.mock.calls[1][0].html).toContain(`href="${STALE_URL}"`)
  })

  it('keeps the counter-signature provenance with the reserved PDF, so a reuse after a failed flip still carries it', async () => {
    h.sfc!.assignedTo = { _id: 'sp-admin', name: 'Admin', email: 'a@x' }
    h.flipShouldThrow = true
    const first = await sponsor().crm.sendCommunication({
      ...INPUT,
      organizerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })
    expect(first).toMatchObject({ success: true, contractStateFailed: true })
    expect(h.sfc!.organizerSignedBy).toBe('Admin')
    // Past the settle window, the retry reuses the counter-signed PDF.
    h.sfc!.contractReservedAt = new Date(
      Date.now() - 60 * 60 * 1000,
    ).toISOString()
    h.sfc!.contractReservedTerms = '50000|NOK|tier-gold'
    h.flipShouldThrow = false
    const second = await sponsor().crm.sendCommunication(INPUT)
    expect(second).toMatchObject({ success: true })
    expect(h.generatePdf).toHaveBeenCalledTimes(1)
    expect(h.sfc!.organizerSignedBy).toBe('Admin')
    expect(h.sfc!.contractStatus).toBe('contract-sent')
  })

  it('refuses a stale composer: opened for a reminder, submitted after the sponsor signed', async () => {
    Object.assign(h.sfc!, {
      status: 'closed-won',
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      contractSignedBy: 'Kari Nordmann',
      contractDocument: { asset: { _ref: 'file-1', url: 'https://cdn/x.pdf' } },
    })
    await expect(
      sponsor().crm.sendCommunication({ ...INPUT, contractAction: 'remind' }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/state changed since/),
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('never reactivates an agreement an organizer rejected while the provider was busy', async () => {
    h.send.mockImplementation(async () => {
      Object.assign(h.sfc!, { signatureStatus: 'rejected' })
      return { data: { id: 'resend-msg-1' }, error: null }
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, contractStateFailed: true })
    expect(h.sfc!.signatureStatus).toBe('rejected')
    expect(h.sfc!.contractStatus).toBe('none')
  })

  it('a replacement for a rejected agreement is signable from the moment it is stored, even if the flip fails', async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'contract-sent',
      signatureStatus: 'rejected',
      signatureId: 'agr-rejected',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-rejected`,
      contractReservedAt: undefined,
    })
    h.flipShouldThrow = true
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, contractStateFailed: true })
    const reserve = sfcPatches().find((p) => 'signatureId' in p.sets)
    expect(reserve?.sets).toMatchObject({
      signatureId: 'agr-1',
      signatureStatus: 'not-started',
    })
    expect(h.sfc!.signatureStatus).toBe('not-started')
    expect(h.sfc!.signatureId).toBe('agr-1')
  })

  it('never reuses an agreement revoked during its send — the next send issues a fresh one', async () => {
    Object.assign(h.sfc!, {
      signatureId: 'agr-revoked',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-revoked`,
      signatureStatus: 'rejected',
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      contractReservedTerms: '50000|NOK|tier-gold',
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.sendForSigning).toHaveBeenCalledTimes(1)
    expect(h.sfc!.signatureId).toBe('agr-1')
    expect(h.sfc!.signatureStatus).toBe('pending')
    expect(sentHtml()).toContain(`href="${SIGNING_URL}"`)
  })

  it("a fresh replacement PDF drops the previous agreement's counter-signature provenance", async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'contract-sent',
      signatureStatus: 'rejected',
      signatureId: 'agr-rejected',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-rejected`,
      contractReservedAt: undefined,
      organizerSignedAt: '2026-01-01T00:00:00Z',
      organizerSignedBy: 'Old Organizer',
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.sfc!.organizerSignedBy).toBeUndefined()
    expect(h.sfc!.organizerSignedAt).toBeUndefined()
    expect(h.sfc!.signatureId).toBe('agr-1')
  })

  it('refuses — before any PDF — when the contract value or tier changed between the request read and the reservation read', async () => {
    h.termsAtFreshRead = { contractValue: 100_000 }
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/tier or contract value changed/),
    })
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it("a fresh replacement PDF drops the previous agreement's sponsor-signature provenance too", async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'contract-sent',
      signatureStatus: 'rejected',
      signatureId: 'agr-rejected',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-rejected`,
      contractReservedAt: undefined,
      contractSignedAt: '2026-01-01T00:00:00Z',
      contractSignedBy: 'Kari Nordmann',
    })
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.sfc!.contractSignedBy).toBeUndefined()
    expect(h.sfc!.contractSignedAt).toBeUndefined()
    expect(h.sfc!.signatureId).toBe('agr-1')
  })

  it('does not reuse a stale reservation whose terms have changed since the PDF was rendered — a fresh agreement instead', async () => {
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-stale`,
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      // Rendered at 40 000; the deal is now 50 000.
      contractReservedTerms: '40000|NOK|tier-gold',
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.generatePdf).toHaveBeenCalledTimes(1)
    expect(h.sendForSigning).toHaveBeenCalledTimes(1)
    expect(h.sfc!.signatureId).toBe('agr-1')
  })

  it('a refused replacement restores the status it superseded (rejected), since nothing was delivered', async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'contract-sent',
      signatureStatus: 'rejected',
      signatureId: 'agr-rejected',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-rejected`,
      contractReservedAt: undefined,
    })
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(h.sfc!.signatureStatus).toBe('rejected')
    expect(h.sfc!.signatureId).toBeUndefined()
  })

  it('refuses a counter-signature from anyone but the assigned organizer, before any PDF', async () => {
    h.sfc!.assignedTo = { _id: 'sp-other', name: 'Other', email: 'o@x' }
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        organizerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('keeps the link working when only the post-send flip fails, and tells the organizer', async () => {
    h.flipShouldThrow = true
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true, contractStateFailed: true })
    // The agreement the email carries IS the stored one.
    expect(h.sfc!.signatureId).toBe('agr-1')
    expect(h.sfc!.contractStatus).toBe('none')
    expect(activities('contract_status_change')).toEqual([])
  })

  it('refuses — before mailing — when another organizer reserved an agreement moments ago', async () => {
    Object.assign(h.sfc!, {
      signatureId: 'agr-other',
      signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-other`,
      contractReservedAt: new Date().toISOString(),
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/sending this contract right now/),
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sfc!.signatureId).toBe('agr-other')
    expect(record()).toBeUndefined()
  })

  it('REUSES a stale reservation (a send whose flip failed after mailing): same link, no second agreement, no new PDF', async () => {
    const STALE_URL = `https://${DOMAIN}/sponsor/contract/sign/agr-stale`
    Object.assign(h.sfc!, {
      signatureId: 'agr-stale',
      signingUrl: STALE_URL,
      contractReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      contractReservedTerms: '50000|NOK|tier-gold',
    })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(result).toMatchObject({ success: true })
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.sfc!.signatureId).toBe('agr-stale')
    expect(sentHtml()).toContain(`href="${STALE_URL}"`)
    expect(h.sfc!.contractStatus).toBe('contract-sent')
  })

  it("releases only its OWN token when the provider refused — never a later send's reservation", async () => {
    // Our provider call fails late; by then another send (after the settle
    // window) has reserved a different agreement.
    h.send.mockImplementation(async () => {
      Object.assign(h.sfc!, {
        signatureId: 'agr-later',
        signingUrl: `https://${DOMAIN}/sponsor/contract/sign/agr-later`,
        contractReservedAt: new Date().toISOString(),
      })
      return { data: null, error: { message: 'boom', statusCode: 500 } }
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
    expect(h.sfc!.signatureId).toBe('agr-later')
  })

  it('refuses — before mailing — when a write lands between the reservation read and the reservation patch', async () => {
    h.bumpRevAfterStateRead = true
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(sfcPatches().some((p) => 'signatureId' in p.sets)).toBe(false)
  })

  it('refuses — before any PDF or agreement — when the contract was sent by someone else since the modal opened', async () => {
    // The plan's own read said "send"; the fresh read finds a signature
    // already pending.
    h.sentByOtherAtFreshRead = true
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/just sent to this sponsor/),
    })
    expect(h.generatePdf).not.toHaveBeenCalled()
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sfc!.signatureId).toBe('agr-other')
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
    // An atomic increment, not a value computed from the pre-send read.
    expect(h.incs).toEqual([{ id: SFC, field: 'reminderCount', by: 1 }])
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
      contractSignedBy: 'Kari Nordmann',
      contractDocument: { asset: { _ref: 'file-1', url: DOC_URL } },
    })
  })

  it('refuses when the signed status was set by hand — the stored document is the unsigned original', async () => {
    h.sfc!.contractSignedBy = undefined
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringMatching(/set manually/),
    })
    expect(h.send).not.toHaveBeenCalled()
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
