/**
 * @vitest-environment node
 *
 * A speaker's own proposals (#2078) through the Worker fetch handler: real
 * envelope crypto, the real GROQ evaluated by groq-js over a two-org
 * dataset, and Sanity writes applied to that dataset with revision checks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphQLObjectType } from 'graphql'
import { evaluate, parse } from 'groq-js'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
  type TenantEnvelope,
} from '@runkonf/tenancy'
import type { CfpWindow, SpeakerLink } from './data/mine'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

type Doc = Record<string, unknown> & { _id: string }
const ref = (_ref: string) => ({ _type: 'reference', _ref })
const blocks = (text: string) => [
  { _type: 'block', children: [{ _type: 'span', text }] },
]
const talk = (
  id: string,
  conf: string,
  status: string,
  speakers: string[],
) => ({
  _id: id,
  _rev: 'r0',
  _type: 'talk',
  _createdAt: '2026-01-01T00:00:00Z',
  conference: ref(conf),
  status,
  title: `${id} title`,
  description: blocks(`${id} abstract`),
  format: 'presentation_25',
  level: 'beginner',
  language: 'english',
  audiences: ['developer'],
  topics: [ref(`topic_${conf}`)],
  tos: true,
  speakers: speakers.map(ref),
  // Never leaves.
  reviewSummary: { average: 4.2 },
  organizerNote: 'PRIVATE note',
})

let dataset: Doc[]
const seed = (): Doc[] => [
  ...['conf_a', 'conf_b'].flatMap((c) => [
    {
      _id: c,
      _type: 'conference',
      organization: ref(c === 'conf_a' ? 'org_a' : 'org_b'),
      topics: [ref(`topic_${c}`)],
      formats: ['presentation_25'],
    },
    { _id: `topic_${c}`, _type: 'topic', title: 't' },
  ]),
  { _id: 'sp_me', _type: 'speaker', name: 'Me', providers: ['github:1'] },
  { _id: 'sp_co', _type: 'speaker', name: 'Co', knownEmails: ['co@x.no'] },
  { _id: 'sp_other', _type: 'speaker', name: 'Other', providers: ['github:9'] },
  // An organizer added this address off a ticket: it never links a login.
  {
    _id: 'sp_granted',
    _type: 'speaker',
    knownEmails: ['g@x.no'],
    ticketEmailGrants: [{ email: 'g@x.no' }],
  },
  talk('t_sub', 'conf_a', 'submitted', ['sp_me', 'sp_co']),
  talk('t_draft', 'conf_a', 'draft', ['sp_me']),
  talk('t_acc', 'conf_a', 'accepted', ['sp_me']),
  talk('t_rej', 'conf_a', 'rejected', ['sp_me']),
  talk('t_other', 'conf_a', 'submitted', ['sp_other']),
  talk('t_b', 'conf_b', 'submitted', ['sp_me']),
  talk('t_del', 'conf_a', 'deleted', ['sp_me']),
]

const fetch = vi.fn(async (q: string, params: Record<string, unknown>) =>
  (await evaluate(parse(q), { dataset, params })).get(),
)
const create = vi.fn(async (doc: Doc) => {
  dataset.push({ ...doc, _rev: 'r0', _createdAt: '2026-06-01T00:00:00Z' })
  return doc
})
const patch = (id: string) => {
  let set: Record<string, unknown> = {}
  let rev: string | undefined
  const p = {
    set: (o: Record<string, unknown>) => ((set = o), p),
    ifRevisionId: (r: string) => ((rev = r), p),
    commit: async () => {
      const d = dataset.find((x) => x._id === id)!
      if (rev && d._rev !== rev) throw new Error('rev mismatch')
      Object.assign(d, set, { _rev: `${d._rev}+` })
      return d
    },
  }
  return p
}
vi.mock('@sanity/client', () => ({
  createClient: () => ({ fetch, create, patch }),
}))

const { default: worker } = await import('./worker')
const { schema } = await import('./subgraph')

const PROFILE = {
  name: 'Me Speaker',
  bio: 'My bio',
  links: ['https://me.example'],
  photoKey: 'profiles/me.jpg',
}
const LINKS: Record<string, SpeakerLink> = {
  u_me: { providers: ['github:1'], emails: [], profile: PROFILE },
  u_co: { providers: [], emails: ['co@x.no'], profile: null },
  u_granted: { providers: [], emails: ['g@x.no'], profile: null },
}
const link = vi.fn(async (u: string) => structuredClone(LINKS[u]))
const OPEN: CfpWindow = {
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2099-12-31',
  programDate: null,
  startDate: '2099-06-01',
}
let win: CfpWindow | null
const cfpWindow = vi.fn(async () => win)

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
  SANITY_API_TOKEN_WRITE: 'w',
  IDENTITY: { link },
  CONFERENCE: { cfpWindow },
}
const as = (
  userId: string,
  orgId = 'org_a',
  conferenceId = 'conf_a',
): Envelope => ({
  typ: 'tenant',
  orgId,
  conferenceId,
  userId,
  orgRole: null,
  scopes: [],
})

async function gql(query: string, who: Envelope, variables = {}) {
  const res = await worker.fetch(
    new Request('http://cfp/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENVELOPE_HEADER]: await signer.sign(who),
      },
      body: JSON.stringify({ query, variables }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GraphQL JSON
  return (await res.json()) as any
}
const F = 'id status title abstract format speakers { id name }'
const ONE = `query($id: ID!) { myProposal(id: $id) { ${F} } }`
const LIST = `{ myProposals { ${F} } }`
const UPDATE = `mutation($id: ID!, $input: UpdateMyProposalInput!) { updateMyProposal(id: $id, input: $input) { ${F} } }`
const WITHDRAW = `mutation($id: ID!) { withdrawMyProposal(id: $id) { ${F} } }`
const SUBMIT = `mutation($input: SubmitProposalInput!) { submitProposal(input: $input) { ${F} } }`
const INPUT = {
  title: 'New talk',
  abstract: 'Para one.\n\nPara two.',
  format: 'presentation_25',
  level: 'beginner',
  language: 'english',
  audiences: ['developer'],
  topicIds: ['topic_conf_a'],
  tos: true,
}
const doc = (id: string) => dataset.find((d) => d._id === id)!
const errOf = (r: {
  errors?: { message: string; extensions?: { code?: string } }[]
}) => r.errors?.map((e) => ({ message: e.message, code: e.extensions?.code }))

beforeEach(() => {
  dataset = seed()
  win = { ...OPEN }
})

describe('myProposals / myProposal', () => {
  it('lists my proposals in this conference, co-spoken included, never deleted', async () => {
    const me = await gql(LIST, as('u_me'))
    expect(me.errors).toBeUndefined()
    expect(me.data.myProposals.map((p: { id: string }) => p.id).sort()).toEqual(
      ['t_acc', 't_draft', 't_rej', 't_sub'],
    )
    expect(JSON.stringify(me)).not.toContain('PRIVATE')
  })

  it('another speaker’s proposal is NOT_FOUND exactly like a nonexistent id', async () => {
    const foreign = await gql(ONE, as('u_me'), { id: 't_other' })
    const missing = await gql(ONE, as('u_me'), { id: 'nope' })
    expect(errOf(foreign)).toEqual([
      { message: 'Proposal not found', code: 'NOT_FOUND' },
    ])
    expect(errOf(foreign)).toEqual(errOf(missing))
    expect(foreign.data).toEqual(missing.data)
    // Writes refuse the same way and change nothing.
    for (const q of [
      [UPDATE, { id: 't_other', input: { title: 'x' } }],
      [WITHDRAW, { id: 't_other' }],
    ] as const)
      expect(errOf(await gql(q[0], as('u_me'), q[1]))).toEqual(errOf(missing))
    expect(doc('t_other').title).toBe('t_other title')
    expect(doc('t_other').status).toBe('submitted')
  })

  it('a co-speaker reads the proposal, matched by a verified email', async () => {
    const r = await gql(ONE, as('u_co'), { id: 't_sub' })
    expect(r.errors).toBeUndefined()
    expect(r.data.myProposal).toMatchObject({
      id: 't_sub',
      status: 'submitted',
      abstract: 't_sub abstract',
      speakers: [
        { id: 'sp_me', name: 'Me' },
        { id: 'sp_co', name: 'Co' },
      ],
    })
  })

  it('a ticket-granted email links no speaker', async () => {
    const r = await gql(LIST, as('u_granted'))
    expect(r.data.myProposals).toEqual([])
  })

  it("another conference's proposal is invisible, the same NOT_FOUND", async () => {
    const r = await gql(ONE, as('u_me'), { id: 't_b' })
    expect(errOf(r)).toEqual(errOf(await gql(ONE, as('u_me'), { id: 'nope' })))
    // In its own tenant it is there.
    const b = await gql(ONE, as('u_me', 'org_b', 'conf_b'), { id: 't_b' })
    expect(b.data.myProposal.id).toBe('t_b')
    // A forged pair (org_b naming conf_a) sees nothing.
    const forged = await gql(LIST, as('u_me', 'org_b', 'conf_a'))
    expect(forged.data.myProposals).toEqual([])
  })

  it('refuses the user lane; an anonymous envelope has no proposals', async () => {
    const user = await gql(LIST, { typ: 'user', userId: 'u_me' })
    expect(errOf(user)?.[0].code).toBe('FORBIDDEN')
    const anon = await gql(LIST, {
      ...(as('u_me') as TenantEnvelope),
      userId: null,
    })
    expect(anon).toEqual({ data: { myProposals: [] } })
    expect(link).not.toHaveBeenCalled()
  })
})

describe('submitProposal', () => {
  it('submits, and snapshots the profile without writing back to it', async () => {
    const r = await gql(SUBMIT, as('u_me'), { input: INPUT })
    expect(r.errors).toBeUndefined()
    expect(r.data.submitProposal).toMatchObject({
      status: 'submitted',
      title: 'New talk',
      abstract: 'Para one.\n\nPara two.',
      speakers: [{ id: 'sp_me', name: 'Me' }],
    })
    const d = doc(r.data.submitProposal.id)
    expect(d.conference).toEqual(ref('conf_a'))
    expect(d.speakerSnapshot).toMatchObject({
      speaker: { _type: 'reference', _ref: 'sp_me', _weak: true },
      ...PROFILE,
    })
    // The identity binding offers only `link`; the profile is unchanged.
    expect(Object.keys(env.IDENTITY)).toEqual(['link'])
    expect(LINKS.u_me.profile).toEqual({
      name: 'Me Speaker',
      bio: 'My bio',
      links: ['https://me.example'],
      photoKey: 'profiles/me.jpg',
    })
  })

  it.each([
    ['no conference row', null],
    ['no dates', { ...OPEN, cfpStartDate: null }],
    ['closed', { ...OPEN, cfpEndDate: '2026-01-02' }],
    ['not yet open', { ...OPEN, cfpStartDate: '2099-01-01' }],
  ])('a closed CFP refuses submit (%s)', async (_, w) => {
    win = w
    const before = dataset.length
    const r = await gql(SUBMIT, as('u_me'), { input: INPUT })
    expect(errOf(r)).toEqual([
      { message: 'The Call for Papers is closed', code: 'FORBIDDEN' },
    ])
    expect(dataset.length).toBe(before)
  })

  it("refuses a topic outside the conference and the site's strict rules", async () => {
    for (const input of [
      { ...INPUT, topicIds: ['topic_conf_b'] },
      { ...INPUT, tos: false },
      { ...INPUT, format: 'keynote' },
      { ...INPUT, prerequisites: 'k8s' },
    ])
      expect(errOf(await gql(SUBMIT, as('u_me'), { input }))?.[0].code).toBe(
        'BAD_USER_INPUT',
      )
  })

  it('refuses a fourth active proposal', async () => {
    dataset.push(talk('t_x', 'conf_a', 'confirmed', ['sp_me']))
    dataset.push(talk('t_y', 'conf_a', 'waitlisted', ['sp_me']))
    const r = await gql(SUBMIT, as('u_me'), { input: INPUT })
    expect(errOf(r)?.[0].code).toBe('FORBIDDEN')
  })

  it('refuses a user with no linked speaker', async () => {
    const r = await gql(SUBMIT, as('u_granted'), { input: INPUT })
    expect(errOf(r)?.[0].code).toBe('FORBIDDEN')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('updateMyProposal', () => {
  it('edits a submitted proposal while the CFP is open, co-speaker too', async () => {
    const r = await gql(UPDATE, as('u_co'), {
      id: 't_sub',
      input: { title: 'Better', level: 'advanced' },
    })
    expect(r.errors).toBeUndefined()
    expect(doc('t_sub')).toMatchObject({ title: 'Better', level: 'advanced' })
  })

  it('refuses a draft or submitted edit once the CFP has closed', async () => {
    win = { ...OPEN, cfpEndDate: '2026-01-02' }
    for (const id of ['t_sub', 't_draft'])
      expect(
        errOf(await gql(UPDATE, as('u_me'), { id, input: { title: 'x' } }))?.[0]
          .code,
      ).toBe('FORBIDDEN')
    expect(doc('t_sub').title).toBe('t_sub title')
  })

  it('after acceptance only title and abstract change', async () => {
    win = { ...OPEN, cfpEndDate: '2026-01-02' }
    const ok = await gql(UPDATE, as('u_me'), {
      id: 't_acc',
      input: { title: 'Accepted v2', abstract: 'New abstract' },
    })
    expect(ok.errors).toBeUndefined()
    expect(ok.data.updateMyProposal).toMatchObject({
      title: 'Accepted v2',
      abstract: 'New abstract',
    })
    for (const input of [
      { format: 'workshop_120' },
      { title: 'x', level: 'advanced' },
      { topicIds: ['topic_conf_a'] },
    ]) {
      const r = await gql(UPDATE, as('u_me'), { id: 't_acc', input })
      expect(errOf(r)?.[0]).toEqual({
        message: 'After acceptance only the title and abstract can change',
        code: 'FORBIDDEN',
      })
    }
    expect(doc('t_acc')).toMatchObject({
      title: 'Accepted v2',
      format: 'presentation_25',
      level: 'beginner',
    })
  })

  it('after the program is published nothing changes', async () => {
    win = { ...OPEN, programDate: '2026-01-01' }
    const r = await gql(UPDATE, as('u_me'), {
      id: 't_acc',
      input: { title: 'Late' },
    })
    expect(errOf(r)?.[0].code).toBe('FORBIDDEN')
    // A failed date read counts as published.
    cfpWindow.mockRejectedValueOnce(new Error('down'))
    win = { ...OPEN }
    const down = await gql(UPDATE, as('u_me'), {
      id: 't_acc',
      input: { title: 'Late' },
    })
    expect(errOf(down)?.[0].code).toBe('FORBIDDEN')
    expect(doc('t_acc').title).toBe('t_acc title')
  })

  it('validates the fields a draft update sets', async () => {
    for (const input of [
      { format: 'keynote' },
      { level: 'expert' },
      { language: 'klingon' },
      { audiences: ['ceo'] },
      { capacity: 0 },
      { capacity: 300 },
      { outline: 'x'.repeat(2001) },
    ])
      expect(
        errOf(await gql(UPDATE, as('u_me'), { id: 't_draft', input }))?.[0]
          .code,
      ).toBe('BAD_USER_INPUT')
    expect(doc('t_draft').format).toBe('presentation_25')
    const ok = await gql(UPDATE, as('u_me'), {
      id: 't_draft',
      input: { level: 'advanced' },
    })
    expect(ok.errors).toBeUndefined()
  })

  it('refuses a rejected proposal', async () => {
    const r = await gql(UPDATE, as('u_me'), {
      id: 't_rej',
      input: { title: 'x' },
    })
    expect(errOf(r)?.[0].code).toBe('FORBIDDEN')
  })
})

describe('withdrawMyProposal', () => {
  it('withdraws a submitted or accepted proposal', async () => {
    for (const id of ['t_sub', 't_acc']) {
      const r = await gql(WITHDRAW, as('u_me'), { id })
      expect(r.data.withdrawMyProposal.status).toBe('withdrawn')
    }
  })

  it('refuses a draft, a rejected one, and within 14 days of the event', async () => {
    for (const id of ['t_draft', 't_rej'])
      expect(errOf(await gql(WITHDRAW, as('u_me'), { id }))?.[0].code).toBe(
        'FORBIDDEN',
      )
    win = { ...OPEN, startDate: new Date(Date.now() + 5 * 864e5).toISOString() }
    expect(
      errOf(await gql(WITHDRAW, as('u_me'), { id: 't_sub' }))?.[0].code,
    ).toBe('FORBIDDEN')
    expect(doc('t_sub').status).toBe('submitted')
  })
})

describe('schema', () => {
  it('MyProposal carries the speaker’s own fields only: no review, score or note', () => {
    const f = Object.keys(
      (schema.getType('MyProposal') as GraphQLObjectType).getFields(),
    ).sort()
    expect(f).toEqual([
      'abstract',
      'audiences',
      'capacity',
      'format',
      'id',
      'language',
      'level',
      'outline',
      'prerequisites',
      'speakers',
      'status',
      'title',
      'topicIds',
    ])
    for (const x of f)
      expect(x).not.toMatch(
        /review|score|note|feedback|rating|comment|snapshot|email/i,
      )
  })
})
