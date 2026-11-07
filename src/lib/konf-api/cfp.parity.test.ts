/**
 * @vitest-environment node
 *
 * The public CFP seam through the gateway (#2087). One Sanity fixture feeds
 * both paths with the real GROQ engine: the Sanity path through the site's own
 * query, the API path through the real cfp subgraph schema over
 * SanityCfpSource. Flagged must equal unflagged.
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

import { SanityCfpSource } from '../../../services/cfp/src/data/source'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getPublicCfp } from '@/lib/proposal/cfp'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf',
    _type: 'conference',
    title: 'Conf',
    organization: ref('org'),
    domains: ['a.example'],
    topics: [ref('t1'), ref('t2')],
  },
  {
    _id: 't1',
    _type: 'topic',
    title: 'Platform',
    description: 'Build and run',
    color: '#112233',
    slug: { current: 'platform' },
  },
  {
    _id: 't2',
    _type: 'topic',
    title: 'Security',
    description: 'Zero trust',
    color: '#445566',
    slug: { current: 'security' },
  },
  {
    _id: 'sp1',
    _type: 'speaker',
    name: 'Ada Lovelace',
    email: 'ada@secret.example',
  },
  {
    _id: 'sp2',
    _type: 'speaker',
    name: 'Grace Hopper',
    email: 'grace@secret.example',
  },
  {
    _id: 'k2',
    _type: 'talk',
    conference: ref('conf'),
    status: 'confirmed',
    title: 'B talk',
    format: 'presentation_25',
    level: 'intermediate',
    language: 'english',
    audiences: ['developer', 'architect'],
    topics: [ref('t1')],
    speakers: [ref('sp1')],
    outline: 'secret outline',
    feedbackCode: 'SECRET1',
  },
  {
    _id: 'k1',
    _type: 'talk',
    conference: ref('conf'),
    status: 'confirmed',
    title: 'A talk',
    format: 'workshop_120',
    level: 'advanced',
    language: 'norwegian',
    audiences: ['operator'],
    topics: [ref('t1'), ref('t2')],
    speakers: [ref('sp1'), ref('sp2')],
  },
  {
    _id: 'k3',
    _type: 'talk',
    conference: ref('conf'),
    status: 'submitted',
    title: 'Secret submitted',
    speakers: [ref('sp1')],
  },
  {
    _id: 'k4',
    _type: 'talk',
    conference: ref('conf'),
    status: 'accepted',
    title: 'Secret unconfirmed',
    speakers: [ref('sp2')],
  },
  {
    _id: 'k5',
    _type: 'talk',
    conference: ref('conf'),
    status: 'draft',
    title: 'Secret draft',
    speakers: [ref('sp1')],
  },
]

async function groq(q: string, params: Record<string, unknown>) {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
}

const source = new SanityCfpSource({
  fetch: groq,
} as unknown as ConstructorParameters<typeof SanityCfpSource>[0])
const t = { orgId: 'org', conferenceId: 'conf' }
const context = {
  data: {
    cfp: () => ({
      cfp: () => source.cfp(t),
    }),
  },
}
const SUBGRAPH = '../../../services/cfp/src/subgraph'
const { schema } = (await import(/* @vite-ignore */ SUBGRAPH)) as {
  schema: unknown
}
const { graphql: execute } = createRequire(
  new URL('../../../services/cfp/package.json', import.meta.url),
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

async function sanityCfp() {
  h.apiRead = false
  const calls = h.apiCalls
  const cfp = await getPublicCfp(CONF)
  expect(h.apiCalls).toBe(calls)
  h.apiRead = true
  return cfp
}

beforeEach(() => {
  h.apiRead = true
  h.apiFails = false
  delete process.env.KONF_API_DISABLED
  process.env.KONF_API_URL = 'https://gateway.test/graphql'
})

describe('public CFP through the API (#2087)', () => {
  it('flagged equals the Sanity read, confirmed talks and public fields only', async () => {
    const sanity = await sanityCfp()
    expect(sanity.topics.map((x) => x.title)).toEqual(['Platform', 'Security'])
    expect(sanity.talks.map((x) => x.title)).toEqual(['A talk', 'B talk'])
    const calls = h.apiCalls
    const api = await getPublicCfp(CONF)
    expect(h.apiCalls).toBe(calls + 1)
    expect(api).toEqual(sanity)
    // No unconfirmed talk, outline, feedbackCode or speaker email comes from the API.
    expect(JSON.stringify(api)).not.toMatch(/secret|SECRET1|outline/i)
  })

  it('the conference read takes the API under publicCfp only', async () => {
    const sanity = await sanityCfp()
    const flagged = await getConferenceForDomain('a.example', {
      publicCfp: true,
    })
    expect(flagged.conference.topics).toEqual(sanity.topics)
    const calls = h.apiCalls
    for (const opts of [
      { topics: true },
      { publicCfp: true, uncached: true },
    ]) {
      const r = await getConferenceForDomain('a.example', opts)
      expect(r.conference.topics?.map((x) => x._id)).toEqual(['t1', 't2'])
    }
    expect(h.apiCalls).toBe(calls)
  })

  it('an API error and KONF_API_DISABLED give the Sanity read', async () => {
    const sanity = await sanityCfp()
    h.apiFails = true
    const calls = h.apiCalls
    expect(await getPublicCfp(CONF)).toEqual(sanity)
    expect(h.apiCalls).toBe(calls + 1)
    h.apiFails = false
    process.env.KONF_API_DISABLED = '1'
    expect(await getPublicCfp(CONF)).toEqual(sanity)
    expect(h.apiCalls).toBe(calls + 1)
  })
})
