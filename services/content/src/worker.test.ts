/**
 * @vitest-environment node
 *
 * content through its Worker fetch handler: real envelope crypto, Sanity
 * mocked as a two-tenant dataset that applies the query's own parameters.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const DOCS = [
  {
    _id: 'conf_a',
    org: 'org_a',
    title: ' Conf A ',
    theme: { primaryColor: '#000' },
  },
  {
    _id: 'conf_b',
    org: 'org_b',
    title: 'Conf B',
    announcement: [{ _type: 'block', children: [{ text: 'Hi' }] }],
    cfpStartDate: '2026-01-01',
    programDate: '2026-03-01',
    recordingsLiveDate: '2026-12-01',
    sponsorRegistrationLink: 'https://x/sponsor',
    speakerRegistrationLink: 'https://x/speaker',
    volunteerRegistrationLink: 'https://x/volunteer',
    registrationEnabled: true,
    ticketCustomization: { heroHeadline: 'Tickets', showVanityMetrics: true },
    ticketInclusions: [{ title: 'Lunch' }],
    ticketFaqs: [{ question: 'Q?', answer: 'A.' }],
    vanityMetrics: [{ label: 'Talks', value: '40' }],
    socialHashtag: '#cnb',
    venueTravelInfo: 'Train',
    localRecommendations: 'Fish',
    formats: ['lightning_10'],
    organizer: 'Org B AS',
    organizerAddress: 'Street 1',
    speakerInfo: { travelPolicy: 'Covered' },
    sponsorshipCustomization: { heroHeadline: 'Sponsor us' },
    lifecycleHeadline: ' Moved ',
    lifecycleMessage: '',
    homepageSections: [
      {
        _type: 'homepageHero',
        _key: 'h',
        variant: 'split',
        heroHeadline: 'Go',
        ctaOverrides: [{ label: 'Buy', href: '/tickets' }],
      },
      { _type: 'homepageSaveTheDate', _key: 'sd', heading: 'Save' },
      { _type: 'homepageFeaturedSpeakers', _key: 'fs', heading: 'Speakers' },
      { _type: 'homepageProgramHighlights', _key: 'ph' },
      { _type: 'homepageOrganizers', _key: 'o', heading: 'Team' },
      { _type: 'homepageSponsors', _key: 's', showCta: false },
      { _type: 'homepageGallery', _key: 'g', heading: 'Photos' },
      { _type: 'homepageMetrics', _key: 'm', heading: 'Numbers' },
      {
        _type: 'homepageCtaBanner',
        _key: 'c',
        heading: 'Join',
        body: 'Now',
        buttonLabel: 'Go',
        buttonHref: '/x',
      },
      { _type: 'homepageRichText', _key: 'r', content: [{ _type: 'block' }] },
      {
        _type: 'homepageFaq',
        _key: 'f',
        source: 'own',
        items: [{ question: 'Q', answer: 'A' }],
      },
      { _type: 'homepageCountdown', _key: 'cd', liveMessage: 'Live' },
      { _type: 'homepageVenue', _key: 'v', heading: 'Venue', hidden: true },
      { _type: 'homepageUnknown', _key: 'u' },
    ],
  },
  {
    _id: 'conf_x',
    org: 'org_a',
    title: 'Cancelled',
    lifecycleStatus: 'cancelled',
  },
]
const fetch = vi.fn(
  async (query: string, p: { orgId: string; conferenceId: string }) => {
    expect(query).toContain('organization._ref == $orgId')
    expect(query).toContain('_id == $conferenceId')
    const d = DOCS.find((d) => d._id === p.conferenceId && d.org === p.orgId)
    return d ? { ...d, org: undefined } : null
  },
)
vi.mock('@sanity/client', () => ({ createClient: () => ({ fetch }) }))

const { default: worker } = await import('./worker')

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
}
const tenant = (
  orgId: string,
  conferenceId: string | null,
  orgRole: string | null = null,
): Envelope => ({
  typ: 'tenant',
  orgId,
  conferenceId,
  userId: null,
  orgRole,
  scopes: [],
})

async function post(query: string, as?: Envelope | string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (as)
    headers[ENVELOPE_HEADER] =
      typeof as === 'string' ? as : await signer.sign(as)
  const res = await worker.fetch(
    new Request('http://content/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return { status: res.status, body: (await res.json()) as any }
}
const conference = (
  as?: Envelope | string,
  query = '{ conference { id title primaryColor socialLinks visibility } }',
) => post(query, as)
const entity = async (id: string, as: Envelope) =>
  (
    await post(
      `{ _entities(representations: [{ __typename: "Conference", id: "${id}" }]) { ... on Conference { id title } } }`,
      as,
    )
  ).body.data._entities[0]

describe('content subgraph', () => {
  it("serves the envelope's Conference with the backfill mapping", async () => {
    const { body } = await conference(tenant('org_a', 'conf_a'))
    expect(body.data.conference).toEqual({
      id: 'conf_a',
      title: 'Conf A',
      primaryColor: '#000',
      socialLinks: [],
      visibility: 'live',
    })
  })

  it("never returns another tenant's Conference", async () => {
    // Org A with B's conference id: the org filter misses.
    expect((await conference(tenant('org_a', 'conf_b'))).body.data).toEqual({
      conference: null,
    })
    expect(
      (await conference(tenant('org_b', 'conf_b'))).body.data.conference.id,
    ).toBe('conf_b')
    for (const [, p] of fetch.mock.calls) expect(p.orgId).toMatch(/^org_/)
  })

  it("resolves the Conference entity only for the envelope's own id", async () => {
    expect(await entity('conf_a', tenant('org_a', 'conf_a'))).toEqual({
      id: 'conf_a',
      title: 'Conf A',
    })
    // Tenant B's id under A's envelope, with or without a conference in it.
    expect(await entity('conf_b', tenant('org_a', 'conf_a'))).toBeNull()
    expect(await entity('conf_b', tenant('org_a', null))).toBeNull()
  })

  it('hides an unpublished Conference from non-members', async () => {
    expect(
      (await conference(tenant('org_a', 'conf_x'))).body.data.conference,
    ).toBeNull()
    expect(
      (await conference(tenant('org_a', 'conf_x', 'member'))).body.data
        .conference.title,
    ).toBe('Cancelled')
  })

  it('answers null without a conference in the envelope', async () => {
    fetch.mockClear()
    expect(
      (await conference(tenant('org_a', null))).body.data.conference,
    ).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a missing or forged envelope', async () => {
    expect((await conference()).status).toBe(401)
    const forged = await (
      await createSigner((await generateEnvelopeKeyPair()).privatePem)
    ).sign(tenant('org_a', 'conf_a'))
    expect((await conference(forged)).status).toBe(403)
  })

  const field = async (q: string, role: string | null = null) => {
    const { body } = await conference(
      tenant('org_b', 'conf_b', role),
      `{ conference { ${q} } }`,
    )
    expect(body.errors).toBeUndefined()
    return body.data.conference
  }

  it('serves announcement, dates and plain-text info', async () => {
    expect(
      await field(
        'announcement cfpStartDate cfpEndDate programDate recordingsLiveDate socialHashtag venueTravelInfo localRecommendations formats organizer organizerAddress',
      ),
    ).toEqual({
      announcement: JSON.stringify([
        { _type: 'block', children: [{ text: 'Hi' }] },
      ]),
      cfpStartDate: '2026-01-01',
      cfpEndDate: null,
      programDate: '2026-03-01',
      recordingsLiveDate: '2026-12-01',
      socialHashtag: '#cnb',
      venueTravelInfo: 'Train',
      localRecommendations: 'Fish',
      formats: ['lightning_10'],
      organizer: 'Org B AS',
      organizerAddress: 'Street 1',
    })
  })

  it('serves speaker, sponsorship and lifecycle copy', async () => {
    expect(
      await field(
        'speakerInfo sponsorshipCustomization lifecycleHeadline lifecycleMessage',
      ),
    ).toEqual({
      speakerInfo: '{"travelPolicy":"Covered"}',
      sponsorshipCustomization: '{"heroHeadline":"Sponsor us"}',
      lifecycleHeadline: 'Moved',
      lifecycleMessage: null,
    })
  })

  it('keeps ticket invite links for org members', async () => {
    const q =
      'registrationEnabled volunteerRegistrationLink sponsorRegistrationLink speakerRegistrationLink'
    expect(await field(q)).toEqual({
      registrationEnabled: true,
      volunteerRegistrationLink: 'https://x/volunteer',
      sponsorRegistrationLink: null,
      speakerRegistrationLink: null,
    })
    expect(await field(q, 'member')).toMatchObject({
      sponsorRegistrationLink: 'https://x/sponsor',
      speakerRegistrationLink: 'https://x/speaker',
    })
  })

  it('serves the ticket page content', async () => {
    expect(
      await field(
        'ticketCustomization { heroHeadline groupDiscountInfo showVanityMetrics } ticketInclusions { title description } ticketFaqs { question answer } vanityMetrics { label value }',
      ),
    ).toEqual({
      ticketCustomization: {
        heroHeadline: 'Tickets',
        groupDiscountInfo: null,
        showVanityMetrics: true,
      },
      ticketInclusions: [{ title: 'Lunch', description: null }],
      ticketFaqs: [{ question: 'Q?', answer: 'A.' }],
      vanityMetrics: [{ label: 'Talks', value: '40' }],
    })
  })

  const BLOCKS = `homepageBlocks { __typename key variant hidden
    ... on HomepageHero { heroHeadline ctaOverrides { label href } }
    ... on HomepageSaveTheDate { heading description }
    ... on HomepageFeaturedSpeakers { heading }
    ... on HomepageOrganizers { heading }
    ... on HomepageSponsors { showCta ctaHeading }
    ... on HomepageGallery { heading }
    ... on HomepageMetrics { heading }
    ... on HomepageCtaBanner { heading body buttonLabel buttonHref }
    ... on HomepageRichText { content }
    ... on HomepageFaq { source items { question answer } }
    ... on HomepageCountdown { targetOverride liveMessage }
    ... on HomepageVenue { heading } }`

  it('types every homepage block and drops unknown ones', async () => {
    const blocks = (await field(BLOCKS)).homepageBlocks
    const by = Object.fromEntries(
      blocks.map((b: { key: string }) => [b.key, b]),
    )
    expect(blocks.map((b: { __typename: string }) => b.__typename)).toEqual([
      'HomepageHero',
      'HomepageSaveTheDate',
      'HomepageFeaturedSpeakers',
      'HomepageProgramHighlights',
      'HomepageOrganizers',
      'HomepageSponsors',
      'HomepageGallery',
      'HomepageMetrics',
      'HomepageCtaBanner',
      'HomepageRichText',
      'HomepageFaq',
      'HomepageCountdown',
    ])
    expect(by.h).toMatchObject({
      variant: 'split',
      hidden: false,
      heroHeadline: 'Go',
      ctaOverrides: [{ label: 'Buy', href: '/tickets' }],
    })
    expect(by.sd).toMatchObject({ heading: 'Save', description: null })
    expect(by.fs.heading).toBe('Speakers')
    expect(by.ph.variant).toBeNull()
    expect(by.o.heading).toBe('Team')
    expect(by.s).toMatchObject({ showCta: false, ctaHeading: null })
    expect(by.g.heading).toBe('Photos')
    expect(by.m.heading).toBe('Numbers')
    expect(by.c).toMatchObject({
      heading: 'Join',
      body: 'Now',
      buttonLabel: 'Go',
      buttonHref: '/x',
    })
    expect(JSON.parse(by.r.content)).toEqual([{ _type: 'block' }])
    expect(by.f).toMatchObject({
      source: 'own',
      items: [{ question: 'Q', answer: 'A' }],
    })
    expect(by.cd).toMatchObject({ liveMessage: 'Live', targetOverride: null })
  })

  it('shows hidden blocks to org members only', async () => {
    const blocks = (await field(BLOCKS, 'member')).homepageBlocks
    expect(blocks.at(-1)).toMatchObject({
      __typename: 'HomepageVenue',
      hidden: true,
      heading: 'Venue',
    })
  })

  it("never returns another tenant's new fields", async () => {
    const { body } = await conference(
      tenant('org_a', 'conf_b', 'owner'),
      '{ conference { organizer homepageBlocks { key } } }',
    )
    expect(body.data.conference).toBeNull()
  })

  it('leaves hidden blocks out of the deprecated JSON for non-members', async () => {
    const keys = async (role: string | null) =>
      JSON.parse((await field('homepageSections', role)).homepageSections).map(
        (b: { _key: string }) => b._key,
      )
    expect(await keys(null)).not.toContain('v')
    expect(await keys('member')).toContain('v')
  })
})
