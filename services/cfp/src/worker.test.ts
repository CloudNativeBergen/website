/**
 * @vitest-environment node
 *
 * cfp through its Worker fetch handler: real envelope crypto, and the real
 * GROQ evaluated by groq-js over a two-org dataset holding every proposal
 * status and speaker PII. Dropping a predicate or a mapper allowlist leaks
 * here exactly as it would in Sanity.
 */
import { describe, expect, it, vi } from 'vitest'
import { GraphQLObjectType } from 'graphql'
import { evaluate, parse } from 'groq-js'
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

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const STATUSES = [
  'draft',
  'submitted',
  'accepted',
  'waitlisted',
  'rejected',
  'withdrawn',
  'canceled',
  'deleted',
  'confirmed',
]
const talk = (conf: string, status: string) => ({
  _id: `${conf}_${status}`,
  _type: 'talk',
  conference: ref(conf),
  status,
  title: `${conf} ${status} title`,
  format: 'presentation_25',
  level: 'beginner',
  language: 'english',
  audiences: ['developer'],
  topics: [ref(`topic_${conf}`)],
  speakers: [ref(`speaker_${conf}`)],
  // Fields a proposal carries that must never leave.
  outline: 'PRIVATE outline',
  reviewSummary: { average: 4.2, note: 'PRIVATE review' },
  feedbackCode: 'PRIVATE-CODE',
  private: true,
})
// conf_a2 is org_a's other edition: only the conference predicate keeps it
// out of conf_a.
const ORG: Record<string, string> = {
  conf_a: 'org_a',
  conf_a2: 'org_a',
  conf_b: 'org_b',
}
const DATASET = Object.keys(ORG).flatMap((conf) => [
  {
    _id: conf,
    _type: 'conference',
    organization: ref(ORG[conf]),
    topics: [ref(`topic_${conf}`)],
    cfpEmail: 'PRIVATE-cfp@example.org',
  },
  {
    _id: `topic_${conf}`,
    _type: 'topic',
    title: `${conf} topic`,
    description: 'd',
    color: '#000',
  },
  {
    _id: `speaker_${conf}`,
    _type: 'speaker',
    name: `${conf} speaker`,
    email: 'PRIVATE@speaker.example',
    phone: 'PRIVATE-555',
    bio: 'PRIVATE bio',
  },
  ...STATUSES.map((s) => talk(conf, s)),
])

const fetch = vi.fn(async (q: string, params: Record<string, unknown>) =>
  (await evaluate(parse(q), { dataset: DATASET, params })).get(),
)
vi.mock('@sanity/client', () => ({ createClient: () => ({ fetch }) }))

const { default: worker } = await import('./worker')
const { schema } = await import('./subgraph')
const { TALKS } = await import('./data/source')

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
  SANITY_API_TOKEN_WRITE: 'w',
  IDENTITY: { link: vi.fn() },
  CONFERENCE: { cfpWindow: vi.fn() },
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
    new Request('http://cfp/graphql', {
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

const ALL = `{ cfp {
  topics { id title description color }
  talks { id title format level language audiences topicIds speakers { id name } }
  formats { value label } levels { value label }
  languages { value label } audiences { value label }
} }`

describe('cfp subgraph', () => {
  it("serves the envelope's confirmed talks and topics only", async () => {
    const { data, errors } = await post(ALL, tenant('org_a', 'conf_a'))
    expect(errors).toBeUndefined()
    expect(data.cfp.talks).toEqual([
      {
        id: 'conf_a_confirmed',
        title: 'conf_a confirmed title',
        format: 'presentation_25',
        level: 'beginner',
        language: 'english',
        audiences: ['developer'],
        topicIds: ['topic_conf_a'],
        speakers: [{ id: 'speaker_conf_a', name: 'conf_a speaker' }],
      },
    ])
    expect(data.cfp.topics).toEqual([
      {
        id: 'topic_conf_a',
        title: 'conf_a topic',
        description: 'd',
        color: '#000',
      },
    ])
    expect(data.cfp.levels).toEqual([
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
    ])
  })

  it('never returns a draft, rejected or other unconfirmed proposal', async () => {
    const { data } = await post(ALL, tenant('org_a', 'conf_a'))
    const body = JSON.stringify(data)
    for (const s of STATUSES.filter((x) => x !== 'confirmed')) {
      expect(body).not.toContain(`conf_a_${s}`)
      expect(body).not.toContain(`conf_a ${s} title`)
    }
  })

  it('never crosses tenants: the other org, a forged pair, no conference', async () => {
    const b = await post(ALL, tenant('org_b', 'conf_b'))
    expect(b.data.cfp.talks.map((t: { id: string }) => t.id)).toEqual([
      'conf_b_confirmed',
    ])
    expect(JSON.stringify(b.data)).not.toContain('conf_a')
    // The same org's other edition stays out of conf_a.
    const a = await post(ALL, tenant('org_a', 'conf_a'))
    expect(JSON.stringify(a.data)).not.toContain('conf_a2')
    // org_b's envelope naming org_a's conference matches nothing.
    const forged = await post(ALL, tenant('org_b', 'conf_a'))
    expect(forged.errors).toBeUndefined()
    expect(forged.data).toEqual({ cfp: null })
    const none = await post(ALL, tenant('org_a', null))
    expect(none.data).toEqual({ cfp: null })
  })

  it('the talk query alone refuses a forged org/conference pair', async () => {
    // Defence in depth: the conference read gates the response, so prove
    // the talk read's own org predicate on the query itself.
    const rows = await (
      await evaluate(parse(TALKS), {
        dataset: DATASET,
        params: { orgId: 'org_b', conferenceId: 'conf_a' },
      })
    ).get()
    expect(rows).toEqual([])
  })

  it('returns no private field, even though Sanity holds them', async () => {
    const body = JSON.stringify(await post(ALL, tenant('org_a', 'conf_a')))
    expect(body).not.toContain('PRIVATE')
  })

  it('exposes exactly the public field list per type', () => {
    const fields = (name: string) =>
      Object.keys(
        (schema.getType(name) as GraphQLObjectType).getFields(),
      ).sort()
    expect(fields('CallForPapers')).toEqual([
      'audiences',
      'formats',
      'languages',
      'levels',
      'talks',
      'topics',
    ])
    expect(fields('CfpTalk')).toEqual([
      'audiences',
      'format',
      'id',
      'language',
      'level',
      'speakers',
      'title',
      'topicIds',
    ])
    expect(fields('CfpSpeakerRef')).toEqual(['id', 'name'])
    expect(fields('CfpTopic')).toEqual(['color', 'description', 'id', 'title'])
    expect(fields('CfpOption')).toEqual(['label', 'value'])
    const q = Object.keys(schema.getQueryType()!.getFields())
    expect(q.filter((f) => !f.startsWith('_'))).toEqual([
      'cfp',
      'myProposal',
      'myProposals',
    ])
    // Every object type but MyProposal, the speaker's own data, whose list
    // mine.test.ts pins.
    for (const t of Object.values(schema.getTypeMap()))
      if (
        t instanceof GraphQLObjectType &&
        !t.name.startsWith('_') &&
        t.name !== 'MyProposal'
      )
        for (const f of Object.keys(t.getFields()))
          expect(f).not.toMatch(
            /email|phone|bio|status|review|score|note|outline|feedback|private|draft|address|slack|travel/i,
          )
  })
})
