/**
 * @vitest-environment node
 *
 * Settings phase 2 (#2038), the owner's rule: every reader of the 11 phase 2
 * fields reads them through the one merge (`mergeConference` /
 * `mergeKonfApiConference`). Every reader below runs against the SAME
 * fixture, Sanity holding one value and D1 another for every field, and must
 * see D1. A reader that bypasses the merge fails here; the lint rule
 * `d1/no-sanity-d1-conference-fields` catches a new direct GROQ read.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PHASE2_PRIVATE_FIELDS } from './konf-api'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: '2026.example.com' })),
}))
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
const seen = vi.hoisted(() => ({
  binding: null as unknown,
  homepageBinding: null as unknown,
}))
vi.mock('@/lib/tickets/admin-access', () => ({
  resolveTicketingAdminAccess: async (b: unknown) => (
    (seen.binding = b),
    { state: 'off' }
  ),
}))
vi.mock('@/lib/tickets/public-read', () => ({
  getPublicTicketTypes: async (b: unknown) => (
    (seen.homepageBinding = b),
    {
      status: 'ok',
      event: {},
      tickets: [],
      freeTickets: [],
      complimentaryTickets: [],
    }
  ),
}))

/** Sanity's copy: frozen, and different from D1's in every field. */
const SANITY = {
  _id: 'conf-1',
  organization: { _ref: 'org-1' },
  domains: ['2026.example.com'],
  title: 'T',
  contactEmail: 'contact@sanity.example',
  cfpEmail: 'cfp@sanity.example',
  sponsorEmail: 'sponsor@sanity.example',
  volunteerRegistrationLink: 'https://sanity.example/volunteer',
  sponsorRegistrationLink: 'https://sanity.example/sponsor-pass',
  speakerRegistrationLink: 'https://sanity.example/speaker-pass',
  salesNotificationChannel: '#sanity-sales',
  cfpNotificationChannel: '#sanity-cfp',
  speakerSlackChannel: '#sanity-speakers',
  speakerSlackInviteUrl: 'https://sanity.example/slack-speakers',
  volunteerSlackInviteUrl: 'https://sanity.example/slack-volunteers',
}
/** D1's copy, as the gateway answers it. */
const D1 = {
  contactEmail: 'contact@d1.example',
  cfpEmail: 'cfp@d1.example',
  sponsorEmail: 'sponsor@d1.example',
  volunteerRegistrationLink: 'https://d1.example/volunteer',
  sponsorRegistrationLink: 'https://d1.example/sponsor-pass',
  speakerRegistrationLink: 'https://d1.example/speaker-pass',
  salesNotificationChannel: '#d1-sales',
  cfpNotificationChannel: '#d1-cfp',
  speakerSlackChannel: '#d1-speakers',
  speakerSlackInviteUrl: 'https://d1.example/slack-speakers',
  volunteerSlackInviteUrl: 'https://d1.example/slack-volunteers',
}
/** Every phase 2 field is read from D1 by every reader that sees it. */
const EXPECTED: Record<string, unknown> = D1
const ALL = Object.keys(EXPECTED)
const PUBLIC = ['contactEmail', 'cfpEmail', 'sponsorEmail']
/**
 * Never on a public page's conference object: the seven members-only fields,
 * and the volunteer link, which the site keeps opt-in.
 */
const NOT_PUBLIC = [...PHASE2_PRIVATE_FIELDS, 'volunteerRegistrationLink']

const sanityFetch = vi.fn(async (query: string) => {
  const doc = structuredClone(SANITY)
  if (query.includes('conference._ref == $conferenceId'))
    return [{ _id: 'sfc', conference: doc }]
  if (query.includes('"sponsorForConference"'))
    return {
      _id: 'sfc',
      contractStatus: 'contract-signed',
      conferenceDoc: doc,
      conference: doc,
      afterSigning: {
        dealStatus: 'closed-won',
        conferenceId: 'conf-1',
        discountCodes: ['CODE'],
      },
    }
  if (query.includes('"volunteer"')) return { _id: 'v', conference: doc }
  if (query.includes('"conference"') && query.includes('defined(endDate)'))
    return [{ ...doc, endDate: '2999-01-01' }]
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

/** Overrides of D1's answer, per test; ticketCapacity is phase 3. */
let d1Extra: Record<string, unknown> = {}
const gateway = vi.fn(async (_: unknown, init: RequestInit) => {
  const { query } = JSON.parse(String(init.body)) as { query: string }
  if (query.includes('rolloutFlags'))
    return new Response(
      JSON.stringify({ data: { rolloutFlags: { apiRead: true } } }),
    )
  const asked = Object.fromEntries(
    Object.entries({ ...D1, ticketCapacity: 500, ...d1Extra }).filter(([k]) =>
      new RegExp(`\\b${k}\\b`).test(query),
    ),
  )
  return new Response(
    JSON.stringify({ data: { conference: { id: 'conf-1', ...asked } } }),
  )
})

beforeEach(() => {
  d1Extra = {}
  vi.stubEnv('KONF_API_URL', 'https://api.example.com/graphql')
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
const publicQueries = () =>
  gateway.mock.calls
    .map(([, init]) => String((init as RequestInit).body))
    .filter((b) => !b.includes('checkinCustomerId'))

describe('every phase 2 settings reader sees each field from D1 (#2038)', () => {
  it('a public page: the public emails from D1, no members-only field', async () => {
    const { getConferenceForDomain } = await import('./sanity')
    const { conference } = await getConferenceForDomain('2026.example.com')
    for (const k of NOT_PUBLIC) {
      expect(SANITY, k).toHaveProperty(k)
      expect(conference, k).not.toHaveProperty(k)
    }
    expect(pick(conference as never, PUBLIC)).toEqual(pick(D1, PUBLIC))
    // The cached public query never asks for a members-only field.
    for (const body of publicQueries())
      for (const k of PHASE2_PRIVATE_FIELDS) expect(body).not.toContain(k)
  })

  it('the public homepage: the conference props carry no members-only field', async () => {
    const { default: Home } = await import('@/app/(main)/page')
    const outer = (await Home()) as ReactElement<{ domain: string }>
    const tree = await (
      outer.type as (p: {
        domain: string
      }) => Promise<
        ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>
      >
    )(outer.props)
    const withConf = tree.props.children.filter(
      (el) => el && typeof el === 'object' && 'conference' in el.props,
    )
    expect(withConf.length).toBeGreaterThan(0)
    const html = JSON.stringify(withConf.map((el) => el.props))
    for (const k of NOT_PUBLIC) expect(html, k).not.toContain(k)
    for (const v of [
      ...NOT_PUBLIC.map((k) => (D1 as Record<string, string>)[k]),
      ...NOT_PUBLIC.map(
        (k) => (SANITY as unknown as Record<string, string>)[k],
      ),
    ])
      expect(html).not.toContain(v)
  })

  it('the server-side conference read with every opt-in', async () => {
    const { getConferenceForDomain } = await import('./sanity')
    const { conference } = await getConferenceForDomain('2026.example.com', {
      includeTicketSetup: true,
      includeSponsorRegistrationLink: true,
      includeSpeakerRegistrationLink: true,
      includeVolunteerRegistrationLink: true,
    })
    expect(pick(conference as never, ALL)).toEqual(EXPECTED)
  })

  it('a link opt-in alone still reads the link from D1', async () => {
    const { getConferenceForDomain } = await import('./sanity')
    const { conference } = await getConferenceForDomain('2026.example.com', {
      includeSponsorRegistrationLink: true,
    })
    expect(conference.sponsorRegistrationLink).toBe(D1.sponsorRegistrationLink)
    expect(conference).not.toHaveProperty('salesNotificationChannel')
  })

  it('mergeConference with ticketSetup (crons, weekly update, sponsor alerts)', async () => {
    const { mergeConference } = await import('./merge')
    expect(
      pick(
        await mergeConference(structuredClone(SANITY), { ticketSetup: true }),
        ALL,
      ),
    ).toEqual(EXPECTED)
  })

  it('mergeConference with settings replaces only the projected keys', async () => {
    const { mergeConference } = await import('./merge')
    const row = {
      _id: 'conf-1',
      domains: SANITY.domains,
      organization: SANITY.organization,
      salesNotificationChannel: SANITY.salesNotificationChannel,
    }
    const merged = await mergeConference(row, { settings: true })
    expect(merged.salesNotificationChannel).toBe(D1.salesNotificationChannel)
    for (const k of PHASE2_PRIVATE_FIELDS.filter(
      (k) => k !== 'salesNotificationChannel',
    ))
      expect(merged, k).not.toHaveProperty(k)
    // Nor the phase 3 ticket setup.
    expect(merged).not.toHaveProperty('ticketCapacity')
  })

  it('a malformed D1 value keeps Sanity', async () => {
    d1Extra = {
      contactEmail: 'not an email',
      volunteerRegistrationLink: 'http://plain.example',
      salesNotificationChannel: '#bad channel',
      sponsorRegistrationLink: 'javascript:alert(1)',
    }
    const { mergeConference } = await import('./merge')
    const merged = await mergeConference(structuredClone(SANITY), {
      ticketSetup: true,
    })
    for (const k of Object.keys(d1Extra))
      expect(merged[k as keyof typeof merged], k).toBe(
        SANITY[k as keyof typeof SANITY],
      )
    expect(merged.cfpEmail).toBe(D1.cfpEmail)
  })

  it('mergeConference without an option leaves the members-only fields on Sanity', async () => {
    const { mergeConference } = await import('./merge')
    const merged = await mergeConference(structuredClone(SANITY))
    expect(pick(merged, PHASE2_PRIVATE_FIELDS)).toEqual(
      pick(SANITY, PHASE2_PRIVATE_FIELDS),
    )
    expect(pick(merged, PUBLIC)).toEqual(pick(D1, PUBLIC))
  })

  it('the weekly update cron', async () => {
    const { getConferencesForWeeklyUpdate } = await import('./sanity')
    const [c] = await getConferencesForWeeklyUpdate()
    expect(pick(c as never, ALL)).toEqual(EXPECTED)
  })

  it('the sponsor portal: ticket link and emails', async () => {
    const { validateRegistrationToken } =
      await import('@/lib/sponsor-crm/registration')
    const { sponsor, error } = await validateRegistrationToken('t')
    expect(error).toBeUndefined()
    expect(sponsor?.afterSigning).toMatchObject({
      ticketUrl: D1.sponsorRegistrationLink,
      contactEmail: D1.contactEmail,
      sponsorEmail: D1.sponsorEmail,
    })
  })

  it('sponsor Slack alerts', async () => {
    const { getSfcForNotification } =
      await import('@/lib/sponsor-crm/registration')
    const sfc = await getSfcForNotification('sfc')
    expect(pick(sfc!.conference as never, ALL)).toEqual(EXPECTED)
  })

  it('sponsor message fan-out', async () => {
    const { getSponsorFanoutContext } = await import('@/lib/messaging/sponsor')
    const ctx = await getSponsorFanoutContext('sfc')
    expect(pick(ctx!.conference as never, ALL)).toEqual(EXPECTED)
  })

  it('contract signing: sponsorEmail and the sales channel', async () => {
    const { getSigningContract } = await import('@/lib/signing/sanity')
    const c = await getSigningContract('t')
    expect(c?.conference).toMatchObject({
      sponsorEmail: D1.sponsorEmail,
      salesNotificationChannel: D1.salesNotificationChannel,
    })
  })

  it('volunteers: emails, registration link and Slack invite', async () => {
    const { getVolunteerById } = await import('@/lib/volunteer/sanity')
    const { volunteer } = await getVolunteerById('v')
    expect(
      pick(volunteer!.conference as never, [
        ...PUBLIC,
        'volunteerRegistrationLink',
        'volunteerSlackInviteUrl',
      ]),
    ).toEqual(
      pick(D1, [
        ...PUBLIC,
        'volunteerRegistrationLink',
        'volunteerSlackInviteUrl',
      ]),
    )
  })

  it('the sponsor CRM list: sponsorEmail', async () => {
    const { listSponsorsForConference } = await vi.importActual<
      typeof import('@/lib/sponsor-crm/sanity')
    >('@/lib/sponsor-crm/sanity')
    const { sponsors } = await listSponsorsForConference('conf-1')
    expect(sponsors?.[0].conference?.sponsorEmail).toBe(D1.sponsorEmail)
  })
})
