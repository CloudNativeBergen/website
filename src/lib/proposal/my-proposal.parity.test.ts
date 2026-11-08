/**
 * @vitest-environment node
 *
 * The speaker's proposal detail page through the Konf API per host (#2135).
 * One groq-js fixture feeds both paths: Sanity through the site's own
 * getProposal (as the page called it before), the API through the real cfp
 * subgraph over the real MyProposals, keyed by the request's Origin host.
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
  tokenSpeaker: 'sp_me',
  origins: [] as string[],
}))

vi.mock('@/lib/conference/konf-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/conference/konf-api')>()
  return {
    ...actual,
    rolloutFlags: async (...args: Parameters<typeof actual.rolloutFlags>) =>
      process.env.KONF_API_DISABLED === '1'
        ? actual.rolloutFlags(...args)
        : { apiRead: h.apiRead, identityLogin: false, d1Write: false },
    mergeKonfApiConference: async (_: string, c: unknown) => c,
  }
})

import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'

vi.mock('next/headers', () => ({
  // The CURRENT host is a.example; the proposal lives on b.example.
  headers: async () => new Headers({ host: 'a.example' }),
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
import { getProposal } from '@/lib/proposal/server'
import { getMyProposal } from '@/lib/proposal/my-proposals'
import { fetchMyProposal } from '@/lib/konf-api/my-proposals'
import { resolveEditorSpeaker } from '@/lib/proposal/editorSpeaker'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { SpeakerInput } from '@/lib/speaker/types'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const block = (k: string, text: string) => ({
  _type: 'block',
  _key: k,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: `${k}s`, text, marks: [] }],
})
const consent = (granted: boolean) => ({
  granted,
  grantedAt: '2026-01-01T00:00:00Z',
})
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf_a',
    _type: 'conference',
    title: 'A',
    organization: ref('org'),
    domains: ['a.example'],
  },
  {
    _id: 'conf_b',
    _type: 'conference',
    title: 'B',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    organization: ref('org'),
    domains: ['b.example', 'www.b.example'],
    topics: [ref('t1'), ref('t2')],
  },
  {
    _id: 't1',
    _type: 'topic',
    title: 'Platform',
    color: '#123456',
    slug: { current: 'platform' },
  },
  {
    _id: 't2',
    _type: 'topic',
    title: 'Security',
    color: '#654321',
    slug: { current: 'security' },
  },
  {
    _id: 'sp_me',
    _type: 'speaker',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    title: 'Engineer',
    bio: 'Ada bio',
    links: ['https://ada.example'],
    flags: ['first-time-speaker'],
    country: 'NO',
    slug: { current: 'ada' },
    imageURL: 'https://avatars.example/ada.png',
    consent: {
      dataProcessing: consent(true),
      marketing: consent(false),
      publicProfile: consent(true),
      photography: consent(true),
    },
  },
  {
    _id: 'sp_co',
    _type: 'speaker',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    title: 'Admiral',
    bio: 'Grace PRIVATE bio',
    links: ['https://grace.example'],
    slug: { current: 'grace' },
    imageURL: 'https://avatars.example/grace.png',
    consent: { dataProcessing: consent(true), marketing: consent(true) },
  },
  {
    _id: 'inv_1',
    _type: 'coSpeakerInvitation',
    proposal: ref('talk_b'),
    invitedEmail: 'co@example.com',
    invitedName: 'Co Speaker',
    status: 'pending',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    lastRemindedAt: '2026-01-05T00:00:00Z',
  },
  {
    _id: 'inv_2',
    _type: 'coSpeakerInvitation',
    proposal: ref('talk_b'),
    invitedEmail: 'no@example.com',
    status: 'declined',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-01-02T00:00:00Z',
    respondedAt: '2026-01-03T00:00:00Z',
    declineReason: 'Busy that week',
  },
  {
    _id: 'talk_b',
    _type: 'talk',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-10T00:00:00Z',
    conference: ref('conf_b'),
    status: 'confirmed',
    title: 'Full Featured Talk',
    description: [block('b1', 'Paragraph one'), block('b2', 'Paragraph two')],
    format: 'presentation_45',
    level: 'intermediate',
    language: 'english',
    audiences: ['developer', 'architect'],
    outline: 'Talk outline here',
    prerequisites: 'Basic knowledge',
    capacity: 100,
    tos: true,
    topics: [ref('t2'), ref('t1')],
    speakers: [ref('sp_me'), ref('sp_co')],
    attachments: [
      {
        _key: 'att_file',
        _type: 'fileAttachment',
        attachmentType: 'slides',
        title: 'Slides PDF',
        filename: 'slides.pdf',
        file: { _type: 'file', asset: ref('file_asset_1') },
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
    _id: 'talk_deleted',
    _type: 'talk',
    _createdAt: '2026-01-02T00:00:00Z',
    _updatedAt: '2026-01-06T00:00:00Z',
    conference: ref('conf_b'),
    status: 'deleted',
    title: 'Deleted Talk',
    description: [block('d1', 'Gone')],
    format: 'lightning_10',
    level: 'beginner',
    language: 'norwegian',
    outline: 'x',
    tos: true,
    speakers: [ref('sp_co'), ref('sp_me')],
  },
  {
    _id: 'talk_other',
    _type: 'talk',
    conference: ref('conf_b'),
    status: 'submitted',
    title: 'Other Speaker Talk',
    speakers: [ref('sp_co')],
  },
]

async function groq(q: string, params: Record<string, unknown>) {
  return (await evaluate(parse(q), { dataset: DATASET, params })).get()
}

const source = new MyProposals(
  { fetch: groq } as unknown as Writer,
  async () => null,
  () => new Date('2026-01-15T00:00:00Z'),
)
const CONF_BY_HOST: Record<string, string> = {
  'a.example': 'conf_a',
  'b.example': 'conf_b',
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

vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
  // msw may hand over a Request instead of (url, init).
  const req =
    input instanceof Request ? input : new Request(String(input), init)
  if (req.url.includes('/api/auth/token')) {
    if (!h.hasIdentityToken) return new Response(null, { status: 401 })
    return Response.json({ token: 'test-jwt-token' })
  }
  h.apiCalls++
  if (h.apiFails) return new Response('down', { status: 502 })
  const host = new URL(req.headers.get('origin')!).host
  h.origins.push(host)
  // The gateway's envelope: the conference comes from the host, the speaker
  // from the identity token, never from the request body.
  const w = {
    orgId: 'org',
    conferenceId: CONF_BY_HOST[host] ?? 'none',
    speakerId: h.tokenSpeaker,
  }
  const parsed = JSON.parse(await req.text())
  const result = await execute({
    schema,
    source: parsed.query,
    variableValues: parsed.variables,
    contextValue: {
      data: {
        mine: () => ({
          list: () => source.list(w),
          get: (id: string) => source.get(w, id),
        }),
      },
    },
  })
  // As the worker does: the resolver's ProposalError code becomes the GraphQL
  // error code (NOT_FOUND).
  const r = result as {
    data?: unknown
    errors?: { message: string; originalError?: { code?: string } }[]
  }
  return Response.json({
    data: r.data,
    errors: r.errors?.map((e) => ({
      message: e.message,
      extensions: { code: e.originalError?.code },
    })),
  })
})

beforeEach(() => {
  h.apiRead = true
  h.apiCalls = 0
  h.apiFails = false
  h.hasIdentityToken = true
  h.tokenSpeaker = 'sp_me'
  h.origins = []
  delete process.env.KONF_API_DISABLED
  process.env.KONF_API_URL = 'https://gateway.test/graphql'
  process.env.IDENTITY_URL = 'https://identity.test'
})

type Sp = Record<string, unknown> & {
  consent?: Record<string, { granted?: boolean } | undefined>
}
/**
 * Every proposal field the detail page, ProposalForm, ProposalReadOnlyView,
 * ProposalCoSpeaker, ProposalAttachmentsPanel and SpeakerDetailsForm read.
 * Co-speakers: only what ProposalCoSpeaker renders (the API withholds the rest).
 */
function consumed(p: ProposalExisting, me = 'sp_me') {
  return {
    _id: p._id,
    _createdAt: p._createdAt,
    _updatedAt: p._updatedAt,
    title: p.title,
    status: p.status,
    description: p.description,
    format: p.format,
    level: p.level,
    language: p.language,
    audiences: p.audiences ?? [],
    outline: p.outline,
    prerequisites: p.prerequisites ?? undefined,
    capacity: p.capacity ?? undefined,
    tos: p.tos,
    withdrawnReason: p.withdrawnReason ?? undefined,
    conference: (p.conference as { _id: string })._id,
    topics: ((p.topics ?? []) as { _id: string; title: string }[]).map((t) => ({
      _id: t._id,
      title: t.title,
    })),
    speakers: ((p.speakers ?? []) as Sp[]).map((s) => ({
      _id: s._id,
      name: s.name,
      email: s.email,
      slug: s.slug,
      image: s.image,
      title: s.title,
      ...(s._id === me && {
        bio: s.bio,
        links: s.links,
        consent: Object.fromEntries(
          ['dataProcessing', 'marketing', 'publicProfile', 'photography'].map(
            (k) => [k, s.consent?.[k]?.granted ?? false],
          ),
        ),
      }),
    })),
    attachments: (p.attachments ?? []).map((a) => ({
      _type: a._type,
      _key: a._key,
      attachmentType: a.attachmentType,
      title: a.title,
      url: a.url,
      filename: 'filename' in a ? a.filename : undefined,
      uploadedAt: a.uploadedAt,
      asset: 'file' in a ? a.file?.asset?._ref : undefined,
    })),
    coSpeakerInvitations: (p.coSpeakerInvitations ?? []).map((i) => ({
      _id: i._id,
      invitedEmail: i.invitedEmail,
      invitedName: i.invitedName ?? undefined,
      status: i.status,
      expiresAt: i.expiresAt,
      declineReason: i.declineReason ?? undefined,
      lastRemindedAt: i.lastRemindedAt ?? undefined,
    })),
  }
}

const sanityRead = async (id: string, speakerId = 'sp_me') => {
  const r = await getProposal({ id, speakerId })
  expect(r.proposalError).toBeNull()
  return r.proposal
}

describe('proposal detail through the API per host (#2135)', () => {
  it.each(['talk_b', 'talk_deleted'])('parity with Sanity: %s', async (id) => {
    const sanity = await sanityRead(id)
    const r = await getMyProposal({ id, speakerId: 'sp_me' })
    expect(r.proposalError).toBeNull()
    expect(h.apiCalls).toBe(1) // the API path ran, not the fallback
    expect(consumed(r.proposal)).toEqual(consumed(sanity))
  })

  it('the rich fields are really populated (no vacuous match)', async () => {
    const c = consumed(
      (await getMyProposal({ id: 'talk_b', speakerId: 'sp_me' })).proposal,
    )
    expect(h.apiCalls).toBe(1)
    expect(c.status).toBe('confirmed')
    expect(c.topics.map((t) => t.title)).toEqual(['Security', 'Platform'])
    expect(c.attachments[0].asset).toBe('file_asset_1')
    expect(c.speakers[0]).toMatchObject({
      bio: 'Ada bio',
      consent: { dataProcessing: true, marketing: false, photography: true },
    })
    expect(c.speakers[1].title).toBe('Admiral')
    expect(c.coSpeakerInvitations.map((i) => i.status)).toEqual([
      'pending',
      'declined',
    ])
    const del = await getMyProposal({ id: 'talk_deleted', speakerId: 'sp_me' })
    expect(del.proposal.status).toBe('deleted')
  })

  it("asks the proposal's own conference host, not the current host", async () => {
    await getMyProposal({ id: 'talk_b', speakerId: 'sp_me' })
    expect(h.origins).toEqual(['b.example'])
  })

  it("never exposes a co-speaker's bio, links or consent", async () => {
    const { proposal } = await getMyProposal({
      id: 'talk_b',
      speakerId: 'sp_me',
    })
    expect(h.apiCalls).toBe(1)
    const co = (proposal.speakers as Sp[]).find((s) => s._id === 'sp_co')!
    expect(Object.keys(co).sort()).toEqual(
      ['_id', 'email', 'image', 'name', 'slug', 'title'].sort(),
    )
    expect(JSON.stringify(proposal)).not.toContain('PRIVATE')
  })

  it("keeps the caller's unexposed profile fields in the editor", async () => {
    const { proposal } = await getMyProposal({
      id: 'talk_b',
      speakerId: 'sp_me',
    })
    const full = {
      _id: 'sp_me',
      name: 'Ada',
      flags: ['first-time-speaker'],
      country: 'NO',
    } as unknown as SpeakerInput
    const s = resolveEditorSpeaker(proposal.speakers, full, 'sp_me')
    expect(s).toMatchObject({
      flags: ['first-time-speaker'],
      country: 'NO',
      bio: 'Ada bio',
    })
  })

  it('NOT_FOUND from the API falls back to Sanity', async () => {
    // The token names another speaker: the API's speaker predicate refuses,
    // and Sanity's own owner check (session speaker sp_me) still admits.
    h.tokenSpeaker = 'sp_nobody'
    const sanity = await sanityRead('talk_b')
    const r = await getMyProposal({ id: 'talk_b', speakerId: 'sp_me' })
    expect(h.apiCalls).toBe(1)
    expect(r.proposal).toEqual(sanity)
  })

  it.each([
    ['API error', () => void (h.apiFails = true), 1],
    [
      'KONF_API_DISABLED=1',
      () => void (process.env.KONF_API_DISABLED = '1'),
      0,
    ],
    ['no identity token', () => void (h.hasIdentityToken = false), 0],
    ['tenant without apiRead', () => void (h.apiRead = false), 0],
  ] as const)('falls back to Sanity on %s', async (_, arrange, calls) => {
    const sanity = await sanityRead('talk_b')
    arrange()
    const r = await getMyProposal({ id: 'talk_b', speakerId: 'sp_me' })
    expect(h.apiCalls).toBe(calls)
    expect(r.proposalError).toBeNull()
    expect(r.proposal).toEqual(sanity)
  })

  it('an impersonating organizer stays on Sanity', async () => {
    await getMyProposal({
      id: 'talk_b',
      speakerId: 'sp_me',
      isOrganizer: true,
      organizerOrgId: 'org',
    })
    expect(h.apiCalls).toBe(0)
  })

  it("someone else's proposal is returned on neither path", async () => {
    // API: the speaker predicate answers NOT_FOUND on the right host.
    expect(await fetchMyProposal('b.example', 'talk_other', 'jwt')).toBeNull()
    expect(h.apiCalls).toBe(1)
    // Seam: nothing returned, and Sanity's owner check refuses too.
    const r = await getMyProposal({ id: 'talk_other', speakerId: 'sp_me' })
    expect(r.proposal).toBeFalsy()
    expect(await sanityRead('talk_other')).toBeFalsy()
  })
})
