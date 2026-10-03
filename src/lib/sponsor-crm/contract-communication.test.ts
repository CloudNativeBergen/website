/**
 * @vitest-environment node
 *
 * The SYSTEM reminder (#1264): what the contract-reminders cron sends per
 * pending contract — the org's `contract-reminder` template merged with the
 * signer and contract value, the same signing-link card and send primitive an
 * organizer's reminder uses, a `null` actor, and reminderCount + 1 only after
 * the provider accepted.
 */
const h = vi.hoisted(() => ({
  sfc: null as Record<string, unknown> | null,
  template: null as Record<string, unknown> | null,
  send: vi.fn(),
  sendForSigning: vi.fn(),
  /** The contact's email as the primitive's own read sees it (changed since). */
  contactEmailAtSend: null as string | null,
  fetches: [] as string[],
  patches: [] as Array<{ id: string; sets: Record<string, unknown> }>,
  incs: [] as Array<{ id: string; field: string; by: number }>,
  creates: [] as Array<Record<string, unknown>>,
  /** The reminderCount patch fails after the email went out. */
  countShouldThrow: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/contract-signing', () => ({
  getSigningProvider: () => ({ sendForSigning: h.sendForSigning }),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getSponsorForConference: async () => ({ sponsorForConference: h.sfc }),
}))
vi.mock('@/lib/sponsor/sanity', () => ({
  getSponsorEmailTemplateBySlugForOrg: async (orgId: string, slug: string) => ({
    template:
      orgId === 'org-acme' && slug === 'contract-reminder'
        ? h.template
        : undefined,
  }),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async () => ({ _id: 'org-acme', name: 'Acme Org' }),
  getOrganizationRefViaParentConference: async () => 'org-acme',
  organizationField: () => ({}),
}))
vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string) => {
    h.fetches.push(query)
    if (query.includes('_type == "sponsorForConference"')) {
      if (h.contactEmailAtSend && h.sfc) {
        return {
          ...h.sfc,
          contactPersons: (
            h.sfc.contactPersons as Array<Record<string, unknown>>
          ).map((c) => ({ ...c, email: h.contactEmailAtSend })),
        }
      }
      return h.sfc
    }
    return null
  }
  const patch = (id: string) => {
    let sets: Record<string, unknown> = {}
    const chain = {
      set: (v: Record<string, unknown>) => {
        sets = { ...sets, ...v }
        return chain
      },
      setIfMissing: () => chain,
      unset: () => chain,
      ifRevisionId: () => chain,
      inc: (v: Record<string, number>) => {
        for (const [k, by] of Object.entries(v)) {
          h.incs.push({ id, field: k, by })
          sets[k] = ((h.sfc?.[k] as number | undefined) ?? 0) + by
        }
        return chain
      },
      commit: async () => {
        if (h.countShouldThrow && 'reminderCount' in sets) {
          throw new Error('sanity down')
        }
        h.patches.push({ id, sets })
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
import {
  prepareContractSend,
  sendContractReminderBySystem,
} from './contract-communication'
import type { Conference } from '@/lib/conference/types'
import type { SponsorForConferenceExpanded } from './types'

const SIGNING_URL = 'https://cloudnativebergen.dev/sponsor/contract/sign/agr-1'

beforeEach(() => {
  vi.clearAllMocks()
  h.fetches = []
  h.contactEmailAtSend = null
  h.countShouldThrow = false
  h.patches = []
  h.incs = []
  h.creates = []
  h.sfc = {
    _id: 'sfc-1',
    status: 'closed-won',
    contractStatus: 'contract-sent',
    signatureStatus: 'pending',
    signatureId: 'agr-1',
    signingUrl: SIGNING_URL,
    signerEmail: 'kari@acme.test',
    signerName: 'Kari Nordmann',
    reminderCount: 1,
    contractValue: 50_000,
    contractCurrency: 'NOK',
    contactPersons: [
      {
        _key: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        isPrimary: true,
      },
    ],
    sponsor: { _id: 'sponsor-acme', name: 'Acme AS' },
    tier: { _id: 'tier-gold', title: 'Gold' },
    conference: {
      _id: 'conf-1',
      title: 'Cloud Native Days Bergen',
      organizer: 'CNDN',
      sponsorEmail: 'sponsors@example.test',
      domains: ['cloudnativebergen.dev'],
      startDate: '2026-10-28',
      city: 'Bergen',
      country: 'Norway',
      organization: { _ref: 'org-acme' },
    },
  }
  h.template = {
    _id: 'tpl-reminder',
    slug: { current: 'contract-reminder' },
    category: 'contract',
    language: 'en',
    subject: 'Reminder: Sponsorship Agreement — {{{CONFERENCE_TITLE}}}',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Dear {{{SIGNER_NAME}}}, {{{CONTRACT_VALUE}}} awaits your signature.',
            marks: [],
          },
        ],
      },
    ],
  }
  h.send.mockResolvedValue({ data: { id: 'resend-msg-9' }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('prepareContractSend', () => {
  it('refuses a named signer who is not among the recipients — the lib guard behind the Zod rule', async () => {
    Object.assign(h.sfc!, {
      contractStatus: 'none',
      signatureStatus: 'not-started',
      signatureId: undefined,
      signingUrl: undefined,
      contactPersons: [
        ...(h.sfc!.contactPersons as unknown[]),
        { _key: 'c-billing', name: 'Ola', email: 'ola@acme.test' },
      ],
    })
    await expect(
      prepareContractSend({
        conference: h.sfc!.conference as unknown as Conference,
        sfc: h.sfc as unknown as SponsorForConferenceExpanded,
        recipientKeys: ['c-primary'],
        signerKey: 'c-billing',
        actor: { id: 'sp-1' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The signer must be one of the chosen recipients',
    })
  })
})

describe('sendContractReminderBySystem', () => {
  it('merges the org template with signer and value, mails the signing link to the signer, records with no actor, and counts the reminder', async () => {
    const outcome = await sendContractReminderBySystem('sfc-1')
    expect(outcome).toEqual({ ok: true, recipient: 'kari@acme.test' })

    const sent = h.send.mock.calls[0][0]
    expect(sent.to).toEqual(['kari@acme.test'])
    expect(sent.subject).toBe(
      'Reminder: Sponsorship Agreement — Cloud Native Days Bergen',
    )
    expect(sent.html).toMatch(/Dear Kari Nordmann, 50\s000 NOK awaits/)
    expect(sent.html).toContain(`href="${SIGNING_URL}"`)
    // Nothing the shared renderer prints is missing from the expanded conference.
    expect(sent.html).not.toContain('undefined')

    const record = h.creates.find((d) => d.communicationKind === 'contract')
    // The persisted signer, as a server-built recipient keyed by their contact.
    expect(record!.recipients).toEqual([
      expect.objectContaining({ _key: 'c-primary', email: 'kari@acme.test' }),
    ])
    expect(record).toMatchObject({
      deliveryStatus: 'sent',
      providerMessageId: 'resend-msg-9',
      templateEdited: false,
      attachments: [expect.objectContaining({ url: SIGNING_URL })],
    })
    // A system actor: no author reference at all on the record it wrote.
    expect(record).not.toHaveProperty('createdBy')
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.incs).toEqual([{ id: 'sfc-1', field: 'reminderCount', by: 1 }])
    expect(h.patches).toEqual([{ id: 'sfc-1', sets: { reminderCount: 2 } }])
  })

  it('skips a contract whose signature is no longer pending', async () => {
    h.sfc!.signatureStatus = 'signed'
    h.sfc!.contractStatus = 'contract-signed'
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: false,
      reason: 'not-pending',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('skips a pending signature with no stored signing link — never a first send from the cron', async () => {
    h.sfc!.signingUrl = undefined
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: false,
      reason: 'not-pending',
    })
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('still reminds a persisted signer who is not a contact (an external signer, or one since removed)', async () => {
    h.sfc!.signerEmail = 'cfo@acme-holding.test'
    h.sfc!.signerName = 'Finance CFO'
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: true,
      recipient: 'cfo@acme-holding.test',
    })
    expect(h.send.mock.calls[0][0].to).toEqual(['cfo@acme-holding.test'])
    const record = h.creates.find((d) => d.communicationKind === 'contract')
    expect(record!.recipients).toEqual([
      expect.objectContaining({
        _key: 'signer-external',
        name: 'Finance CFO',
        email: 'cfo@acme-holding.test',
      }),
    ])
  })

  it('addresses a reminder to the sponsor name when the persisted signer has no name and is not a contact', async () => {
    h.sfc!.signerEmail = 'cfo@acme-holding.test'
    h.sfc!.signerName = undefined
    expect(await sendContractReminderBySystem('sfc-1')).toMatchObject({
      ok: true,
    })
    expect(h.send.mock.calls[0][0].html).toContain('Dear Acme AS,')
    expect(h.send.mock.calls[0][0].html).not.toContain('{{{SIGNER_NAME}}}')
  })

  it("mails the PERSISTED signer address even if that contact's email changed between the two reads", async () => {
    // The primitive re-reads the sponsor; by then the contact's address differs.
    h.contactEmailAtSend = 'kari-new@acme.test'
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: true,
      recipient: 'kari@acme.test',
    })
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
  })

  it('skips when no signer is stored at all', async () => {
    h.sfc!.signerEmail = undefined
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: false,
      reason: 'no-signer',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('skips when the org has no contract-reminder template', async () => {
    h.template = null
    expect(await sendContractReminderBySystem('sfc-1')).toEqual({
      ok: false,
      reason: 'template-missing',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('reports a mailed reminder whose count did not land — never as a success', async () => {
    h.countShouldThrow = true
    expect(await sendContractReminderBySystem('sfc-1')).toMatchObject({
      ok: false,
      reason: 'count-failed',
      message: expect.stringMatching(/mailed to kari@acme.test/),
    })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.patches).toEqual([])
  })

  it('matches the persisted signer to a contact whatever the stored casing, and records the canonical address', async () => {
    h.sfc!.signerEmail = ' Kari@Acme.test '
    const outcome = await sendContractReminderBySystem('sfc-1')
    expect(outcome).toEqual({ ok: true, recipient: 'kari@acme.test' })
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
    const record = h.creates.find((d) => d.communicationKind === 'contract')
    expect(record!.recipients).toEqual([
      expect.objectContaining({ _key: 'c-primary', email: 'kari@acme.test' }),
    ])
  })

  it('does not count a reminder the provider refused, and records the failure', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    expect(await sendContractReminderBySystem('sfc-1')).toMatchObject({
      ok: false,
      reason: 'send-failed',
    })
    expect(h.patches).toEqual([])
    expect(
      h.creates.find((d) => d.communicationKind === 'contract'),
    ).toMatchObject({ deliveryStatus: 'failed', error: 'boom' })
  })
})
