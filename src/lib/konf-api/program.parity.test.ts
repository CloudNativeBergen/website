/**
 * @vitest-environment node
 *
 * The public program seams through the gateway (#1772). One Sanity fixture
 * feeds both paths with the real GROQ engine (groq-js): the Sanity path
 * through the site's own queries, the API path through the real program
 * subgraph schema over SanityProgramSource. Flagged must equal unflagged, up
 * to the differences named in each test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { createRequire } from 'node:module'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const h = vi.hoisted(() => ({
  apiRead: true,
  apiCalls: 0,
  apiFails: false,
  noDays: false,
}))

vi.mock('@/lib/conference/konf-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/conference/konf-api')>()
  return {
    ...actual,
    // The real one, with the gateway's answer replaced by h.apiRead.
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
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { SanityProgramSource } from '../../../services/program/src/data/source'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { listPublicTalks } from '@/lib/proposal/server'
import {
  getPublicSpeakerProfile,
  getPublicSpeakers,
} from '@/lib/speaker/server'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf',
    _type: 'conference',
    title: 'Conf',
    organization: ref('org'),
    domains: ['a.example'],
    schedules: [ref('sched')],
    programDate: '2020-01-01',
  },
  {
    _id: 'tp',
    _type: 'topic',
    title: 'K8s',
    color: '#00f',
    description: 'Containers',
    slug: { current: 'k8s' },
  },
  {
    _id: 'sp',
    _type: 'speaker',
    _updatedAt: '2026-01-02T00:00:00Z',
    name: 'Ada',
    title: 'Engineer',
    slug: { current: 'ada' },
    imageURL: 'https://avatars/ada.png',
    bio: 'Bio',
    links: ['https://ada.dev'],
    flags: ['local'],
    email: 'ada@private.example',
  },
  {
    _id: 'sp2',
    _type: 'speaker',
    name: 'Secret Bob',
    slug: { current: 'bob' },
  },
  {
    _id: 'talk',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf'),
    title: 'A talk',
    description: [{ _type: 'block', children: [{ text: 'About' }] }],
    language: 'english',
    level: 'beginner',
    format: 'presentation_25',
    audiences: ['developer'],
    feedbackCode: 'secret-code',
    topics: [ref('tp')],
    speakers: [ref('sp')],
    attachments: [
      {
        _type: 'urlAttachment',
        _key: 'k',
        url: 'https://youtu.be/x',
        attachmentType: 'recording',
        title: 'Video',
      },
    ],
  },
  {
    _id: 'pending',
    _type: 'talk',
    status: 'accepted',
    conference: ref('conf'),
    title: 'Secret pending title',
    format: 'workshop_120',
    level: 'advanced',
    audiences: ['ops'],
    topics: [ref('tp')],
    speakers: [ref('sp2')],
  },
  {
    _id: 'gone',
    _type: 'talk',
    status: 'withdrawn',
    conference: ref('conf'),
    title: 'Secret withdrawn title',
    format: 'presentation_45',
    speakers: [ref('sp2')],
  },
  {
    _id: 'sched',
    _type: 'schedule',
    conference: ref('conf'),
    date: '2026-05-02',
    tracks: [
      {
        trackTitle: 'Main',
        trackDescription: 'Big room',
        sponsor: ref('spons'),
        talks: [
          { startTime: '09:00', endTime: '09:45', talk: ref('talk') },
          { startTime: '08:00', endTime: '08:30', placeholder: 'Coffee' },
          { startTime: '10:00', endTime: '12:00', talk: ref('pending') },
        ],
      },
      {
        trackTitle: 'Side',
        trackDescription: null,
        talks: [{ startTime: '09:00', endTime: '09:45', talk: ref('gone') }],
      },
    ],
  },
  {
    _id: 'gal',
    _type: 'imageGallery',
    conference: ref('conf'),
    speakers: [ref('sp')],
    image: {
      asset: ref('image-abc-10x10-jpg'),
      hotspot: { x: 0.5, y: 0.5 },
      alt: 'On stage',
    },
    photographer: 'Pat',
    featured: true,
  },
]

async function groq(q: string, params: Record<string, unknown>) {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
}

// The gateway: the real subgraph schema over the same fixture. Published
// (programDate is past), so the Program gate would pass these through.
const source = new SanityProgramSource({
  fetch: groq,
} as unknown as ConstructorParameters<typeof SanityProgramSource>[0])
const t = { orgId: 'org', conferenceId: 'conf' }
const context = {
  data: {
    program: () => ({
      // Before programDate the API serves no days.
      program: async () => (h.noDays ? [] : source.program(t)),
      talk: (id: string) => source.talk(t, id),
      speakers: () => source.speakers(t),
      speaker: (id: string) => source.speaker(t, id),
      speakerBySlug: (slug: string) => source.speakerBySlug(t, slug),
    }),
  },
}
// The real subgraph schema and its own graphql instance (not a root
// dependency). Loaded by a computed path so the root tsc does not follow it
// into the Worker's types.
const SUBGRAPH = '../../../services/program/src/subgraph'
const { schema } = (await import(/* @vite-ignore */ SUBGRAPH)) as {
  schema: unknown
}
const { graphql: execute } = createRequire(
  new URL('../../../services/program/package.json', import.meta.url),
)('graphql') as {
  graphql: (args: {
    schema: unknown
    source: string
    variableValues?: Record<string, unknown>
    contextValue: unknown
  }) => Promise<unknown>
}
const queries: string[] = []
vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
  h.apiCalls++
  if (h.apiFails) return new Response('down', { status: 502 })
  // Something on the path may hand over a Request instead of (url, init).
  const body = init?.body ?? (await (url as Request).text())
  const { query, variables } = JSON.parse(body as string)
  queries.push(query)
  const result = await execute({
    schema,
    source: query,
    variableValues: variables,
    contextValue: context,
  })
  return Response.json(result)
})

/** Run `fn` on the Sanity path, then on the API path. */
async function both<T>(fn: () => Promise<T>) {
  h.apiRead = false
  const before = h.apiCalls
  const sanity = await fn()
  expect(h.apiCalls).toBe(before)
  h.apiRead = true
  const api = await fn()
  expect(h.apiCalls).toBeGreaterThan(before)
  return { sanity, api }
}

beforeEach(() => {
  h.apiRead = true
  h.apiFails = false
  h.noDays = false
  queries.length = 0
  delete process.env.KONF_API_DISABLED
  process.env.KONF_API_URL = 'https://gateway.test/graphql'
})

type Raw = Record<string, unknown>
const schedules = (c: { schedules?: unknown }) => c.schedules as Raw[]

describe('public program seams through the API (#1772)', () => {
  it('schedule: the same days, tracks and slots, TBA slots unnamed', async () => {
    const { sanity, api } = await both(async () => {
      const r = await getConferenceForDomain('a.example', {
        schedule: true,
        confirmedTalksOnly: false,
      })
      expect(r.error).toBeNull()
      return r.conference
    })
    // Known differences: the schedule document's other `...` fields, and an
    // unconfirmed talk's `_id` (withheld by the API).
    const want = schedules(sanity).map((d) => ({
      _id: d._id,
      date: d.date,
      tracks: (d.tracks as Raw[]).map((tr) => ({
        ...tr,
        talks: (tr.talks as Raw[]).map((sl) => {
          const talk = sl.talk as Raw | null
          if (!talk || talk.status === 'confirmed') return sl
          const { _id, ...rest } = talk
          void _id
          return { ...sl, talk: rest }
        }),
      })),
    }))
    expect(schedules(api)).toEqual(want)
    expect(JSON.stringify(schedules(api))).not.toMatch(
      /Secret|pending"|gone"|secret-code/,
    )
    // One root per query.
    expect(queries.filter((q) => q.includes('program'))).toHaveLength(1)
  })

  it('schedule: admin reads (uncached, scheduleFromSanity) stay on Sanity', async () => {
    const calls = h.apiCalls
    for (const opts of [{ uncached: true }, { scheduleFromSanity: true }]) {
      const r = await getConferenceForDomain('a.example', {
        schedule: true,
        confirmedTalksOnly: false,
        ...opts,
      })
      expect(schedules(r.conference)[0]).toHaveProperty('_type', 'schedule')
    }
    expect(h.apiCalls).toBe(calls)
  })

  it('schedule: no API days (before programDate) gives Sanity', async () => {
    h.apiRead = false
    const want = (await getConferenceForDomain('a.example', { schedule: true }))
      .conference
    h.apiRead = true
    h.noDays = true
    const calls = h.apiCalls
    const got = (await getConferenceForDomain('a.example', { schedule: true }))
      .conference
    expect(h.apiCalls).toBeGreaterThan(calls)
    expect(got).toEqual(want)
    expect(schedules(got)).toHaveLength(1)
  })

  it('schedule: the confirmed-only view narrows the API days alike', async () => {
    const { sanity, api } = await both(
      async () =>
        (await getConferenceForDomain('a.example', { schedule: true }))
          .conference,
    )
    const slots = (c: { schedules?: unknown }) =>
      schedules(c).flatMap((d) =>
        (d.tracks as Raw[]).map((tr) => (tr.talks as Raw[]).length),
      )
    expect(slots(api)).toEqual(slots(sanity))
    expect(slots(api)).toEqual([2, 0])
  })

  it('listPublicTalks: identical PublicTalks', async () => {
    const { sanity, api } = await both(() =>
      listPublicTalks('conf', { speakerId: 'sp' }),
    )
    expect(sanity.talks).toHaveLength(1)
    expect(api).toEqual(sanity)
  })

  it('getPublicSpeakerProfile: identical speaker and talks', async () => {
    const { sanity, api } = await both(() =>
      getPublicSpeakerProfile('conf', 'ada'),
    )
    expect(sanity.speaker).not.toBeNull()
    expect(api.talks).toEqual(sanity.talks)
    // Known differences: a gallery image's _rev/_createdAt/_updatedAt and its
    // speakers' raw image; flags are the public ones (the fixture has only).
    const strip = (g: Raw) => {
      const { _rev, _createdAt, _updatedAt, speakers, ...rest } = g
      expect([_rev, _createdAt, _updatedAt]).toBeDefined()
      return {
        ...rest,
        speakers: (speakers as Raw[]).map(({ _id, name, slug }) => ({
          _id,
          name,
          slug,
        })),
      }
    }
    const { galleryImages, ...speaker } = sanity.speaker!
    expect(api.speaker).toEqual({
      ...speaker,
      galleryImages: (galleryImages as unknown as Raw[]).map(strip),
    })
    expect(api.err).toBeNull()
  })

  it('getPublicSpeakerProfile: an unknown slug is null on both', async () => {
    const { sanity, api } = await both(() =>
      getPublicSpeakerProfile('conf', 'bob'),
    )
    expect(sanity).toEqual({ speaker: null, talks: [], err: null })
    expect(api).toEqual(sanity)
  })

  it('getPublicSpeakers: the fields /speaker and the sitemap use', async () => {
    const { sanity, api } = await both(() => getPublicSpeakers('conf'))
    const pick = (s: Raw) => ({
      _id: s._id,
      _updatedAt: s._updatedAt,
      name: s.name,
      title: s.title,
      slug: s.slug,
      image: s.image,
      bio: s.bio,
      links: s.links,
      flags: s.flags,
      // Known difference: a proposal's `speakers` refs and `conference`.
      proposals: (s.proposals as Raw[]).map(
        ({ speakers, conference, ...p }) => (void speakers, void conference, p),
      ),
    })
    expect(sanity.speakers).toHaveLength(1)
    expect(api.speakers).toEqual(
      sanity.speakers.map((s) => pick(s as unknown as Raw)),
    )
  })

  it('unflagged, an API error and KONF_API_DISABLED all give Sanity', async () => {
    const want = await (async () => {
      h.apiRead = false
      return {
        talks: await listPublicTalks('conf', { speakerId: 'sp' }),
        profile: await getPublicSpeakerProfile('conf', 'ada'),
        speakers: await getPublicSpeakers('conf'),
        conf: await getConferenceForDomain('a.example', { schedule: true }),
      }
    })()
    const run = async () => ({
      talks: await listPublicTalks('conf', { speakerId: 'sp' }),
      profile: await getPublicSpeakerProfile('conf', 'ada'),
      speakers: await getPublicSpeakers('conf'),
      conf: await getConferenceForDomain('a.example', { schedule: true }),
    })

    h.apiRead = true
    h.apiFails = true
    const calls = h.apiCalls
    expect(await run()).toEqual(want)
    // Each seam tried the API once, the profile twice (its Sanity path asks
    // listPublicTalks, which tries the API again).
    expect(h.apiCalls).toBe(calls + 5)

    h.apiFails = false
    process.env.KONF_API_DISABLED = '1'
    expect(await run()).toEqual(want)
    expect(h.apiCalls).toBe(calls + 5)
  })
})
