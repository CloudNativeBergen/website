/**
 * @vitest-environment node
 *
 * The public sponsor seam through the gateway (#1772). One Sanity fixture
 * feeds both paths with the real GROQ engine: the Sanity path through the
 * site's own query, the API path through the real sponsors subgraph schema
 * over SanitySponsorSource. Flagged must equal unflagged up to the named
 * differences.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { createRequire } from 'node:module'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const h = vi.hoisted(() => ({ apiRead: true, apiCalls: 0, apiFails: false }))

vi.mock('@/lib/conference/konf-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/conference/konf-api')>()
  return {
    ...actual,
    rolloutFlags: async () =>
      process.env.KONF_API_DISABLED === '1'
        ? { apiRead: false, identityLogin: false, d1Write: false }
        : { apiRead: h.apiRead, identityLogin: false, d1Write: false },
    mergeKonfApiConference: async (_: string, c: unknown) => c,
  }
})

vi.mock('@/lib/sanity/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sanity/client')>()
  const client = {
    fetch: (q: string, p: Record<string, unknown>) => groq(q, p),
  }
  return {
    ...actual,
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { SanitySponsorSource } from '../../../services/sponsors/src/data/source'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getPublicSponsors } from '@/lib/sponsor/public'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
const BRIGHT = '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>'
const tier = (_id: string, title: string, amount: number) => ({
  _id,
  _type: 'sponsorTier',
  conference: ref('conf'),
  title,
  tagline: `${title} tagline`,
  tierType: 'standard',
  price: [{ _key: 'p', amount, currency: 'NOK' }],
  ticketEntitlement: 2,
})
const sfc = (
  _id: string,
  sponsor: string,
  t: string | null,
  status: string,
) => ({
  _id,
  _type: 'sponsorForConference',
  conference: ref('conf'),
  sponsor: ref(sponsor),
  ...(t ? { tier: ref(t) } : {}),
  status,
  contractValue: 99999,
})
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf',
    _type: 'conference',
    title: 'Conf',
    organization: ref('org'),
    domains: ['a.example'],
  },
  tier('gold', 'Gold', 100),
  tier('silver', 'Silver', 50),
  {
    _id: 's1',
    _type: 'sponsor',
    name: 'Acme',
    website: 'https://acme.example',
    logo: SVG,
    logoBright: BRIGHT,
  },
  {
    _id: 's2',
    _type: 'sponsor',
    name: 'Beta',
    website: 'https://beta.example',
    logo: SVG,
  },
  { _id: 's3', _type: 'sponsor', name: 'Secret prospect', logo: SVG },
  { _id: 's4', _type: 'sponsor', name: 'Tierless', logo: SVG },
  sfc('a', 's2', 'silver', 'closed-won'),
  sfc('b', 's1', 'gold', 'closed-won'),
  sfc('c', 's3', 'gold', 'prospect'),
  sfc('d', 's4', null, 'closed-won'),
]

async function groq(q: string, params: Record<string, unknown>) {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
}

const source = new SanitySponsorSource({
  fetch: groq,
} as unknown as ConstructorParameters<typeof SanitySponsorSource>[0])
const t = { orgId: 'org', conferenceId: 'conf' }
const context = {
  data: {
    sponsors: () => ({
      sponsors: () => source.sponsors(t),
      tiers: () => source.tiers(t),
    }),
  },
}
const SUBGRAPH = '../../../services/sponsors/src/subgraph'
const { schema } = (await import(/* @vite-ignore */ SUBGRAPH)) as {
  schema: unknown
}
const { graphql: execute } = createRequire(
  new URL('../../../services/sponsors/package.json', import.meta.url),
)('graphql') as {
  graphql: (args: {
    schema: unknown
    source: string
    contextValue: unknown
  }) => Promise<unknown>
}
vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
  h.apiCalls++
  if (h.apiFails) return new Response('down', { status: 502 })
  const body = init?.body ?? (await (url as Request).text())
  const { query } = JSON.parse(body as string)
  return Response.json(
    await execute({ schema, source: query, contextValue: context }),
  )
})

const CONF = { _id: 'conf', domains: ['a.example'], organization: ref('org') }
const dataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** The Sanity rows as the API maps them: the named differences applied. */
const asApi = (rows: ConferenceSponsor[]) =>
  rows
    .filter((r) => r.tier)
    .map(({ sponsor, tier }) => ({
      sponsor: {
        _id: sponsor._id,
        name: sponsor.name,
        website: sponsor.website,
        logo: null,
        logoBright: null,
        logoUrl: sponsor.logo ? dataUrl(sponsor.logo) : null,
        logoBrightUrl: sponsor.logoBright ? dataUrl(sponsor.logoBright) : null,
      },
      tier: {
        _id: tier!._id,
        title: tier!.title,
        tagline: tier!.tagline,
        tierType: tier!.tierType,
      },
    }))

async function sanityRows() {
  h.apiRead = false
  const calls = h.apiCalls
  const rows = await getPublicSponsors(CONF)
  expect(h.apiCalls).toBe(calls)
  h.apiRead = true
  return rows
}

beforeEach(() => {
  h.apiRead = true
  h.apiFails = false
  delete process.env.KONF_API_DISABLED
  process.env.KONF_API_URL = 'https://gateway.test/graphql'
})

describe('public sponsors through the API (#1772)', () => {
  it('flagged equals the Sanity read, logos as data URLs', async () => {
    const sanity = await sanityRows()
    expect(sanity.map((r) => r.sponsor.name)).toEqual([
      'Acme',
      'Beta',
      'Tierless',
    ])
    const calls = h.apiCalls
    const api = await getPublicSponsors(CONF)
    expect(h.apiCalls).toBe(calls + 1)
    expect(api).toEqual(asApi(sanity))
    expect(api[0].sponsor.logoUrl).toBe(dataUrl(SVG))
    // No raw SVG, price, contract or prospect ever comes from the API.
    expect(JSON.stringify(api)).not.toMatch(/<svg|price|99999|Secret/)
  })

  it('the conference read takes the API under publicSponsors only', async () => {
    const sanity = await sanityRows()
    const flagged = await getConferenceForDomain('a.example', {
      publicSponsors: true,
    })
    expect(flagged.conference.sponsors).toEqual(asApi(sanity))
    const calls = h.apiCalls
    for (const opts of [
      { sponsors: true },
      { publicSponsors: true, uncached: true },
    ]) {
      const r = await getConferenceForDomain('a.example', opts)
      expect(r.conference.sponsors).toEqual(sanity)
    }
    expect(h.apiCalls).toBe(calls)
  })

  it('an API error and KONF_API_DISABLED give the Sanity read', async () => {
    const sanity = await sanityRows()
    h.apiFails = true
    const calls = h.apiCalls
    expect(await getPublicSponsors(CONF)).toEqual(sanity)
    expect(h.apiCalls).toBe(calls + 1)
    h.apiFails = false
    process.env.KONF_API_DISABLED = '1'
    expect(await getPublicSponsors(CONF)).toEqual(sanity)
    expect(h.apiCalls).toBe(calls + 1)
  })
})
