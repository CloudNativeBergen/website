/**
 * @vitest-environment node
 *
 * Operator conference stats (#2142) through each Worker's fetch handler, the
 * way the router asks for them: `_entities` on OperatorConferenceStats. Real
 * envelope crypto, and the real GROQ evaluated by groq-js over a two-org
 * dataset. Integers only; only a PlatformContext gets past the reference.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const talk = (conf: string, n: number, status: string, speakers: string[]) => ({
  _id: `${conf}_t${n}`,
  _type: 'talk',
  conference: ref(conf),
  status,
  speakers: speakers.map(ref),
})
const sfc = (conf: string, n: number, status: string) => ({
  _id: `${conf}_s${n}`,
  _type: 'sponsorForConference',
  conference: ref(conf),
  status,
})
const DATASET = [
  { _id: 'conf_a', _type: 'conference', organization: ref('org_a') },
  { _id: 'conf_b', _type: 'conference', organization: ref('org_b') },
  // conf_a: 4 proposals, 2 confirmed sharing speaker a1, plus a2.
  talk('conf_a', 1, 'confirmed', ['a1']),
  talk('conf_a', 2, 'confirmed', ['a1', 'a2']),
  talk('conf_a', 3, 'submitted', ['a3']),
  talk('conf_a', 4, 'submitted', ['a4']),
  sfc('conf_a', 1, 'closed-won'),
  sfc('conf_a', 2, 'negotiating'),
  // conf_b: org_b's, with numbers that would show if they leaked into conf_a.
  talk('conf_b', 1, 'confirmed', ['b1']),
  talk('conf_b', 2, 'rejected', ['b2']),
  talk('conf_b', 3, 'draft', ['a1']),
  sfc('conf_b', 1, 'closed-won'),
  sfc('conf_b', 2, 'closed-won'),
  sfc('conf_b', 3, 'closed-won'),
]

const fetch = vi.fn(async (q: string, params: Record<string, unknown>) => {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
})
vi.mock('@sanity/client', () => ({ createClient: () => ({ fetch }) }))

const workers = {
  cfp: (await import('./worker')).default,
  program: (await import('../../program/src/worker')).default,
  sponsors: (await import('../../sponsors/src/worker')).default,
}
const FIELDS = {
  cfp: 'proposals { total byStatus { status count } }',
  program: 'confirmedSpeakers',
  sponsors: 'sponsors',
}
type Lane = keyof typeof workers

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
  IDENTITY: { link: vi.fn() },
  CONFERENCE: { cfpWindow: vi.fn(), programDate: vi.fn() },
}
const OPERATOR: Envelope = {
  typ: 'platform',
  userId: 'op',
  platformRole: 'operator',
}

async function stats(lane: Lane, ids: string[], as: Envelope) {
  const reps = ids
    .map(
      (id) =>
        `{ __typename: "OperatorConferenceStats", conferenceId: "${id}" }`,
    )
    .join(', ')
  const res = await workers[lane].fetch(
    new Request(`http://${lane}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENVELOPE_HEADER]: await signer.sign(as),
      },
      body: JSON.stringify({
        query: `{ _entities(representations: [${reps}]) { ... on OperatorConferenceStats { conferenceId ${FIELDS[lane]} } } }`,
      }),
    }),
    env as never,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

beforeEach(() => {
  fetch.mockClear()
})

describe('operator conference stats (#2142)', () => {
  it('counts each conference on its own, one query per subgraph per page', async () => {
    const cfp = await stats('cfp', ['conf_a', 'conf_b', 'conf_x'], OPERATOR)
    expect(cfp.errors).toBeUndefined()
    expect(cfp.data._entities).toEqual([
      {
        conferenceId: 'conf_a',
        proposals: {
          total: 4,
          byStatus: [
            { status: 'confirmed', count: 2 },
            { status: 'submitted', count: 2 },
          ],
        },
      },
      {
        conferenceId: 'conf_b',
        proposals: {
          total: 3,
          byStatus: [
            { status: 'confirmed', count: 1 },
            { status: 'draft', count: 1 },
            { status: 'rejected', count: 1 },
          ],
        },
      },
      // Unknown conference: zeros, not someone else's numbers.
      { conferenceId: 'conf_x', proposals: { total: 0, byStatus: [] } },
    ])
    expect(fetch).toHaveBeenCalledTimes(1)

    const program = await stats('program', ['conf_a', 'conf_b'], OPERATOR)
    expect(program.data._entities).toEqual([
      // a1 twice and a2: distinct; b2 and conf_b's draft a1 do not count.
      { conferenceId: 'conf_a', confirmedSpeakers: 2 },
      { conferenceId: 'conf_b', confirmedSpeakers: 1 },
    ])
    const sponsors = await stats('sponsors', ['conf_a', 'conf_b'], OPERATOR)
    expect(sponsors.data._entities).toEqual([
      { conferenceId: 'conf_a', sponsors: 1 },
      { conferenceId: 'conf_b', sponsors: 3 },
    ])
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  const refused: [string, Envelope][] = [
    [
      'a tenant-lane operator acting for the org',
      {
        typ: 'tenant',
        orgId: 'org_a',
        conferenceId: 'conf_a',
        userId: 'op',
        orgRole: null,
        scopes: ['platform:operator'],
      },
    ],
    [
      'an org owner',
      {
        typ: 'tenant',
        orgId: 'org_a',
        conferenceId: 'conf_a',
        userId: 'u',
        orgRole: 'owner',
        scopes: [],
      },
    ],
    ['a user-lane session', { typ: 'user', userId: 'u' }],
  ]
  it.each(refused)('refuses %s before any fetch', async (_, as) => {
    for (const lane of Object.keys(workers) as Lane[]) {
      const r = await stats(lane, ['conf_a'], as)
      // The reference resolves to null: no count, and no error from a deeper
      // guard either (which would mean the reference gate let it through).
      expect(r.errors).toBeUndefined()
      expect(r.data._entities).toEqual([null])
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
