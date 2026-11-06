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
    // Only `local` is shown publicly; the others are organizer-only.
    flags: ['local', 'requires-funding', 'diverse'],
    galleryImages: [
      {
        _id: 'g1',
        image: { asset: { _ref: 'image-private-asset' } },
        imageUrl: 'https://cdn/g1.jpg',
        imageAlt: 'On stage',
        photographer: 'Pat',
        featured: true,
      },
    ],
  },
  { _id: 'sp_acc', name: 'Accepted Only', slug: 'acc', email: 'acc@private.example' },
  { _id: 'sp_b', name: 'Bob', slug: 'bob', email: 'bob@private.example' },
  { _id: 'sp_c', name: 'Cy', slug: 'cy' },
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
    language: 'english',
    audiences: ['developer'],
    topics: [{ _id: 'tp', title: 'K8s', slug: 'k8s', color: '#00f' }],
    attachments: [
      {
        _type: 'fileAttachment',
        _key: 'k1',
        file: { asset: { _ref: 'file-private-asset' } },
        attachmentType: 'slides',
        title: 'Slides',
        filename: 'a.pdf',
        url: 'https://cdn/a.pdf',
      },
    ],
    scheduleInfo: {
      date: '2026-05-02',
      trackTitle: 'Main',
      timeSlot: { startTime: '09:00', endTime: '09:45' },
    },
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
    scheduleInfo: {
      date: '2999-05-02',
      trackTitle: 'Main',
      timeSlot: { startTime: '09:00' },
    },
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
      {
        trackTitle: 'Main',
        sponsor: { _ref: 'sponsor_x' },
        talks: slots(['09:00', 't_a'], ['08:00', null], ['10:00', 't_acc']),
      },
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

type P = { orgId: string; conferenceId: string; id?: string; slug?: string }
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
    // email rides along to prove the mapper drops it.
    const { _id, name, slug, title, image, email } = s
    return { _id, name, slug, title, image, email }
  }),
})
const withTalks = (s: Row, q: string, p: P) => ({
  ...s,
  talks: TALKS.filter(
    (t) =>
      (t.speakers as string[]).includes(s._id as string) && publicTalk(t, q, p),
  ).map(deref),
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
        ...tr,
        talks: (tr.talks as Row[]).map((sl) => {
          const t = TALKS.find((t) => t._id === sl.talk)
          return {
            ...sl,
            placeholder: sl.talk ? undefined : 'Coffee',
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
  if (q.includes('_id == $id') || q.includes('slug.current == $slug')) {
    const one = found.find((s) => (p.id ? s._id === p.id : s.slug === p.slug))
    return one ? withTalks(one, q, p) : null
  }
  return found.map((s) => withTalks(s, q, p))
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

const PROFILE = `{
  p: speakerBySlug(slug: "ada") {
    id name slug title bio image links flags
    galleryImages { id url alt photographer date location featured }
    talks { id title language audiences topics { id title slug color }
      speakers { id name slug title image }
      attachments { kind attachmentType title description filename url }
      scheduleInfo { date trackTitle startTime endTime } }
  }
  b: speakerBySlug(slug: "bob") { id }
  acc: speakerBySlug(slug: "acc") { id }
  all: speakers { id flags galleryImages { url } talks { id attachments { url } } }
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

  it('pins the exact public field list of every type', async () => {
    const PUBLIC: Record<string, string[]> = {
      Speaker: ['bio', 'flags', 'galleryImages', 'id', 'image', 'links', 'name', 'slug', 'talks', 'title'],
      Talk: ['attachments', 'audiences', 'description', 'format', 'id', 'language', 'level', 'scheduleInfo', 'speakers', 'title', 'topics'],
      TalkSpeaker: ['id', 'image', 'name', 'slug', 'title'],
      Topic: ['color', 'id', 'slug', 'title'],
      Attachment: ['attachmentType', 'description', 'filename', 'kind', 'title', 'url'],
      ScheduleInfo: ['date', 'endTime', 'startTime', 'trackTitle'],
      GalleryImage: ['alt', 'date', 'featured', 'id', 'location', 'photographer', 'url'],
      ProgramSlot: ['end', 'placeholder', 'room', 'start', 'talk', 'track'],
      ProgramTrack: ['description', 'name', 'sponsorId'],
    }
    for (const [type, fields] of Object.entries(PUBLIC)) {
      const { data } = await post(
        `{ __type(name: "${type}") { fields { name } } }`,
        tenant('org_a', 'conf_a'),
      )
      expect(
        data.__type.fields.map((f: { name: string }) => f.name).sort(),
      ).toEqual(fields)
    }
  })

  it('serves no private speaker field, flag or attachment asset', async () => {
    const { data } = await post(PROFILE, tenant('org_a', 'conf_a'))
    const body = JSON.stringify(data)
    for (const leak of [
      'private.example', // email, also on the talk's speaker refs
      '+47', // phone
      'requires-funding', // private flags
      'diverse',
      'private-asset', // raw file and image asset refs
    ])
      expect(body).not.toContain(leak)
    expect(data.p.flags).toEqual(['local'])
    expect(data.p.galleryImages).toEqual([
      {
        id: 'g1',
        url: 'https://cdn/g1.jpg',
        alt: 'On stage',
        photographer: 'Pat',
        date: null,
        location: null,
        featured: true,
      },
    ])
    expect(data.p.talks[0].attachments).toEqual([
      {
        kind: 'file',
        attachmentType: 'slides',
        title: 'Slides',
        description: null,
        filename: 'a.pdf',
        url: 'https://cdn/a.pdf',
      },
    ])
    // The list carries the same public fields.
    expect(data.all[0].flags).toEqual(['local'])
  })

  it('serves speakerBySlug with its confirmed talks, in the tenant only', async () => {
    const { data } = await post(PROFILE, tenant('org_a', 'conf_a'))
    expect(data.p).toMatchObject({ id: 'sp_a', name: 'Ada', slug: 'ada' })
    expect(data.p.talks).toEqual([
      {
        id: 't_a',
        title: 'A talk',
        language: 'english',
        audiences: ['developer'],
        topics: [{ id: 'tp', title: 'K8s', slug: 'k8s', color: '#00f' }],
        speakers: [
          {
            id: 'sp_a',
            name: 'Ada',
            slug: 'ada',
            title: 'Engineer',
            image: 'https://cdn/ada.png',
          },
        ],
        attachments: expect.any(Array),
        scheduleInfo: {
          date: '2026-05-02',
          trackTitle: 'Main',
          startTime: '09:00',
          endTime: '09:45',
        },
      },
    ])
    expect(data.b).toBeNull() // Bob speaks at conf_b
    expect(data.acc).toBeNull() // accepted, not confirmed
    // Bob's own envelope does find him.
    expect((await post(PROFILE, tenant('org_b', 'conf_b'))).data.b.id).toBe(
      'sp_b',
    )
  })

  it('serves track, room and placeholder on program slots', async () => {
    const { data } = await post(
      '{ program { days { slots { start placeholder room track { name sponsorId } talk { id } } } } }',
      tenant('org_a', 'conf_a'),
    )
    expect(data.program.days[0].slots.slice(0, 2)).toEqual([
      {
        start: '08:00',
        placeholder: 'Coffee',
        room: 'Main',
        track: { name: 'Main', sponsorId: 'sponsor_x' },
        talk: null,
      },
      {
        start: '09:00',
        placeholder: null,
        room: 'Main',
        track: { name: 'Main', sponsorId: 'sponsor_x' },
        talk: { id: 't_a' },
      },
    ])
  })

  it('hides scheduleInfo before the D1 programDate, and when the read fails', async () => {
    const q = `{ t: talk(id: "t_c") { id scheduleInfo { date } }
      p: speakerBySlug(slug: "cy") { talks { id scheduleInfo { date } } }
      all: speakers { talks { scheduleInfo { date } } } }`
    // conf_c opens in 2999: the talk and speaker are public, the slot is not.
    const before = await post(q, tenant('org_a', 'conf_c'))
    expect(before.errors).toBeUndefined()
    expect(before.data).toEqual({
      t: { id: 't_c', scheduleInfo: null },
      p: { talks: [{ id: 't_c', scheduleInfo: null }] },
      all: [{ talks: [{ scheduleInfo: null }] }],
    })
    expect(JSON.stringify(before)).not.toContain('2999-05-02')
    // Past programDate it shows.
    const open = await post(
      '{ t: talk(id: "t_a") { scheduleInfo { date } } }',
      tenant('org_a', 'conf_a'),
    )
    expect(open.data.t.scheduleInfo).toEqual({ date: '2026-05-02' })
    // A failed read fails closed, and the date is read once per request.
    env.CONFERENCE.programDate.mockClear()
    env.CONFERENCE.programDate.mockRejectedValueOnce(new Error('D1 down'))
    const failed = await post(
      `{ t: talk(id: "t_a") { scheduleInfo { date } }
         p: speakerBySlug(slug: "ada") { talks { scheduleInfo { date } } } }`,
      tenant('org_a', 'conf_a'),
    )
    expect(failed.data).toEqual({
      t: { scheduleInfo: null },
      p: { talks: [{ scheduleInfo: null }] },
    })
    expect(env.CONFERENCE.programDate).toHaveBeenCalledTimes(1)
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
