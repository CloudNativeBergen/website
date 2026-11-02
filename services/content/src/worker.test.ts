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
  { _id: 'conf_b', org: 'org_b', title: 'Conf B' },
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
const conference = (as?: Envelope | string) =>
  post('{ conference { id title primaryColor socialLinks visibility } }', as)
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
})
