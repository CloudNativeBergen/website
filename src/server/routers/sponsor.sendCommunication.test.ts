/**
 * @vitest-environment node
 *
 * THE ONE SPONSOR SEND PRIMITIVE — `sponsor.crm.sendCommunication` (#1261).
 *
 * Every rule the spec (#1260) puts behind this seam is asserted here through
 * `createCaller`, with the Sanity client and the Resend sender mocked at the
 * boundary and the REAL render path in between (so the stored body is the
 * HTML that reached the provider, not a stand-in).
 *
 * The refusals are asserted on the path NOT being taken as well as on the
 * code: a foreign sponsor never reaches the sponsor read, a bad recipient key
 * never reaches the provider, and a provider failure never flips the deal.
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
  /** What the tenant probe (`"memberOrgIds"` query) answers for the sfc id. */
  tenant: null as Record<string, unknown> | null,
  /** The sponsor read the send module performs. */
  sfc: null as Record<string, unknown> | null,
  /** Answer for the activity probe update/delete perform. */
  activityProbe: null as Record<string, unknown> | null,
  /** Answer for the full-record and list reads. */
  recordRead: null as unknown,
  fetches: [] as Array<{ query: string; params?: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
  patches: [] as Array<{ id: string; sets: Record<string, unknown>[] }>,
  createShouldThrow: false,
  send: vi.fn(),
  /** What the org-scoped template reader answers for a client-supplied id. */
  getTemplate: vi.fn(),
}))
vi.mock('@/lib/sponsor/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getSponsorEmailTemplate: h.getTemplate,
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
    if (query.includes('].contactPersons[]')) {
      return (h.sfc?.contactPersons as unknown[] | undefined) ?? null
    }
    if (query.includes('_type == "sponsorForConference"')) return h.sfc
    if (query.includes('communicationKind }')) return h.activityProbe
    return h.recordRead
  }
  const patch = (id: string) => {
    const entry = { id, sets: [] as Record<string, unknown>[] }
    h.patches.push(entry)
    const chain = {
      set: (v: Record<string, unknown>) => {
        entry.sets.push(v)
        return chain
      },
      unset: () => chain,
      setIfMissing: () => chain,
      commit: async () => ({}),
    }
    return chain
  }
  const client = {
    fetch,
    patch,
    create: async (doc: Record<string, unknown>) => {
      if (h.createShouldThrow) throw new Error('sanity down')
      h.creates.push(doc)
      return { _id: `act-${h.creates.length}` }
    },
    delete: async () => ({}),
    transaction: () => {
      const tx = { patch: () => tx, create: () => tx, commit: async () => ({}) }
      return tx
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
  /** Two attempts, like the real backoff — enough to prove the throw is INSIDE. */
  retryWithBackoff: async <T>(fn: () => Promise<T>) => {
    try {
      return await fn()
    } catch {
      return await fn()
    }
  },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'
import { AUDIT_IMMUTABLE_MESSAGE } from '@/lib/sponsor-crm/activity'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'
const SFC = 'sfc-acme'

function ctx(): Context {
  // Deliberately DIFFERENT names: the speaker profile vs the sign-in profile.
  // The composer may have merged either into SENDER_NAME.
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin Speaker',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin Login', picture: '' }
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

const MESSAGE = JSON.stringify([
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [
      { _type: 'span', _key: 's1', text: 'Here is the booth information.' },
    ],
  },
])

const INPUT = {
  sponsorForConferenceId: SFC,
  kind: 'information' as const,
  recipientKeys: ['c-primary'],
  subject: 'Booth information',
  message: MESSAGE,
}

/** What the org-scoped reader returns for `tpl-info-en` (merge fields included). */
const INFO_TEMPLATE = {
  _id: 'tpl-info-en',
  category: 'follow-up',
  language: 'en',
  subject: 'Booth information for {{{CONFERENCE_TITLE}}}',
  body: [
    {
      _type: 'block',
      _key: 't1',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: 't1s',
          text: 'Hi {{{CONTACT_NAMES}}}, here is the booth information.',
          marks: [],
        },
      ],
    },
  ],
}

/** The INFO_TEMPLATE as the composer merges it for Kari alone (re-keyed). */
const MERGED_FOR_KARI = {
  subject: 'Booth information for Cloud Native Days Bergen',
  message: JSON.stringify([
    {
      _type: 'block',
      _key: 'editor-1',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: 'editor-1a',
          text: 'Hi Kari Nordmann, here is the booth information.',
          marks: [],
        },
      ],
    },
  ]),
}

const contacts = [
  {
    _key: 'c-primary',
    name: 'Kari Nordmann',
    email: 'kari@acme.test',
    role: 'Partnership Manager',
    isPrimary: true,
  },
  {
    _key: 'c-billing',
    name: 'Ola Nordmann',
    email: 'ola@acme.test',
    role: 'Billing Reference',
  },
  { _key: 'c-noemail', name: 'No Mail', email: '' },
]

const sentCreate = () =>
  h.creates.find((d) => d._type === 'sponsorActivity' && d.communicationKind)

beforeEach(() => {
  vi.clearAllMocks()
  h.fetches = []
  h.creates = []
  h.patches = []
  h.createShouldThrow = false
  h.tenant = { _type: 'sponsorForConference', conferenceId: CONF }
  h.sfc = {
    _id: SFC,
    status: 'prospect',
    outreachCount: 0,
    contactPersons: contacts,
    sponsor: { name: 'Acme AS' },
    tier: { title: 'Gold' },
  }
  h.activityProbe = null
  h.recordRead = null
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
      domains: ['cloudnativebergen.dev'],
    },
    domain: 'localhost',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue({
    _id: ORG,
    name: 'Cloud Native Days Norway',
    slug: 'cloud-native-days-norway',
  })
  h.send.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null })
  h.getTemplate.mockResolvedValue({ template: INFO_TEMPLATE })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ownership — guard before fetch', () => {
  it("refuses another tenant's sponsor as NOT_FOUND before reading it", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      h.fetches.some((f) =>
        f.query.includes('_type == "sponsorForConference"'),
      ),
    ).toBe(false)
    expect(h.send).not.toHaveBeenCalled()
    expect(h.creates).toHaveLength(0)
  })

  it('refuses a missing sponsor identically', async () => {
    h.tenant = null
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('recipients are resolved server-side from contact keys', () => {
  it('refuses a key that is not on this sponsor, before any send or record', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        recipientKeys: ['c-primary', 'c-stranger'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'A chosen recipient is not a contact on this sponsor',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.creates).toHaveLength(0)
  })

  it('refuses a contact without an email address by name', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        recipientKeys: ['c-noemail'],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'No Mail has no email address',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('never takes an address from the client (input has no email field)', async () => {
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        // @ts-expect-error — the input schema has no such field
        recipients: [{ email: 'attacker@evil.test' }],
      }),
    ).resolves.toBeDefined()
    const to = h.send.mock.calls[0][0].to as string[]
    expect(to).toEqual(['kari@acme.test'])
  })
})

describe('a successful send', () => {
  it('mails every chosen contact from the sponsor address and records them as sent', async () => {
    const result = await sponsor().crm.sendCommunication({
      ...INPUT,
      recipientKeys: ['c-primary', 'c-billing'],
      template: { id: 'tpl-info-en', edited: false },
    })

    expect(h.send).toHaveBeenCalledTimes(1)
    const sent = h.send.mock.calls[0][0]
    expect(sent.to).toEqual(['kari@acme.test', 'ola@acme.test'])
    expect(sent.from).toBe('CNDN <sponsors@example.test>')
    expect(sent.subject).toBe('Booth information')
    expect(sent.html).toContain('Here is the booth information.')

    const record = sentCreate()
    expect(record).toMatchObject({
      activityType: 'email',
      communicationKind: 'information',
      subject: 'Booth information',
      deliveryStatus: 'sent',
      providerMessageId: 'resend-msg-1',
      // Computed on the server: this body is NOT what the template produces.
      templateEdited: true,
      template: { _ref: 'tpl-info-en' },
      createdBy: { _ref: 'sp-admin' },
      description: 'Information sent to Kari Nordmann (+1)',
    })
    // The stored body IS the HTML the provider received.
    expect(record!.body).toBe(sent.html)
    expect(record!.recipients).toEqual([
      expect.objectContaining({
        contactKey: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        role: 'Partnership Manager',
        isDefault: true,
      }),
      expect.objectContaining({
        contactKey: 'c-billing',
        email: 'ola@acme.test',
        isDefault: false,
      }),
    ])
    expect(result).toMatchObject({
      success: true,
      recipientCount: 2,
      providerMessageId: 'resend-msg-1',
      activityId: expect.stringMatching(/^act-/),
    })
  })

  it('collapses a duplicated key to one recipient', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      recipientKeys: ['c-primary', 'c-primary'],
    })
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
  })

  it('moves a prospect to contacted after an information send (old sendEmail behaviour)', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    const sfcPatch = h.patches.find((p) => p.id === SFC)
    expect(sfcPatch?.sets).toEqual(
      expect.arrayContaining([{ status: 'contacted' }, { outreachCount: 1 }]),
    )
  })

  it('still succeeds when the audit write fails — the record never fails the send', async () => {
    h.createShouldThrow = true
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ success: true, recipientCount: 1 })
    expect(result.activityId).toBeUndefined()
  })
})

describe('template provenance is validated, not trusted', () => {
  it('refuses a template id the org-scoped reader does not return, before any send', async () => {
    h.getTemplate.mockResolvedValue({ template: undefined })
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        template: { id: 'tpl-of-another-org', edited: false },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Template not found',
    })
    expect(h.getTemplate).toHaveBeenCalledWith('tpl-of-another-org')
    expect(h.send).not.toHaveBeenCalled()
    expect(h.creates).toHaveLength(0)
  })

  it('refuses a contract template as the start of an information email', async () => {
    h.getTemplate.mockResolvedValue({
      template: { _id: 'tpl-contract', category: 'contract' },
    })
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        template: { id: 'tpl-contract', edited: false },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Template is for another kind of email',
    })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('surfaces a template READ failure as a server error, not as "not found"', async () => {
    h.getTemplate.mockResolvedValue({ error: new Error('sanity down') })
    await expect(
      sponsor().crm.sendCommunication({
        ...INPUT,
        template: { id: 'tpl-info-en', edited: false },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('does not touch the template reader when no template is claimed', async () => {
    await sponsor().crm.sendCommunication(INPUT)
    expect(h.getTemplate).not.toHaveBeenCalled()
    expect(sentCreate()!.template).toBeUndefined()
  })
})

describe('the edited flag is computed, not trusted', () => {
  it('records edited=false when the message is exactly the merged template (re-keyed)', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      ...MERGED_FOR_KARI,
      template: { id: 'tpl-info-en', edited: true }, // client lies: ignored
    })
    expect(sentCreate()).toMatchObject({
      template: { _ref: 'tpl-info-en' },
      templateEdited: false,
    })
  })

  it('accepts a greeting merged with the SIGN-IN name as unedited (sender-name sources differ)', async () => {
    h.getTemplate.mockResolvedValue({
      template: {
        ...INFO_TEMPLATE,
        subject: 'From {{{SENDER_NAME}}}',
      },
    })
    await sponsor().crm.sendCommunication({
      ...INPUT,
      ...MERGED_FOR_KARI,
      subject: 'From Admin Login',
      template: { id: 'tpl-info-en', edited: true },
    })
    expect(sentCreate()).toMatchObject({ templateEdited: false })
  })

  it('ignores editor defaults (empty marks/markDefs, style normal, new keys) when comparing', async () => {
    const normalized = JSON.stringify([
      {
        _type: 'block',
        _key: 'zz',
        children: [
          {
            _type: 'span',
            _key: 'zz1',
            text: 'Hi Kari Nordmann, here is the booth information.',
          },
        ],
      },
    ])
    await sponsor().crm.sendCommunication({
      ...INPUT,
      ...MERGED_FOR_KARI,
      message: normalized,
      template: { id: 'tpl-info-en', edited: true },
    })
    expect(sentCreate()).toMatchObject({ templateEdited: false })
  })

  it('records edited=true when a single character differs, whatever the client says', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      ...MERGED_FOR_KARI,
      subject: MERGED_FOR_KARI.subject + '!',
      template: { id: 'tpl-info-en', edited: false },
    })
    expect(sentCreate()).toMatchObject({ templateEdited: true })
  })

  it('records edited=true when the greeting names other recipients than those sent to', async () => {
    await sponsor().crm.sendCommunication({
      ...INPUT,
      ...MERGED_FOR_KARI,
      recipientKeys: ['c-billing'],
      template: { id: 'tpl-info-en', edited: false },
    })
    expect(sentCreate()).toMatchObject({ templateEdited: true })
  })
})

describe('the cnctl shim — crm.sendEmailBySfc', () => {
  it('is the old wire shape on top of the primitive: every mailable contact, recorded like any send', async () => {
    const result = await sponsor().crm.sendEmailBySfc({
      sponsorForConferenceId: SFC,
      subject: 'From the CLI',
      body: 'Hello **there**',
    })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0].to).toEqual([
      'kari@acme.test',
      'ola@acme.test',
    ])
    expect(sentCreate()).toMatchObject({
      communicationKind: 'information',
      subject: 'From the CLI',
      deliveryStatus: 'sent',
    })
    expect(sentCreate()!.recipients).toHaveLength(2)
    expect(result).toMatchObject({
      success: true,
      emailId: 'resend-msg-1',
      recipientCount: 2,
    })
  })

  it("refuses another tenant's sponsor before reading it", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(
      sponsor().crm.sendEmailBySfc({
        sponsorForConferenceId: SFC,
        subject: 'x',
        body: 'y',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.send).not.toHaveBeenCalled()
  })
})

describe('provider errors are retried', () => {
  it('recovers when the first attempt resolves with an error and the second succeeds', async () => {
    h.send
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Too many requests', statusCode: 429 },
      })
      .mockResolvedValueOnce({ data: { id: 'resend-msg-2' }, error: null })
    const result = await sponsor().crm.sendCommunication(INPUT)
    expect(h.send).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      success: true,
      providerMessageId: 'resend-msg-2',
    })
    expect(sentCreate()).toMatchObject({ deliveryStatus: 'sent' })
  })
})

describe('a failed send', () => {
  it('is recorded as failed with the error, surfaces INTERNAL_SERVER_ERROR and flips nothing', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'Resend: domain not verified' },
    })
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Resend: domain not verified',
    })
    expect(sentCreate()).toMatchObject({
      deliveryStatus: 'failed',
      error: 'Resend: domain not verified',
      description: 'Information failed to send to Kari Nordmann',
    })
    expect(sentCreate()!.providerMessageId).toBeUndefined()
    expect(h.patches.filter((p) => p.id === SFC)).toHaveLength(0)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('records a thrown provider error the same way', async () => {
    h.send.mockRejectedValue(new Error('ECONNRESET'))
    await expect(sponsor().crm.sendCommunication(INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'ECONNRESET',
    })
    expect(sentCreate()).toMatchObject({
      deliveryStatus: 'failed',
      error: 'ECONNRESET',
    })
  })
})

describe('the audit record is immutable', () => {
  it('refuses activities.update on a sent-communication record', async () => {
    h.activityProbe = {
      activityType: 'email',
      createdBy: { _ref: 'sp-admin' },
      communicationKind: 'information',
    }
    await expect(
      sponsor().crm.activities.update({ id: 'act-1', description: 'x' }),
    ).rejects.toMatchObject({ message: AUDIT_IMMUTABLE_MESSAGE })
    expect(h.patches).toHaveLength(0)
  })

  it('refuses activities.delete on a sent-communication record', async () => {
    h.activityProbe = {
      activityType: 'email',
      createdBy: { _ref: 'sp-admin' },
      communicationKind: 'information',
    }
    await expect(
      sponsor().crm.activities.delete({ id: 'act-1' }),
    ).rejects.toMatchObject({ message: AUDIT_IMMUTABLE_MESSAGE })
  })

  it('still lets the author edit an ordinary hand-logged email', async () => {
    h.activityProbe = {
      activityType: 'email',
      createdBy: { _ref: 'sp-admin' },
    }
    await expect(
      sponsor().crm.activities.update({ id: 'act-1', description: 'x' }),
    ).resolves.toEqual({ success: true })
  })
})

describe('reading the record back', () => {
  it('activities.get is scoped to the current conference and returns the body', async () => {
    h.recordRead = {
      _id: 'act-1',
      communicationKind: 'information',
      body: '<p>hi</p>',
    }
    const record = await sponsor().crm.activities.get({ id: 'act-1' })
    expect(record).toMatchObject({ body: '<p>hi</p>' })
    const read = h.fetches.find((f) => f.query.includes('body'))
    expect(read?.query).toContain(
      'sponsorForConference->conference._ref == $conferenceId',
    )
    expect(read?.params).toMatchObject({
      activityId: 'act-1',
      conferenceId: CONF,
    })
  })

  it('activities.get refuses an id that resolves to nothing in this conference', async () => {
    h.recordRead = null
    await expect(
      sponsor().crm.activities.get({ id: 'act-foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('activities.listCommunications guards the sponsor, filters by kind and pages', async () => {
    h.recordRead = { items: [{ _id: 'act-1' }], total: 7 }
    const page = await sponsor().crm.activities.listCommunications({
      sponsorForConferenceId: SFC,
      kind: 'information',
      offset: 20,
      limit: 20,
    })
    expect(page).toEqual({ items: [{ _id: 'act-1' }], total: 7 })
    const read = h.fetches.find((f) => f.query.includes('"total"'))
    expect(read?.query).toContain('communicationKind == $kind')
    expect(read?.query).toContain(
      'sponsorForConference->conference._ref == $conferenceId',
    )
    expect(read?.query).toContain('[$offset...$end]')
    expect(read?.query).not.toContain('body')
    expect(read?.params).toMatchObject({
      sponsorId: SFC,
      conferenceId: CONF,
      kind: 'information',
      offset: 20,
      end: 40,
    })
  })

  it("activities.listCommunications refuses another tenant's sponsor before reading", async () => {
    h.tenant = { _type: 'sponsorForConference', conferenceId: 'conf-other' }
    await expect(
      sponsor().crm.activities.listCommunications({
        sponsorForConferenceId: SFC,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.fetches.some((f) => f.query.includes('"total"'))).toBe(false)
  })

  it('the activity list projection carries the summary but never the body', async () => {
    h.recordRead = []
    await sponsor().crm.activities.list({ sponsorForConferenceId: SFC })
    const read = h.fetches.find((f) =>
      f.query.includes('sponsorForConference._ref == $sponsorId'),
    )
    expect(read?.query).toContain('communicationKind')
    expect(read?.query).toContain('recipients[]')
    expect(read?.query).not.toMatch(/,\s*body\b/)
  })
})

describe('the old per-kind senders are gone', () => {
  it('crm.sendEmail is gone; crm.sendEmailBySfc survives only as the cnctl shim', () => {
    const crm = sponsorRouter._def.procedures as Record<string, unknown>
    expect(crm['crm.sendEmail']).toBeUndefined()
    expect(crm['crm.sendEmailBySfc']).toBeDefined()
    expect(crm['crm.sendCommunication']).toBeDefined()
  })
})
