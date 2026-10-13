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
/** The visible text of an email: tags out, entities and runs of space folded. */
const textOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
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
