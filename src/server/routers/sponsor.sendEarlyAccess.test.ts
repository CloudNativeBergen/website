/**
 * @vitest-environment node
 *
 * THE WORKSHOP EARLY-ACCESS KIND of `sponsor.crm.sendCommunication` (#1347,
 * spec `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §8), and the question the
 * Send modal asks before it offers the send
 * (`sponsor.crm.earlyAccess.sendReadiness`).
 *
 * REAL: both procedures and their guards, the link module with its query text
 * (`groq-js`) and its writes (`@sanity/mutator`), the portal address and the
 * destination policy, the window rule, the render path, and the audit record
 * as it is stored.
 * SUPPLIED: the request's conference, the workshop feature gate, the host's
 * verification record (`getDomainClaim`), `next/cache`, the clock, and the
 * email provider.
 * MODELLED: see `__tests__/helpers/versionedSanityStore.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
  getDomainClaim: vi.fn<(id: string) => Promise<DomainClaim | null>>(),
  revalidateTag: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const write = h.store.clients.clientWrite as {
    transaction: () => {
      create: (doc: Record<string, unknown>) => unknown
      commit: () => Promise<{ documentIds: string[] }>
    }
  }
  return {
    ...h.store.clients,
    clientWrite: {
      ...write,
      // The audit record is written with `create`: stored like every other
      // write, so the tests read the record back from the dataset.
      create: async (doc: Record<string, unknown>) => {
        const transaction = write.transaction()
        transaction.create(doc)
        const { documentIds } = await transaction.commit()
        return { _id: documentIds[0] }
      },
    },
  }
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: h.getDomainClaim,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/email/config', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  resolveEmailSender: async () => ({ client: { emails: { send: h.send } } }),
  retryWithBackoff: async <T>(fn: () => Promise<T>) => fn(),
}))

import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const MAIN_HOST = 'conf.example.org'
const SFC = 'sfc-acme'
const FIELD = 'workshopEarlyAccessToken'
const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const TAG = `sanity:workshop-early-access-${CONF}`
/** A stored token, in the shape of the ones this issues. */
const STORED = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const linkOf = (token: unknown) =>
  `https://${MAIN_HOST}/workshop/early-access/${token}`

/**
 * The conference's times. Oslo is two hours ahead of UTC on these days, so
 * the rendered times below are not what the server's own zone would print.
 */
const SPONSOR_START = '2026-09-24T08:00:00.000Z'
const OFFICIAL_OPENING = '2026-10-01T08:00:00.000Z'
const END = '2026-10-20T16:00:00.000Z'
const SPONSOR_START_TEXT = 'Thursday, September 24, 2026 at 10:00 AM'
const OFFICIAL_OPENING_TEXT = 'Thursday, October 1, 2026 at 10:00 AM'
/** Four days before the sponsor start time. */
const NOW = '2026-09-20T12:00:00.000Z'

const store = () => h.store!
const stored = (id: string) => store().doc(id)?.[FIELD]
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function sponsorDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SFC,
    _type: 'sponsorForConference',
    _rev: 'r0',
    conference: ref(CONF),
    sponsor: ref('sponsor-acme'),
    tier: ref('tier-gold'),
    status: 'closed-won',
    contactPersons: [
      {
        _key: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.test',
        isPrimary: true,
      },
      { _key: 'c-second', name: 'Ola Nordmann', email: 'ola@acme.test' },
      { _key: 'c-noemail', name: 'Per Hansen' },
    ],
    ...overrides,
  }
}

const DATASET = [
  { _id: CONF, _type: 'conference', organization: ref(ORG) },
  { _id: 'conf-b', _type: 'conference', organization: ref('org-b') },
  { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
  { _id: 'tier-gold', _type: 'sponsorTier', title: 'Gold' },
  sponsorDoc({
    _id: 'sfc-theirs',
    conference: ref('conf-b'),
    [FIELD]: 'their-token',
  }),
]

function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONF,
    title: 'Cloud Native Days Bergen',
    organizer: 'CNDN',
    organization: { _ref: ORG },
    sponsorEmail: 'sponsors@example.test',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-10-28',
    domains: [MAIN_HOST],
    workshopRegistrationSponsorStart: SPONSOR_START,
    workshopRegistrationStart: OFFICIAL_OPENING,
    workshopRegistrationEnd: END,
    ...overrides,
  }
}

function caller() {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(sponsorRouter)({
    req: { headers: new Headers(), url: `https://${MAIN_HOST}` },
    session: {
      expires: '2027-01-01T00:00:00.000Z',
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const block = (text: string) => ({
  _type: 'block',
  _key: 'b1',
  style: 'normal',
  children: [{ _type: 'span', _key: 's1', text }],
})

const INPUT = {
  sponsorForConferenceId: SFC,
  kind: 'workshop-early-access' as const,
  recipientKeys: ['c-primary'],
  subject: 'Workshop early access',
  message: JSON.stringify([block('Sign up before everyone else.')]),
}

const send = (overrides: Record<string, unknown> = {}) =>
  caller().crm.sendCommunication({ ...INPUT, ...overrides } as typeof INPUT)

/** Every audit record of a sent or failed email, as stored. */
const records = () =>
  store()
    .all()
    .filter((doc) => doc._type === 'sponsorActivity' && doc.communicationKind)
const sentHtml = (call = 0) => h.send.mock.calls[call][0].html as string
/**
 * The visible text of an email: tags out, entities and runs of space folded.
 * An inline tag leaves nothing behind, so a sentence reads as it is seen.
 */
const textOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<\/?(strong|em|a|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

beforeEach(() => {
  vi.clearAllMocks()
  h.revalidateTag.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  store().reset([...DATASET, sponsorDoc()])
  h.getConference.mockResolvedValue({
    conference: conference(),
    domain: MAIN_HOST,
    error: null,
  })
  h.workshopsEnabled.mockResolvedValue(true)
  h.getDomainClaim.mockImplementation(
    claimsById(provenClaim(MAIN_HOST, {}, { _id: CONF })),
  )
  h.send.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a send', () => {
  it('mails the link built from the token it stored, and records the kind, the body and the link', async () => {
    const result = await send()

    expect(result).toMatchObject({ success: true, recipientCount: 1 })
    const token = stored(SFC)
    expect(token).toMatch(new RegExp(`^${UUID}$`))
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0].to).toEqual(['kari@acme.test'])
    expect(sentHtml()).toContain(`href="${linkOf(token)}"`)

    expect(records()).toHaveLength(1)
    const [record] = records()
    expect(record).toMatchObject({
      communicationKind: 'workshop-early-access',
      deliveryStatus: 'sent',
      providerMessageId: 'resend-msg-1',
      description: 'Workshop early access sent to Kari Nordmann',
      subject: 'Workshop early access',
      attachments: [
        expect.objectContaining({
          label: 'Workshop early-access link',
          url: linkOf(token),
        }),
      ],
    })
    // The body is the email as sent: the organizer's text and the link.
    expect(record.body).toBe(sentHtml())
    expect(record.body).toContain('Sign up before everyone else.')
    expect(record.body).toContain(`href="${linkOf(token)}"`)
  })
})

describe('the link', () => {
  it('is created for a sponsor that has none: the address mailed is the stored token', async () => {
    expect(stored(SFC)).toBeUndefined()

    await send()

    const token = stored(SFC) as string
    expect(token).toMatch(new RegExp(`^${UUID}$`))
    expect(records()[0].attachments).toEqual([
      expect.objectContaining({ url: linkOf(token) }),
    ])
    // The one address in the email is the stored link's.
    expect(sentHtml().match(/\/workshop\/early-access\/[^"<\s]+/g)).toEqual([
      `/workshop/early-access/${token}`,
      `/workshop/early-access/${token}`,
      `/workshop/early-access/${token}`,
    ])
  })

  it('is the same in two sends to the same sponsor', async () => {
    await send()
    const first = stored(SFC)
    await send({ recipientKeys: ['c-second'] })

    expect(stored(SFC)).toBe(first)
    expect(h.send).toHaveBeenCalledTimes(2)
    expect(h.send.mock.calls[1][0].to).toEqual(['ola@acme.test'])
    expect(sentHtml(0)).toContain(`href="${linkOf(first)}"`)
    expect(sentHtml(1)).toContain(`href="${linkOf(first)}"`)
    expect(records().map((r) => r.attachments)).toEqual([
      [expect.objectContaining({ url: linkOf(first) })],
      [expect.objectContaining({ url: linkOf(first) })],
    ])
  })

  it('is the stored one for a sponsor that already has a link, and nothing is written to the sponsor', async () => {
    store().reset([...DATASET, sponsorDoc({ [FIELD]: STORED })])

    await send()

    expect(stored(SFC)).toBe(STORED)
    expect(sentHtml()).toContain(`href="${linkOf(STORED)}"`)
    expect(
      store()
        .commits.flat()
        .filter((mutation) => 'patch' in mutation),
    ).toEqual([])
  })

  it('expires the cached links AFTER the token is stored, so the first person to open the link finds it live', async () => {
    const storedAtExpiry: unknown[] = []
    h.revalidateTag.mockImplementation(() => {
      storedAtExpiry.push(stored(SFC))
    })

    await send()

    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
    expect(storedAtExpiry).toEqual([stored(SFC)])
    expect(storedAtExpiry[0]).toMatch(new RegExp(`^${UUID}$`))
  })

  it('stays, with the cached links expired, when the email then fails: the next send reuses it', async () => {
    h.send.mockResolvedValueOnce({
      data: null,
      error: { message: 'provider said no', statusCode: 422 },
    })

    await expect(send()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'provider said no',
    })

    const token = stored(SFC)
    expect(token).toMatch(new RegExp(`^${UUID}$`))
    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
    // The failed send is on record, with the link it would have carried.
    expect(records()).toHaveLength(1)
    expect(records()[0]).toMatchObject({
      communicationKind: 'workshop-early-access',
      deliveryStatus: 'failed',
      error: 'provider said no',
      attachments: [expect.objectContaining({ url: linkOf(token) })],
    })

    await send()
    expect(stored(SFC)).toBe(token)
    expect(sentHtml(1)).toContain(`href="${linkOf(token)}"`)
  })

  it('tells the organizer when an unpublished copy of the sponsor did not get it', async () => {
    store().reset([
      ...DATASET,
      sponsorDoc(),
      sponsorDoc({ _id: `drafts.${SFC}` }),
    ])
    store().failPatchesOf(`drafts.${SFC}`)

    const result = await send()

    expect(result).toMatchObject({ success: true, earlyAccessCopiesBehind: 1 })
    expect(sentHtml()).toContain(`href="${linkOf(stored(SFC))}"`)
  })

  it('reports no copy behind when every copy got it', async () => {
    store().reset([
      ...DATASET,
      sponsorDoc(),
      sponsorDoc({ _id: `drafts.${SFC}` }),
    ])

    const result = await send()

    expect(stored(`drafts.${SFC}`)).toBe(stored(SFC))
    expect(result).not.toHaveProperty('earlyAccessCopiesBehind')
  })
})

describe('the block', () => {
  it('goes out with a message edited down to nothing', async () => {
    await send({ message: '[]' })

    const token = stored(SFC)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(sentHtml()).toContain(`href="${linkOf(token)}"`)
    expect(textOf(sentHtml())).toContain('Early access to workshop sign-up')
    expect(records()[0].body).toContain(`href="${linkOf(token)}"`)
  })

  it('goes out with a message that is one empty paragraph', async () => {
    await send({ message: JSON.stringify([block('')]) })

    expect(sentHtml()).toContain(`href="${linkOf(stored(SFC))}"`)
  })

  it('names the sponsor start time and the official opening in the conference time zone', async () => {
    await send()

    const text = textOf(sentHtml())
    expect(text).toContain(
      `With this link, workshop sign-up opens on ${SPONSOR_START_TEXT}. For everyone else it opens on ${OFFICIAL_OPENING_TEXT}.`,
    )
    expect(text).toContain('All times are Europe/Oslo time.')
  })

  it('says who can use the link, how they sign in, and that it may be passed on', async () => {
    await send()

    const text = textOf(sentHtml())
    expect(text).toContain(
      'Each person needs a ticket that includes workshops, and signs in with the email address on that ticket.',
    )
    expect(text).toContain(
      'You may pass the link on to colleagues who are attending.',
    )
  })

  it('comes after the message the organizer wrote', async () => {
    await send()

    const html = sentHtml()
    expect(html.indexOf('Sign up before everyone else.')).toBeGreaterThan(-1)
    expect(html.indexOf('Early access to workshop sign-up')).toBeGreaterThan(
      html.indexOf('Sign up before everyone else.'),
    )
  })
})

/** What a refused send must leave behind: no email, no link, no record. */
function expectNothingHappened() {
  expect(h.send).not.toHaveBeenCalled()
  expect(stored(SFC)).toBeUndefined()
  expect(store().commits).toEqual([])
  expect(records()).toEqual([])
}

/**
 * Each case breaks ONE fact of the setup that sends (`a send`, above); every
 * other fact stays as it was, so no other refusal can answer for it. `words`
 * is the refusal as the organizer reads it, written out here.
 */
const REFUSALS: Array<{
  name: string
  reason: string
  words: string
  arrange: () => void | Promise<void>
}> = [
  {
    name: 'from localhost',
    reason: 'localhost',
    words:
      'Workshop early access cannot be sent from localhost. Deploy to a production domain first.',
    arrange: () => {
      h.getConference.mockResolvedValue({
        conference: conference(),
        domain: 'localhost:3000',
        error: null,
      })
    },
  },
  {
    name: 'the conference has no sponsor start time',
    reason: 'no-window',
    words:
      'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
    arrange: () => {
      h.getConference.mockResolvedValue({
        conference: conference({ workshopRegistrationSponsorStart: undefined }),
        domain: MAIN_HOST,
        error: null,
      })
    },
  },
  {
    name: 'the conference has no official opening',
    reason: 'no-window',
    words:
      'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
    arrange: () => {
      h.getConference.mockResolvedValue({
        conference: conference({ workshopRegistrationStart: undefined }),
        domain: MAIN_HOST,
        error: null,
      })
    },
  },
  {
    name: 'the sponsor start time is not earlier than the official opening',
    reason: 'no-window',
    words:
      'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
    arrange: () => {
      h.getConference.mockResolvedValue({
        conference: conference({
          workshopRegistrationSponsorStart: OFFICIAL_OPENING,
        }),
        domain: MAIN_HOST,
        error: null,
      })
    },
  },
  {
    name: 'the official opening has passed',
    reason: 'opening-passed',
    words:
      'The early-access period is over. Workshop registration has already opened for everyone or has closed, so a link gives no head start.',
    arrange: () => {
      // The instant of the opening itself: sign-up is open for everyone.
      vi.setSystemTime(new Date(OFFICIAL_OPENING))
    },
  },
  {
    name: 'the deal is not won',
    reason: 'not-won',
    words:
      'Workshop early access can only be sent to a sponsor with a won deal. Move the sponsor to Closed Won first.',
    arrange: () => {
      store().reset([...DATASET, sponsorDoc({ status: 'negotiating' })])
    },
  },
  {
    name: 'the portal has no working host',
    reason: 'no-portal',
    words:
      'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
    arrange: () => {
      // The main host has no verification record: it cannot sign anyone in.
      h.getDomainClaim.mockResolvedValue(null)
    },
  },
  {
    name: 'another conference claims the main host now',
    reason: 'no-portal',
    words:
      'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
    arrange: () => {
      h.getDomainClaim.mockImplementation(
        claimsById(provenClaim(MAIN_HOST, {}, { _id: 'conf-b' })),
      )
    },
  },
]

describe('a refused send', () => {
  it.each(REFUSALS)(
    'is refused, sends nothing and creates no link: $name',
    async ({ words, arrange }) => {
      await arrange()

      await expect(send()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: words,
      })
      expectNothingHappened()
    },
  )

  it('still sends one millisecond before the official opening', async () => {
    vi.setSystemTime(new Date(new Date(OFFICIAL_OPENING).getTime() - 1))

    await expect(send()).resolves.toMatchObject({ success: true })
  })

  it('is refused for a sponsor whose deal is no longer won, also when it has a link', async () => {
    store().reset([
      ...DATASET,
      sponsorDoc({ status: 'closed-lost', [FIELD]: STORED }),
    ])

    await expect(send()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message:
        'Workshop early access can only be sent to a sponsor with a won deal. Move the sponsor to Closed Won first.',
    })
    expect(h.send).not.toHaveBeenCalled()
    expect(stored(SFC)).toBe(STORED)
    expect(store().commits).toEqual([])
  })

  it('is refused where workshops are not enabled, before anything about the sponsor is read', async () => {
    h.workshopsEnabled.mockResolvedValue(false)

    await expect(send()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'The "workshops" feature is not enabled for this organization',
    })
    expectNothingHappened()
    expect(store().reads).toEqual([])
  })

  it('is refused for a sponsor of another conference as for a missing one, and reads nothing about it', async () => {
    const refusalOf = async (sponsorForConferenceId: string) =>
      send({ sponsorForConferenceId }).then(
        () => 'sent',
        (error: { code: string; message: string }) => ({
          code: error.code,
          message: error.message,
        }),
      )

    const foreign = await refusalOf('sfc-theirs')
    const readsForForeign = store().reads.map((read) => read.query)
    const missing = await refusalOf('sfc-nobody')

    expect(foreign).toMatchObject({ code: 'NOT_FOUND' })
    expect(foreign).toEqual(missing)
    // Only the ownership probe ran: nothing else names the sponsor.
    expect(readsForForeign).toHaveLength(1)
    expect(readsForForeign[0]).toContain('"memberOrgIds"')
    expect(h.send).not.toHaveBeenCalled()
    expect(stored('sfc-theirs')).toBe('their-token')
    expect(store().commits).toEqual([])
  })

  it('is refused for an unpublished copy of the sponsor, and reads nothing', async () => {
    store().reset([
      ...DATASET,
      sponsorDoc(),
      sponsorDoc({ _id: `drafts.${SFC}` }),
    ])

    await expect(
      send({ sponsorForConferenceId: `drafts.${SFC}` }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('unpublished copy'),
    })
    expect(store().reads).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
    expect(stored(`drafts.${SFC}`)).toBeUndefined()
  })

  // What the send primitive itself refuses comes BEFORE the link is created.
  it.each([
    [
      'a recipient who is not a contact of the sponsor',
      { recipientKeys: ['c-nobody'] },
      'A chosen recipient is not a contact on this sponsor',
    ],
    [
      'a recipient without an email address',
      { recipientKeys: ['c-noemail'] },
      'Per Hansen has no email address',
    ],
  ])('creates no link for %s', async (_case, input, message) => {
    await expect(send(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message,
    })
    expectNothingHappened()
  })

  it('creates no link for a contract template', async () => {
    store().put({
      _id: 'tpl-contract',
      _type: 'sponsorEmailTemplate',
      category: 'contract',
      organization: ref(ORG),
      title: 'Contract',
      subject: 'Contract',
    })

    await expect(
      send({ template: { id: 'tpl-contract' } }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Template is for another kind of email',
    })
    expectNothingHappened()
  })

  it('creates no link for the registration merge field, which only a registration send can fill', async () => {
    await expect(
      send({ subject: 'Open {{{SPONSOR_PORTAL_URL}}}' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expectNothingHappened()
  })

  it('other kinds are not asked about workshops: an information send goes out with workshops off and no window', async () => {
    h.workshopsEnabled.mockResolvedValue(false)
    h.getConference.mockResolvedValue({
      conference: conference({ workshopRegistrationSponsorStart: undefined }),
      domain: MAIN_HOST,
      error: null,
    })

    await expect(send({ kind: 'information' })).resolves.toMatchObject({
      success: true,
    })
    expect(stored(SFC)).toBeUndefined()
    expect(sentHtml()).not.toContain('/workshop/early-access/')
  })
})

describe('what the Send modal is told (sendReadiness)', () => {
  const readiness = (sponsorForConferenceId = SFC) =>
    caller().crm.earlyAccess.sendReadiness({ sponsorForConferenceId })

  it.each(REFUSALS)(
    'is the refusal the send itself gives, in the same words: $name',
    async ({ reason, words, arrange }) => {
      await arrange()

      const answer = await readiness()
      const sendError = await send().then(
        () => null,
        (error: { message: string }) => error.message,
      )

      expect(answer).toEqual({ refusal: { reason, message: words } })
      expect(sendError).toBe(words)
    },
  )

  it('answers the times and no address for a sponsor without a link, and creates none', async () => {
    const answer = await readiness()

    expect(answer).toEqual({
      refusal: null,
      url: null,
      sponsorStart: SPONSOR_START,
      officialOpening: OFFICIAL_OPENING,
    })
    expect(stored(SFC)).toBeUndefined()
    expect(store().commits).toEqual([])
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('answers the address of the link a sponsor already has: what a send will carry', async () => {
    store().reset([...DATASET, sponsorDoc({ [FIELD]: STORED })])

    const answer = await readiness()
    await send()

    expect(answer).toMatchObject({ refusal: null, url: linkOf(STORED) })
    expect(sentHtml()).toContain(`href="${linkOf(STORED)}"`)
  })

  it('reads nothing when the answer is known without a read: no window', async () => {
    h.getConference.mockResolvedValue({
      conference: conference({ workshopRegistrationSponsorStart: undefined }),
      domain: MAIN_HOST,
      error: null,
    })

    await readiness()

    // The ownership probe, and nothing after it: no sponsor, no host.
    expect(store().reads).toHaveLength(1)
    expect(store().reads[0].query).toContain('"memberOrgIds"')
    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })

  it('does not ask about the host for a sponsor whose deal is not won', async () => {
    store().reset([...DATASET, sponsorDoc({ status: 'negotiating' })])

    await readiness()

    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })

  it('refuses a sponsor of another conference as a missing one, before reading it', async () => {
    await expect(readiness('sfc-theirs')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(store().reads).toHaveLength(1)
    expect(store().reads[0].query).toContain('"memberOrgIds"')
    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })

  it('is refused where workshops are not enabled', async () => {
    h.workshopsEnabled.mockResolvedValue(false)

    await expect(readiness()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(store().reads).toEqual([])
  })
})
