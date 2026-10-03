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
  /** Another sweep claimed the slot first: the revision moved. */
  claimedElsewhere: false,
  /** The primitive's own sponsor read rejects (before the provider). */
  sendReadThrows: false,
  /** The tenant's sender credentials cannot be resolved. */
  senderUnavailable: false,
  /** The decrement that releases a claimed slot fails. */
  releaseThrows: false,
  /** The first release decrement LANDS but its answer is lost. */
  releaseAnswerLost: false,
  /** …and another sweep claims a slot before the retry. */
  claimInterposedOnLostRelease: false,
  /** Another sweep claims a slot while this one's email is with the provider. */
  claimDuringSend: false,
  /** The claim LANDS but its answer is lost. */
  claimAnswerLost: false,
  /** Boundary events in order: claim / send / release. */
  sequence: [] as string[],
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
      if (h.sendReadThrows) throw new Error('sanity read failed')
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
  const patch = (
    selection: string | { query: string; params: Record<string, unknown> },
  ) => {
    // A query selection matches only while THIS claim is still recorded.
    const id =
      typeof selection === 'string'
        ? selection
        : selection.query.includes('$claimId in reminderClaims') &&
            h.sfc &&
            ((h.sfc.reminderClaims as string[] | undefined) ?? []).includes(
              selection.params.claimId as string,
            )
          ? (selection.params.id as string)
          : 'no-match'
    let sets: Record<string, unknown> = {}
    let appends: Array<{ path: string; items: unknown[] }> = []
    let unsets: string[] = []
    let requiredRev: string | undefined
    // Staged until commit succeeds.
    const apply = () => {
      if (!h.sfc || id !== h.sfc._id) return
      Object.assign(h.sfc, sets)
      for (const a of appends) {
        const arr = ((h.sfc[a.path] as unknown[] | undefined) ?? []).slice()
        arr.push(...a.items)
        h.sfc[a.path] = arr
      }
      for (const u of unsets) {
        const m = /^reminderClaims\[@ == "(.+)"\]$/.exec(u)
        if (m) {
          h.sfc.reminderClaims = (
            (h.sfc.reminderClaims as string[] | undefined) ?? []
          ).filter((c) => c !== m[1])
        }
      }
    }
    const chain = {
      set: (v: Record<string, unknown>) => {
        sets = { ...sets, ...v }
        return chain
      },
      setIfMissing: () => chain,
      append: (path: string, items: unknown[]) => {
        appends = [...appends, { path, items }]
        return chain
      },
      unset: (paths: string[]) => {
        unsets = [...unsets, ...paths]
        return chain
      },
      ifRevisionId: (rev: string) => {
        requiredRev = rev
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
        const currentRev = (h.sfc?._rev as string | undefined) ?? 'rev-1'
        if (
          requiredRev !== undefined &&
          (h.claimedElsewhere || requiredRev !== currentRev)
        ) {
          throw new Error(
            'Mutation(s) failed with 1 error(s): revision mismatch',
          )
        }
        const isRelease =
          'reminderCount' in sets &&
          id === h.sfc?._id &&
          (sets.reminderCount as number) <
            ((h.sfc?.reminderCount as number | undefined) ?? 0)
        if (h.releaseThrows && isRelease) throw new Error('sanity down')
        const isClaim =
          'reminderCount' in sets &&
          id === h.sfc?._id &&
          (sets.reminderCount as number) >
            ((h.sfc?.reminderCount as number | undefined) ?? 0)
        if (h.claimAnswerLost && isClaim) {
          // Applied, then the connection broke.
          h.claimAnswerLost = false
          h.sequence.push('claim')
          apply()
          throw new Error('socket hang up')
        }
        if (h.releaseAnswerLost && isRelease) {
          // Applied, then the connection broke.
          h.releaseAnswerLost = false
          h.sequence.push('release')
          apply()
          if (h.claimInterposedOnLostRelease && h.sfc) {
            // Another sweep claims before the retry.
            h.sfc.reminderCount = (h.sfc.reminderCount as number) + 1
            h.sfc.reminderClaims = [
              ...((h.sfc.reminderClaims as string[] | undefined) ?? []),
              'claim-B',
            ]
          }
          throw new Error('socket hang up')
        }
        if ('reminderCount' in sets) {
          h.sequence.push(
            (sets.reminderCount as number) >
              ((h.sfc?.reminderCount as number | undefined) ?? 0)
              ? 'claim'
              : 'release',
          )
        }
        h.patches.push({ id, sets })
        apply()
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
  resolveEmailSender: async () => {
    if (h.senderUnavailable) throw new Error('no RESEND key for tenant')
    return {
      client: {
        emails: {
          send: async (...args: unknown[]) => {
            h.sequence.push('send')
            if (h.claimDuringSend && h.sfc) {
              h.sfc.reminderCount = (h.sfc.reminderCount as number) + 1
              h.sfc.reminderClaims = [
                ...((h.sfc.reminderClaims as string[] | undefined) ?? []),
                'claim-B',
              ]
              h.sfc._rev = 'rev-3'
            }
            return h.send(...args)
          },
        },
      },
    }
  },
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
  h.claimedElsewhere = false
  h.sendReadThrows = false
  h.senderUnavailable = false
  h.releaseThrows = false
  h.releaseAnswerLost = false
  h.claimInterposedOnLostRelease = false
  h.claimDuringSend = false
  h.claimAnswerLost = false
  h.sequence = []
  h.patches = []
  h.incs = []
  h.creates = []
  h.sfc = {
    _id: 'sfc-1',
    _rev: 'rev-1',
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
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
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
    expect(h.patches[0]).toEqual({ id: 'sfc-1', sets: { reminderCount: 2 } })
    // The claim is settled: its id is gone, the count stays.
    expect(h.sfc!.reminderClaims).toEqual([])
  })

  it('skips a contract whose signature is no longer pending', async () => {
    h.sfc!.signatureStatus = 'signed'
    h.sfc!.contractStatus = 'contract-signed'
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: false,
      reason: 'not-pending',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('skips a pending signature with no stored signing link — never a first send from the cron', async () => {
    h.sfc!.signingUrl = undefined
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: false,
      reason: 'not-pending',
    })
    expect(h.sendForSigning).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('still reminds a persisted signer who is not a contact (an external signer, or one since removed)', async () => {
    h.sfc!.signerEmail = 'cfo@acme-holding.test'
    h.sfc!.signerName = 'Finance CFO'
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
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
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({
      ok: true,
    })
    expect(h.send.mock.calls[0][0].html).toContain('Dear Acme AS,')
    expect(h.send.mock.calls[0][0].html).not.toContain('{{{SIGNER_NAME}}}')
  })

  it("mails the PERSISTED signer address even if that contact's email changed between the two reads", async () => {
    // The primitive re-reads the sponsor; by then the contact's address differs.
    h.contactEmailAtSend = 'kari-new@acme.test'
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: true,
      recipient: 'kari@acme.test',
    })
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
  })

  it('skips when no signer is stored at all', async () => {
    h.sfc!.signerEmail = undefined
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: false,
      reason: 'no-signer',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('skips when the org has no contract-reminder template', async () => {
    h.template = null
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: false,
      reason: 'template-missing',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('claims the reminder slot BEFORE mailing, so two overlapping sweeps cannot both send', async () => {
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
    expect(outcome).toEqual({ ok: true, recipient: 'kari@acme.test' })
    expect(h.sequence).toEqual(['claim', 'send'])
    expect(h.incs).toEqual([{ id: 'sfc-1', field: 'reminderCount', by: 1 }])
  })

  it("stops at the limit it reads itself — a sweep that reads after another sweep's claim sends nothing", async () => {
    // Selected at reminderCount 1 by the sweep; another sweep claimed since.
    h.sfc!.reminderCount = 2
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({ ok: false, reason: 'limit-reached' })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.patches).toEqual([])
  })

  it("keeps the claimed slot when the provider's answer is lost — the reminder may be in an inbox", async () => {
    h.send.mockRejectedValue(new Error('socket hang up'))
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({ ok: false, reason: 'send-failed' })
    expect(h.sequence).toEqual(['claim', 'send'])
    expect(h.sfc!.reminderCount).toBe(2)
  })

  it('gives the slot back when the primitive throws before the provider is reached', async () => {
    h.sendReadThrows = true
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({
      ok: false,
      reason: 'send-failed',
      message: 'sanity read failed',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sequence).toEqual(['claim', 'release'])
    expect(h.sfc!.reminderCount).toBe(1)
  })

  it('reports a slot that could not be released after a refused send — never silently consumed', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    h.releaseThrows = true
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({
      ok: false,
      reason: 'send-failed',
      message: expect.stringMatching(
        /boom; the reminder slot could not be released \(reminderCount stays 2\)/,
      ),
    })
    // Tried twice before giving up.
    expect(h.incs.filter((i) => i.by === -1)).toHaveLength(2)
    expect(h.sfc!.reminderCount).toBe(2)
  })

  it('never takes the count below where it started: a release whose answer was lost is not applied twice', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    h.releaseAnswerLost = true
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'send-failed' })
    expect((outcome as { message?: string }).message).not.toMatch(
      /could not be released/,
    )
    // 1 → claim 2 → release 1; the retry matched nothing.
    expect(h.sfc!.reminderCount).toBe(1)
  })

  it('gives back a claim that landed but whose answer was lost — the slot is not consumed for a reminder never attempted', async () => {
    h.claimAnswerLost = true
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({ ok: false, reason: 'claimed-elsewhere' })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sequence).toEqual(['claim', 'release'])
    expect(h.sfc!.reminderCount).toBe(1)
    expect(h.sfc!.reminderClaims).toEqual([])
  })

  it("takes back ITS OWN claim, never another sweep's, when a later claim landed on top", async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    h.claimDuringSend = true
    await sendContractReminderBySystem('sfc-1', { maxReminders: 2 })
    // 1 → A claims 2 → B claims 3 → A refused → A releases: 2, B's claim stands.
    expect(h.sfc!.reminderCount).toBe(2)
    expect(h.sfc!.reminderClaims).toEqual(['claim-B'])
  })

  it("a release whose answer was lost is never re-applied against a later sweep's claim", async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    h.releaseAnswerLost = true
    h.claimInterposedOnLostRelease = true
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'send-failed' })
    // 1 → A claims 2 → A releases 1 (answer lost) → B claims 2 → A's retry
    // finds no claim of its own: B's slot stands.
    expect(h.sfc!.reminderCount).toBe(2)
    expect(h.sfc!.reminderClaims).toEqual(['claim-B'])
  })

  it("gives the slot back when the tenant's sender cannot be resolved — the provider was never asked", async () => {
    h.senderUnavailable = true
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({ ok: false, reason: 'send-failed' })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.sequence).toEqual(['claim', 'release'])
    expect(h.sfc!.reminderCount).toBe(1)
  })

  it('skips — mailing nothing — when another sweep claimed the slot first', async () => {
    h.claimedElsewhere = true
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toEqual({
      ok: false,
      reason: 'claimed-elsewhere',
    })
    expect(h.send).not.toHaveBeenCalled()
    // Nothing of ours to release: the compensation matched no document.
    expect(h.patches.filter((p) => p.id === 'sfc-1')).toEqual([])
    expect(h.sfc!.reminderCount).toBe(1)
  })

  it('matches the persisted signer to a contact whatever the stored casing, and records the canonical address', async () => {
    h.sfc!.signerEmail = ' Kari@Acme.test '
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
    expect(outcome).toEqual({ ok: true, recipient: 'kari@acme.test' })
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
    const record = h.creates.find((d) => d.communicationKind === 'contract')
    expect(record!.recipients).toEqual([
      expect.objectContaining({ _key: 'c-primary', email: 'kari@acme.test' }),
    ])
  })

  it('sends the signing card even from a subject-only template (no body)', async () => {
    h.template = { ...h.template, body: undefined }
    const outcome = await sendContractReminderBySystem('sfc-1', {
      maxReminders: 2,
    })
    expect(outcome).toEqual({ ok: true, recipient: 'kari@acme.test' })
    expect(h.send.mock.calls[0][0].html).toContain(`href="${SIGNING_URL}"`)
  })

  it('does not count a reminder the provider refused, and records the failure', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'boom', statusCode: 500 },
    })
    expect(
      await sendContractReminderBySystem('sfc-1', { maxReminders: 2 }),
    ).toMatchObject({
      ok: false,
      reason: 'send-failed',
    })
    // The claimed slot went back: the count is where it started.
    expect(h.sequence).toEqual(['claim', 'send', 'release'])
    expect(h.sfc!.reminderCount).toBe(1)
    expect(
      h.creates.find((d) => d.communicationKind === 'contract'),
    ).toMatchObject({ deliveryStatus: 'failed', error: 'boom' })
  })
})
