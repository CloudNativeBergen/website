/**
 * @vitest-environment node
 *
 * sponsors through its Worker fetch handler: real envelope crypto, Sanity
 * mocked as a two-org dataset. The mock applies a tenant or status predicate
 * only when the query text carries it, and returns whole documents (private
 * CRM fields included), so dropping a predicate or a mapper allowlist leaks
 * here exactly as it would in Sanity.
 */
import { describe, expect, it, vi } from 'vitest'
import { GraphQLObjectType } from 'graphql'
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

type Row = Record<string, unknown>
const ORG: Record<string, string> = { conf_a: 'org_a', conf_b: 'org_b' }
const PRIVATE = {
  contactPersons: [{ name: 'Carl', email: 'carl@private.example' }],
  billing: { email: 'billing@private.example' },
  orgNumber: '999888777',
}
const tier = (conf: string, _id: string, title: string, amount?: number) => ({
  _id,
  conf,
  title,
  tagline: `${title} tagline`,
  tierType: amount ? 'standard' : 'special',
  price: amount ? [{ _key: 'p', amount, currency: 'NOK' }] : undefined,
  perks: [{ _key: 'k', label: 'Logo', description: 'On the site' }],
  soldOut: false,
  mostPopular: title === 'Gold',
  maxQuantity: 3,
  ticketEntitlement: 2,
})
const TIERS: Row[] = [
  tier('conf_a', 'tier_silver', 'Silver', 50000),
  tier('conf_a', 'tier_gold', 'Gold', 100000),
  tier('conf_a', 'tier_media', 'Media'),
  tier('conf_b', 'tier_b', 'B Gold', 90000),
]
const sponsor = (_id: string, name: string) => ({
  _id,
  name,
  website: `https://${_id}.example`,
  logo: `<svg>${name}</svg>`,
  logoBright: null,
  ...PRIVATE,
})
const SFC: Row[] = [
  { conf: 'conf_a', status: 'closed-won', tier: 'tier_silver', s: 'acme' },
  { conf: 'conf_a', status: 'closed-won', tier: 'tier_gold', s: 'globex' },
  { conf: 'conf_a', status: 'negotiating', tier: 'tier_gold', s: 'secret' },
  { conf: 'conf_a', status: 'closed-lost', tier: 'tier_gold', s: 'lost' },
  // closed-won but tierless: the site never shows it (groupSponsorsByTier).
  { conf: 'conf_a', status: 'closed-won', tier: null, s: 'notier' },
  { conf: 'conf_b', status: 'closed-won', tier: 'tier_b', s: 'initech' },
]

type P = { orgId: string; conferenceId: string }
const inTenant = (conf: unknown, q: string, p: P) =>
  (!q.includes('conference._ref == $conferenceId') ||
    conf === p.conferenceId) &&
  (!q.includes('conference->organization._ref == $orgId') ||
    ORG[conf as string] === p.orgId)
const tiersFor = (q: string, p: P) =>
  TIERS.filter((t) => inTenant(t.conf, q, p))
const sponsorsFor = (q: string, p: P) =>
  SFC.filter(
    (r) =>
      inTenant(r.conf, q, p) &&
      (!q.includes('status == "closed-won"') || r.status === 'closed-won'),
  ).map((r) => ({
    _sfcId: `sfc_${r.s}`,
    contractValue: 123456,
    contactPersons: PRIVATE.contactPersons,
    sponsor: sponsor(r.s as string, `${r.s}`.toUpperCase()),
    tier: TIERS.find((t) => t._id === r.tier) ?? null,
  }))

const fetch = vi.fn(async (q: string, p: P) => {
  if (q.startsWith('{ "tiers"')) {
    const [tq, sq] = q.split('"sponsors":')
    return { tiers: tiersFor(tq, p), sponsors: sponsorsFor(sq, p) }
  }
  return tiersFor(q, p)
})
vi.mock('@sanity/client', () => ({ createClient: () => ({ fetch }) }))

const { default: worker } = await import('./worker')
const { schema } = await import('./subgraph')

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
}
const tenant = (orgId: string, conferenceId: string | null): Envelope => ({
  typ: 'tenant',
  orgId,
  conferenceId,
  userId: null,
  orgRole: null,
  scopes: [],
})

async function post(query: string, as: Envelope) {
  const res = await worker.fetch(
    new Request('http://sponsors/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENVELOPE_HEADER]: await signer.sign(as),
      },
      body: JSON.stringify({ query }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

const TIER_FIELDS = `id name tagline tierType level soldOut mostPopular perks { label description }`
const ALL = `{
  sponsors { tier { ${TIER_FIELDS} } sponsor { id name website logo logoBright } }
  sponsorTiers { ${TIER_FIELDS} }
}`

describe('sponsors subgraph', () => {
  it("serves only the envelope's published sponsorships, highest tier first", async () => {
    const { data, errors } = await post(ALL, tenant('org_a', 'conf_a'))
    expect(errors).toBeUndefined()
    expect(
      data.sponsors.map(
        (x: Row) =>
          `${(x.sponsor as Row).id}:${(x.tier as Row).name}:${(x.tier as Row).level}`,
      ),
    ).toEqual(['globex:Gold:1', 'acme:Silver:2'])
    expect(data.sponsors[0].sponsor).toEqual({
      id: 'globex',
      name: 'GLOBEX',
      website: 'https://globex.example',
      logo: '<svg>GLOBEX</svg>',
      logoBright: null,
    })
    expect(
      data.sponsorTiers.map((t: Row) => [t.name, t.level, t.tierType]),
    ).toEqual([
      ['Gold', 1, 'standard'],
      ['Silver', 2, 'standard'],
      ['Media', 3, 'special'],
    ])
    expect(data.sponsorTiers[0]).toMatchObject({
      tagline: 'Gold tagline',
      mostPopular: true,
      soldOut: false,
      perks: [{ label: 'Logo', description: 'On the site' }],
    })
  })

  it('never crosses tenants: the other org, a foreign conference, no conference', async () => {
    const b = await post(ALL, tenant('org_b', 'conf_b'))
    expect(b.data.sponsors.map((x: Row) => (x.sponsor as Row).id)).toEqual([
      'initech',
    ])
    expect(b.data.sponsorTiers.map((t: Row) => t.id)).toEqual(['tier_b'])
    // org_b's envelope naming org_a's conference matches nothing.
    const forged = await post(ALL, tenant('org_b', 'conf_a'))
    expect(forged.errors).toBeUndefined()
    expect(forged.data).toEqual({ sponsors: [], sponsorTiers: [] })
    const none = await post(ALL, tenant('org_a', null))
    expect(none.data).toEqual({ sponsors: [], sponsorTiers: [] })
  })

  it('returns no private field, even though Sanity hands them over', async () => {
    const body = JSON.stringify(await post(ALL, tenant('org_a', 'conf_a')))
    for (const leak of [
      '@private.example',
      '999888777',
      '123456',
      '100000',
      'NOK',
      'secret',
      'notier',
    ])
      expect(body).not.toContain(leak)
  })

  it('exposes exactly the public field list per type', () => {
    const fields = (name: string) =>
      Object.keys(
        (schema.getType(name) as GraphQLObjectType).getFields(),
      ).sort()
    expect(fields('Sponsorship')).toEqual(['sponsor', 'tier'])
    expect(fields('Sponsor')).toEqual([
      'id',
      'logo',
      'logoBright',
      'name',
      'website',
    ])
    expect(fields('SponsorTier')).toEqual([
      'id',
      'level',
      'mostPopular',
      'name',
      'perks',
      'soldOut',
      'tagline',
      'tierType',
    ])
    expect(fields('SponsorPerk')).toEqual(['description', 'label'])
    const q = Object.keys(schema.getQueryType()!.getFields())
    expect(q.filter((f) => !f.startsWith('_')).sort()).toEqual([
      'sponsorTiers',
      'sponsors',
    ])
    // No price, contact or contract field anywhere in the schema.
    for (const t of Object.values(schema.getTypeMap()))
      if (t instanceof GraphQLObjectType && !t.name.startsWith('_'))
        for (const f of Object.keys(t.getFields()))
          expect(f).not.toMatch(
            /price|amount|currency|email|contact|contract|invoice|billing|value|status|quantity|ticket/i,
          )
  })
})
