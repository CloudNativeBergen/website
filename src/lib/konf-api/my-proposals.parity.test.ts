/**
 * @vitest-environment node
 *
 * Parity and fallback tests for the speaker dashboard's proposal list through
 * the Konf GraphQL API. One Sanity fixture feeds both paths with the real GROQ
 * engine: the Sanity path through the site's own getProposals (exactly as the
 * dashboard called it before), the API path through the real cfp subgraph
 * schema over MyProposals.
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
  hasIdentityToken: true,
}))

vi.mock('@/lib/conference/konf-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/conference/konf-api')>()
  return {
    ...actual,
    // The real kill switch answers KONF_API_DISABLED=1; only the flag lookup is faked.
    rolloutFlags: async (...args: Parameters<typeof actual.rolloutFlags>) =>
      process.env.KONF_API_DISABLED === '1'
        ? actual.rolloutFlags(...args)
        : { apiRead: h.apiRead, identityLogin: false, d1Write: false },
    mergeKonfApiConference: async (_: string, c: unknown) => c,
  }
})

import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      host: 'a.example',
    }),
  cookies: async () => ({
    get: (name: string) =>
      name === IDENTITY_SESSION_COOKIE && h.hasIdentityToken
        ? { value: 'test-session-cookie' }
        : undefined,
  }),
}))

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

import { MyProposals, type Writer } from '../../../services/cfp/src/data/mine'
import { getProposals } from '@/lib/proposal/server'
import { getMyProposals } from '@/lib/proposal/my-proposals'
import type { ProposalExisting } from '@/lib/proposal/types'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf',
    _type: 'conference',
    title: 'Conf',
    organization: ref('org'),
    domains: ['a.example'],
    topics: [ref('t1')],
  },
  {
    _id: 't1',
    _type: 'topic',
    title: 'Platform',
    color: '#123456',
    slug: { current: 'platform' },
  },
  {
    _id: 'sp_me',
    _type: 'speaker',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    slug: { current: 'ada' },
    imageURL: 'https://avatars.example/ada.png',
    providers: ['github:1'],
    knownEmails: ['ada@example.com'],
  },
  {
    _id: 'sp_co',
    _type: 'speaker',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    slug: { current: 'grace' },
    imageURL: 'https://avatars.example/grace.png',
  },
  {
    _id: 'sched_1',
    _type: 'schedule',
    conference: ref('conf'),
    date: '2026-06-01',
    status: 'official',
    tracks: [
      {
        trackTitle: 'Main Stage',
        talks: [
          {
            talk: ref('talk_1'),
            startTime: '10:00',
            endTime: '10:45',
          },
        ],
      },
    ],
  },
  {
    _id: 'inv_1',
    _type: 'coSpeakerInvitation',
    proposal: ref('talk_1'),
    invitedEmail: 'co@example.com',
    invitedName: 'Co Speaker',
    status: 'pending',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    _id: 'talk_1',
    _type: 'talk',
    conference: ref('conf'),
    status: 'confirmed',
    title: 'Full Featured Talk',
    description: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'Paragraph one', marks: [] },
        ],
      },
    ],
    format: 'presentation_45',
    level: 'intermediate',
    language: 'english',
    audiences: ['developer', 'architect'],
    outline: 'Talk outline here',
    prerequisites: 'Basic knowledge',
    capacity: 100,
    tos: true,
    topics: [ref('t1')],
    speakers: [ref('sp_me'), ref('sp_co')],
    attachments: [
      {
        _key: 'att_file',
        _type: 'fileAttachment',
        attachmentType: 'slides',
        title: 'Slides PDF',
        filename: 'slides.pdf',
        file: { asset: ref('file_asset_1') },
        url: 'https://cdn.example/slides.pdf',
        uploadedAt: '2026-01-02T00:00:00Z',
      },
      {
        _key: 'att_url',
        _type: 'urlAttachment',
        attachmentType: 'demo',
        title: 'GitHub Repo',
        url: 'https://github.com/example/demo',
        uploadedAt: '2026-01-03T00:00:00Z',
      },
    ],
  },
  {
    _id: 'talk_2',
    _type: 'talk',
    conference: ref('conf'),
    status: 'withdrawn',
    withdrawnReason: 'Cannot attend due to travel constraints',
    title: 'Withdrawn Talk',
    description: [
      {
        _type: 'block',
        _key: 'b2',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's2', text: 'Another talk', marks: [] },
        ],
      },
    ],
    format: 'presentation_25',
    level: 'beginner',
    language: 'norwegian',
    audiences: ['developer'],
    outline: 'Outline',
    tos: true,
    topics: [ref('t1')],
    speakers: [ref('sp_me')],
  },
  {
    _id: 'talk_other',
    _type: 'talk',
    conference: ref('conf'),
    status: 'submitted',
    title: 'Other Speaker Talk',
    speakers: [ref('sp_co')],
  },
]

async function groq(q: string, params: Record<string, unknown>) {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
}

const proposalsSource = new MyProposals(
  { fetch: groq } as unknown as Writer,
  async () => null,
  () => new Date('2026-01-15T00:00:00Z'),
)
const w = { orgId: 'org', conferenceId: 'conf', speakerId: 'sp_me' }
const context = {
  data: {
    mine: () => ({
      list: () => proposalsSource.list(w),
      get: (id: string) => proposalsSource.get(w, id),
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
    variableValues?: Record<string, unknown>
    contextValue: unknown
  }) => Promise<unknown>
}

let lastQuery = ''
let lastVariables: Record<string, unknown> | undefined

vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
  const urlStr =
    typeof url === 'string'
      ? url
      : url && typeof url === 'object' && 'url' in url
        ? (url as Request).url
        : String(url)
  if (urlStr.includes('/api/auth/token')) {
    if (!h.hasIdentityToken) return new Response(null, { status: 401 })
    return Response.json({ token: 'test-jwt-token' })
  }
  h.apiCalls++
  if (h.apiFails) return new Response('down', { status: 502 })
  const body = init?.body ?? (await (url as Request).text())
  const parsed = JSON.parse(body as string)
  lastQuery = parsed.query
  lastVariables = parsed.variables
  const result = await execute({
    schema,
    source: parsed.query,
    variableValues: parsed.variables,
    contextValue: context,
  })
  return Response.json(result)
})

const CONF = { _id: 'conf', domains: ['a.example'], organization: ref('org') }

beforeEach(() => {
  h.apiRead = true
  h.apiCalls = 0
  h.apiFails = false
  h.hasIdentityToken = true
  lastQuery = ''
  lastVariables = undefined
  delete process.env.KONF_API_DISABLED
  process.env.KONF_API_URL = 'https://gateway.test/graphql'
  process.env.IDENTITY_URL = 'https://identity.test'
})

/**
 * The fields the dashboard actually reads from a proposal: the list page
 * (status, _id, title), CompactProposalList (format, speakers, attachments,
 * coSpeakerInvitations, scheduleInfo), SpeakerAvatars (speaker _id, name,
 * image), SpeakerShareWrapper (format) and src/lib/speaker/briefing.ts
 * (speakers' _id, attachments' attachmentType, invitations' status and
 * expiresAt, scheduleInfo). Everything else Sanity's `...` spread returns
 * (speaker flags/providers, _rev, _updatedAt, topic objects, file asset refs,
 * description, ...) is not read on this page and is deliberately not compared.
 * `issuedSpeakerTickets` is read by briefing only with a ticketState, which
 * loadDashboardBriefing never passes.
 */
function consumed(p: ProposalExisting) {
  return {
    _id: p._id,
    title: p.title,
    status: p.status,
    format: p.format,
    speakers: (p.speakers ?? []).map((x) => {
      const s = x as { _id?: string; name?: string; image?: string }
      return { _id: s._id, name: s.name, image: s.image }
    }),
    attachments: (p.attachments ?? []).map((a) => ({
      _type: a._type,
      _key: a._key,
      attachmentType: a.attachmentType,
      title: a.title,
      url: a.url,
      uploadedAt: a.uploadedAt,
    })),
    coSpeakerInvitations: (p.coSpeakerInvitations ?? []).map((i) => ({
      _id: i._id,
      status: i.status,
      expiresAt: i.expiresAt,
    })),
    // Sanity's select() yields null off-schedule; the mapper yields undefined.
    scheduleInfo: p.scheduleInfo ?? null,
  }
}
const byId = (a: ProposalExisting, b: ProposalExisting) =>
  a._id.localeCompare(b._id)

const sanityList = async () => {
  const r = await getProposals({
    speakerId: 'sp_me',
    conferenceId: 'conf',
    returnAll: false,
    includeSchedule: true,
  })
  expect(r.proposalsError).toBeNull()
  return r.proposals
}

describe('speaker dashboard proposals through the API (#2078)', () => {
  it('list parity: every consumed field equals the Sanity read', async () => {
    const sanity = await sanityList()
    const { proposals: api, proposalsError } = await getMyProposals({
      speakerId: 'sp_me',
      conference: CONF,
    })
    expect(proposalsError).toBeNull()
    expect(h.apiCalls).toBe(1) // the API path ran, not the fallback

    expect(
      api.map(consumed).sort((a, b) => a._id.localeCompare(b._id)),
    ).toEqual([...sanity].sort(byId).map(consumed))
    // Guard against a vacuous match: the rich fields really are populated.
    const t1 = consumed(api.find((p) => p._id === 'talk_1')!)
    expect(t1.scheduleInfo).toEqual({
      date: '2026-06-01',
      trackTitle: 'Main Stage',
      timeSlot: { startTime: '10:00', endTime: '10:45' },
    })
    expect(t1.speakers.map((s) => s.image)).toEqual([
      'https://avatars.example/ada.png',
      'https://avatars.example/grace.png',
    ])
    expect(t1.attachments.map((a) => a.attachmentType)).toEqual([
      'slides',
      'demo',
    ])
    expect(t1.coSpeakerInvitations).toEqual([
      { _id: 'inv_1', status: 'pending', expiresAt: '2099-01-01T00:00:00Z' },
    ])
  })

  it('no client-supplied id reaches the API', async () => {
    const { proposals } = await getMyProposals({
      speakerId: 'sp_client_supplied',
      conference: { ...CONF, _id: 'conf' },
    })
    expect(h.apiCalls).toBe(1)
    // The speaker comes from the identity token's envelope, not the argument.
    expect(proposals.map((p) => p._id).sort()).toEqual(['talk_1', 'talk_2'])
    expect(lastVariables).toBeUndefined()
    expect(lastQuery).not.toMatch(/speakerId|conferenceId|sp_client_supplied/)
    expect(lastQuery).not.toMatch(/\(/) // no arguments on any field
  })

  it.each([
    [
      'API error',
      (): void => {
        h.apiFails = true
      },
      1,
    ],
    [
      'KONF_API_DISABLED=1',
      (): void => {
        process.env.KONF_API_DISABLED = '1'
      },
      0,
    ],
    [
      'no identity token',
      (): void => {
        h.hasIdentityToken = false
      },
      0,
    ],
    [
      'tenant without apiRead',
      (): void => {
        h.apiRead = false
      },
      0,
    ],
  ] as const)('falls back to Sanity on %s', async (_, arrange, calls) => {
    const sanity = await sanityList()
    arrange()
    const r = await getMyProposals({ speakerId: 'sp_me', conference: CONF })
    expect(h.apiCalls).toBe(calls)
    expect(r.proposalsError).toBeNull()
    expect(r.proposals).toEqual(sanity)
  })
})
