/**
 * @vitest-environment node
 *
 * program through its Worker fetch handler: real envelope crypto, Sanity
 * mocked as a two-tenant dataset. The mock applies a tenant or status
 * predicate only when the query text carries it, so dropping one from the
 * GROQ leaks rows here exactly as it would in Sanity.
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

type Row = Record<string, unknown>
const CONFS: Record<string, { org: string; programDate?: string }> = {
  conf_a: { org: 'org_a', programDate: '2020-01-01' },
  conf_b: { org: 'org_b', programDate: '2020-01-01' },
  conf_c: { org: 'org_a', programDate: '2999-01-01' },
}
const SPEAKERS: Row[] = [
  {
    _id: 'sp_a',
    name: 'Ada',
    slug: 'ada', // as projected by "slug": slug.current
    title: 'Engineer',
    bio: 'Bio',
    links: ['https://ada.dev'],
    image: 'https://cdn/ada.png',
    email: 'ada@private.example',
    phone: '+47 111',
  },
  { _id: 'sp_acc', name: 'Accepted Only', email: 'acc@private.example' },
  { _id: 'sp_b', name: 'Bob', email: 'bob@private.example' },
  { _id: 'sp_c', name: 'Cy' },
]
const TALKS: Row[] = [
  {
    _id: 't_a',
    conf: 'conf_a',
    status: 'confirmed',
    title: 'A talk',
    description: [{ _type: 'block', children: [{ text: 'About' }] }],
    format: 'presentation_25',
    level: 'beginner',
    speakers: ['sp_a'],
  },
  {
    _id: 't_acc',
    conf: 'conf_a',
    status: 'accepted',
    title: 'Secret accepted',
    speakers: ['sp_acc'],
  },
  {
    _id: 't_sub',
    conf: 'conf_a',
    status: 'submitted',
    title: 'Secret submitted',
    speakers: ['sp_acc'],
  },
  {
    _id: 't_b',
    conf: 'conf_b',
    status: 'confirmed',
    title: 'B talk',
    speakers: ['sp_b'],
  },
  {
    _id: 't_c',
    conf: 'conf_c',
    status: 'confirmed',
    title: 'C talk',
    speakers: ['sp_c'],
  },
]
const slots = (...s: [string, string | null][]) =>
  s.map(([startTime, talk]) => ({
    startTime,
    endTime: startTime.replace(':00', ':45'),
    talk,
  }))
const SCHEDULES: Row[] = [
  {
    conf: 'conf_a',
    date: '2026-05-02',
    tracks: [
      { talks: slots(['09:00', 't_a'], ['08:00', null], ['10:00', 't_acc']) },
    ],
  },
  {
    conf: 'conf_a',
    date: '2026-05-01',
    status: 'draft',
    tracks: [{ talks: slots(['09:00', 't_sub']) }],
  },
  {
    conf: 'conf_b',
    date: '2026-05-02',
    status: 'official',
    tracks: [{ talks: slots(['09:00', 't_b']) }],
  },
  {
    conf: 'conf_c',
    date: '2026-05-02',
    tracks: [{ talks: slots(['09:00', 't_c']) }],
  },
]

type P = { orgId: string; conferenceId: string; id?: string }
const inTenant = (conf: unknown, q: string, p: P) =>
  (!q.includes('conference._ref == $conferenceId') ||
    conf === p.conferenceId) &&
  (!q.includes('conference->organization._ref == $orgId') ||
    CONFS[conf as string]?.org === p.orgId)
const publicTalk = (t: Row, q: string, p: P) =>
  (!q.includes('status == "confirmed"') || t.status === 'confirmed') &&
  inTenant(t.conf, q, p)
const deref = (t: Row) => ({
  ...t,
  speakers: (t.speakers as string[]).map((id) => {
    const s = SPEAKERS.find((s) => s._id === id)!
    return { _id: s._id, name: s.name }
  }),
})

const fetch = vi.fn(async (q: string, p: P) => {
  if (q.startsWith('*[_type == "schedule"')) {
    return SCHEDULES.filter(
      (s) =>
        inTenant(s.conf, q, p) &&
        (!s.status ||
          s.status === 'official' ||
          !q.includes('status == "official"')),
    ).map((s) => ({
      date: s.date,
      tracks: (s.tracks as Row[]).map((tr) => ({
        talks: (tr.talks as Row[]).map((sl) => {
          const t = TALKS.find((t) => t._id === sl.talk)
          return {
            ...sl,
            talk: t
              ? t.status === 'confirmed'
                ? deref(t)
                : { status: t.status }
              : null,
          }
        }),
      })),
    }))
  }
  if (q.startsWith('*[_type == "talk"')) {
    const t = TALKS.find((t) => t._id === p.id && publicTalk(t, q, p))
    return t ? deref(t) : null
  }
  // Speakers: full documents, private fields included, as `...` would return.
  const found = SPEAKERS.filter((s) =>
    TALKS.some(
      (t) =>
        (t.speakers as string[]).includes(s._id as string) &&
        publicTalk(t, q, p),
    ),
  )
  return q.includes('_id == $id')
    ? (found.find((s) => s._id === p.id) ?? null)
    : found
})
vi.mock('@sanity/client', () => ({ createClient: () => ({ fetch }) }))

const { default: worker } = await import('./worker')

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const env = {
  GATEWAY_PUBLIC_KEY: keys.publicPem,
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 't',
  // D1 stand-in: conference's ProgramDate entrypoint, both ids must match.
  CONFERENCE: {
    programDate: vi.fn(async (orgId: string, conferenceId: string) => {
      const c = CONFS[conferenceId]
      return c?.org === orgId ? (c.programDate ?? null) : null
    }),
  },
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
    new Request('http://program/graphql', {
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
const ALL = `{
  program { days { date slots { start end talk { id title description format level speakers { id name } } } } }
  speakers { id name slug title bio image links }
  ta: talk(id: "t_a") { id } tb: talk(id: "t_b") { id }
  sa: speaker(id: "sp_a") { id } sb: speaker(id: "sp_b") { id }
}`

describe('program subgraph', () => {
  it("serves the envelope's confirmed program, talks and speakers", async () => {
    const { data, errors } = await post(ALL, tenant('org_a', 'conf_a'))
    expect(errors).toBeUndefined()
    expect(data.program.days).toEqual([
      {
        date: '2026-05-02',
        slots: [
          { start: '08:00', end: '08:45', talk: null },
          {
            start: '09:00',
            end: '09:45',
            talk: {
              id: 't_a',
              title: 'A talk',
              description: JSON.stringify([
                { _type: 'block', children: [{ text: 'About' }] },
              ]),
              format: 'presentation_25',
              level: 'beginner',
              speakers: [{ id: 'sp_a', name: 'Ada' }],
            },
          },
          // Accepted, not confirmed: the slot stays, the talk is not named.
          { start: '10:00', end: '10:45', talk: null },
        ],
      },
    ])
    expect(data.speakers).toEqual([
      {
        id: 'sp_a',
        name: 'Ada',
        slug: 'ada',
        title: 'Engineer',
        bio: 'Bio',
        image: 'https://cdn/ada.png',
        links: ['https://ada.dev'],
      },
    ])
    expect(data.ta).toEqual({ id: 't_a' })
    expect(data.sa).toEqual({ id: 'sp_a' })
  })

  it("never returns another tenant's talks or speakers", async () => {
    for (const env of [tenant('org_a', 'conf_a'), tenant('org_a', 'conf_b')]) {
      const body = JSON.stringify(await post(ALL, env))
      for (const leak of ['t_b', 'B talk', 'sp_b', 'Bob'])
        expect(body).not.toContain(leak)
    }
    // Another conference of the same org is another tenant too.
    const body = JSON.stringify(await post(ALL, tenant('org_a', 'conf_a')))
    for (const leak of ['t_c', 'C talk', 'sp_c'])
      expect(body).not.toContain(leak)
    // B's envelope does see B: the predicate filters, it does not blank.
    const { data } = await post(ALL, tenant('org_b', 'conf_b'))
    expect(data.tb).toEqual({ id: 't_b' })
    expect(data.sb).toEqual({ id: 'sp_b' })
    expect(data.program.days[0].slots[0].talk.id).toBe('t_b')
  })

  it('serves only confirmed talks and their speakers', async () => {
    const { data } = await post(
      '{ acc: talk(id: "t_acc") { id } sub: talk(id: "t_sub") { id } s: speaker(id: "sp_acc") { id } speakers { id } }',
      tenant('org_a', 'conf_a'),
    )
    expect(data).toEqual({
      acc: null,
      sub: null,
      s: null,
      speakers: [{ id: 'sp_a' }],
    })
    const body = JSON.stringify(await post(ALL, tenant('org_a', 'conf_a')))
    for (const leak of ['Secret', 't_acc', 't_sub', 'sp_acc'])
      expect(body).not.toContain(leak)
  })

  it('serves no private speaker field', async () => {
    const body = JSON.stringify(await post(ALL, tenant('org_a', 'conf_a')))
    expect(body).not.toContain('private.example')
    expect(body).not.toContain('+47')
    const { data } = await post(
      '{ __type(name: "Speaker") { fields { name } } }',
      tenant('org_a', 'conf_a'),
    )
    expect(
      data.__type.fields.map((f: { name: string }) => f.name).sort(),
    ).toEqual(['bio', 'id', 'image', 'links', 'name', 'slug', 'title'])
  })

  it('serves no program before the D1 programDate, and nothing without a conference', async () => {
    // conf_c has a published schedule; D1 says the program opens in 2999.
    expect(
      (await post(ALL, tenant('org_a', 'conf_c'))).data.program.days,
    ).toEqual([])
    expect(env.CONFERENCE.programDate).toHaveBeenCalledWith('org_a', 'conf_c')
    const { data } = await post(ALL, tenant('org_a', null))
    expect(data).toEqual({
      program: { days: [] },
      speakers: [],
      ta: null,
      tb: null,
      sa: null,
      sb: null,
    })
  })

  it('hides the program when the programDate read fails', async () => {
    env.CONFERENCE.programDate.mockRejectedValueOnce(new Error('D1 down'))
    const { data, errors } = await post(
      '{ program { days { date } } }',
      tenant('org_a', 'conf_a'),
    )
    expect(errors).toBeUndefined()
    expect(data.program.days).toEqual([])
  })
})
