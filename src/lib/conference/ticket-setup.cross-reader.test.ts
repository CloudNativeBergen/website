/**
 * @vitest-environment node
 *
 * Settings phase 3 (#2080), the owner's rule: every reader of a ticket-setup
 * field reads it through the one merge (`mergeKonfApiConference`), so every
 * reader below runs against the SAME fixture, Sanity holding one value and D1
 * another, and must see D1's. A reader left on Sanity fails here. Readers that
 * take a conference as a parameter get it from one of these paths; the lint
 * rule `d1/no-sanity-d1-conference-fields` catches a new direct GROQ read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/konf-api/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/konf-api/client')>()),
  konfApiHeaders: async (host: string) => ({
    'content-type': 'application/json',
    origin: `https://${host}`,
  }),
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))
const seen = vi.hoisted(() => ({ binding: null as unknown }))
vi.mock('@/lib/tickets/admin-access', () => ({
  resolveTicketingAdminAccess: async (b: unknown) => (
    (seen.binding = b),
    { state: 'off' }
  ),
}))

/** Sanity's copy: frozen, and different from D1's in every field. */
const SANITY = {
  _id: 'conf-1',
  organization: { _ref: 'org-1' },
  domains: ['2026.example.com'],
  title: 'T',
  ticketingProvider: 'checkin',
  checkinCustomerId: 1,
  checkinEventId: 4242,
  titoAccountSlug: 'sanity-acct',
  titoEventSlug: 'sanity-event',
  ticketCapacity: 100,
  ticketTargets: { enabled: false, targetCurve: 'linear', milestones: [] },
  ticketTypeRoles: [{ _key: 'k', typeName: 'Sanity', admits: true }],
  publicFreeTicketIds: [1],
  workshopRegistrationSponsorStart: '2026-01-01T08:00:00Z',
  workshopRegistrationStart: '2026-01-02T08:00:00Z',
  workshopRegistrationEnd: '2026-01-03T08:00:00Z',
  workshopEarlyAccessTicketTypes: ['Sanity'],
  workshopReminderLastSentAt: '2026-01-04T08:00:00Z',
  workshopReminderLastSentCount: 1,
}
/** D1's copy, as the gateway answers it. The binding agrees (see below). */
const D1 = {
  ticketingProvider: 'tito',
  checkinCustomerId: 2,
  checkinEventId: 4242,
  titoAccountSlug: 'd1-acct',
  titoEventSlug: 'd1-event',
  ticketCapacity: 500,
  ticketTargetsEnabled: true,
  ticketSalesStartDate: '2026-02-01',
  ticketTargetCurve: 's_curve',
  ticketTargetMilestones: [
    { date: '2026-03-01', targetPercentage: 50, label: 'Half' },
  ],
  ticketTypeRoles: [{ typeName: 'D1', admits: null, grantsWorkshop: true }],
  publicFreeTicketIds: [2],
  workshopRegistrationSponsorStart: '2026-02-01T08:00:00Z',
  workshopRegistrationStart: '2026-02-02T08:00:00Z',
  workshopRegistrationEnd: '2026-02-03T08:00:00Z',
  workshopEarlyAccessTicketTypes: ['D1'],
  workshopReminderLastSentAt: '2026-02-04T08:00:00Z',
  workshopReminderLastSentCount: 2,
}
/** What a reader must see for each Sanity field name. */
const EXPECTED: Record<string, unknown> = {
  ticketingProvider: 'tito',
  checkinCustomerId: 2,
  titoAccountSlug: 'd1-acct',
  titoEventSlug: 'd1-event',
  ticketCapacity: 500,
  ticketTargets: {
    enabled: true,
    salesStartDate: '2026-02-01',
    targetCurve: 's_curve',
    milestones: [{ date: '2026-03-01', targetPercentage: 50, label: 'Half' }],
  },
  ticketTypeRoles: [{ _key: 'd1-0', typeName: 'D1', grantsWorkshop: true }],
  publicFreeTicketIds: [2],
  workshopRegistrationSponsorStart: '2026-02-01T08:00:00Z',
  workshopRegistrationStart: '2026-02-02T08:00:00Z',
  workshopRegistrationEnd: '2026-02-03T08:00:00Z',
  workshopEarlyAccessTicketTypes: ['D1'],
  workshopReminderLastSentAt: '2026-02-04T08:00:00Z',
  workshopReminderLastSentCount: 2,
}

const sanityFetch = vi.fn(async (query: string) => {
  const doc = structuredClone(SANITY)
  if (query.includes('checkinEventId == $eventId')) return [doc]
  if (query.includes('"domainVerification"'))
    return { _id: 'dv', host: '2026.example.com', conference: doc }
  if (query.includes('"sponsorForConference"'))
    return {
      _id: 'sfc',
      contractStatus: 'contract-signed',
      conferenceDoc: doc,
      afterSigning: {
        dealStatus: 'closed-won',
        conferenceId: 'conf-1',
        discountCodes: [],
      },
    }
  return doc
})
vi.mock('@/lib/sanity/client', () => {
  const c = { fetch: (q: string) => sanityFetch(q) }
  return {
    clientWrite: c,
    clientRead: c,
    clientReadCached: c,
    clientReadUncached: c,
  }
})

/** The gateway: flags off (the env list flags the tenant), D1 as asked. */
const gateway = vi.fn(async (_: unknown, init: RequestInit) => {
  const { query } = JSON.parse(String(init.body)) as { query: string }
  if (query.includes('rolloutFlags'))
    return new Response(JSON.stringify({ data: { rolloutFlags: null } }))
  const asked = Object.fromEntries(
    Object.entries(D1).filter(([k]) => new RegExp(`\\b${k}\\b`).test(query)),
  )
  return new Response(
    JSON.stringify({ data: { conference: { id: 'conf-1', ...asked } } }),
  )
})

beforeEach(() => {
  vi.stubEnv('KONF_API_URL', 'https://api.example.com/graphql')
  vi.stubEnv('KONF_API_TENANTS', 'conf-1')
  vi.stubEnv('KONF_SITE_SIGNING_KEY', '{"kid":"k"}')
  vi.stubGlobal('fetch', gateway)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k]]))
const ALL = Object.keys(EXPECTED)

describe('every ticket-setup reader sees D1 through the one merge', () => {
  it('the cached conference read (pages, routers, jobs, emails)', async () => {
    const { getConferenceForDomain } = await import('./sanity')
    const { conference } = await getConferenceForDomain('2026.example.com')
    expect(pick(conference as never, ALL)).toEqual(EXPECTED)
  })

  it('mergeConference on a server-side row (marketing, reminders, registration)', async () => {
    const { mergeConference } = await import('./merge')
    expect(pick(await mergeConference(structuredClone(SANITY)), ALL)).toEqual(
      EXPECTED,
    )
  })

  it('the ticket-sold webhook: tenant and full conference', async () => {
    const {
      getConferenceByCheckinEventId,
      getConferenceTenantByCheckinEventId,
    } = await import('./sanity')
    const { tenant } = await getConferenceTenantByCheckinEventId(4242)
    expect(tenant?.ticketingProvider).toBe('tito')
    const { conference } = await getConferenceByCheckinEventId(4242)
    expect(pick(conference as never, ALL)).toEqual(EXPECTED)
  })

  it('domain verification: the claiming conference', async () => {
    const { getDomainClaim } = await import('@/lib/domain-verification/sanity')
    const claim = await getDomainClaim('dv')
    expect(claim?.conference?.ticketingProvider).toBe('tito')
  })

  it('marketing snapshots: the ticketing binding', async () => {
    const { readTicketOutcomes } =
      await import('@/lib/marketing/snapshots/sanity')
    await expect(readTicketOutcomes('conf-1')).rejects.toThrow()
    expect(
      pick(seen.binding as never, [
        'ticketingProvider',
        'checkinCustomerId',
        'titoAccountSlug',
        'titoEventSlug',
      ]),
    ).toEqual(
      pick(EXPECTED, [
        'ticketingProvider',
        'checkinCustomerId',
        'titoAccountSlug',
        'titoEventSlug',
      ]),
    )
  })

  it('the sponsor portal: the workshop windows', async () => {
    const { validateRegistrationToken } =
      await import('@/lib/sponsor-crm/registration')
    const { sponsor, error } = await validateRegistrationToken('t')
    expect(error).toBeUndefined()
    expect(sponsor?.afterSigning).toMatchObject({
      workshopSponsorStart: EXPECTED.workshopRegistrationSponsorStart,
      workshopOpening: EXPECTED.workshopRegistrationStart,
    })
  })
})
