/**
 * @vitest-environment node
 *
 * #2135: the MyProposal fields the speaker portal still read from Sanity
 * (order, updatedAt, deleted proposals, the editor's own-speaker fields,
 * invitation decline reason and reminder time). One fixture, the real GROQ
 * engine on both paths: the site's getProposals/getProposal, and the real cfp
 * subgraph schema over the real MyProposals. Every API read asserts that the
 * subgraph's own Sanity query ran and returned rows, so a fallback can never
 * compare Sanity with Sanity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { createRequire } from 'node:module'

vi.mock('server-only', () => ({}))

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const talk = (
  id: string,
  status: string,
  updated: string,
  speakers: string[],
) => ({
  _id: id,
  _rev: 'r0',
  _type: 'talk',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: updated,
  conference: ref('conf'),
  status,
  title: id,
  speakers: speakers.map(ref),
})
const DATASET = [
  { _id: 'org', _type: 'organization' },
  { _id: 'conf', _type: 'conference', organization: ref('org') },
  {
    _id: 'sp_me',
    _type: 'speaker',
    name: 'Me',
    title: 'Engineer',
    bio: 'My bio',
    links: ['https://me.example'],
    consent: {
      dataProcessing: { granted: true },
      publicProfile: { granted: true },
      photography: { granted: false },
    },
  },
  {
    _id: 'sp_co',
    _type: 'speaker',
    name: 'Co',
    title: 'Co title',
    bio: 'Co bio',
    links: ['https://co.example'],
    consent: { marketing: { granted: true } },
  },
  talk('t_old', 'submitted', '2026-02-01T00:00:00Z', ['sp_me', 'sp_co']),
  talk('t_del', 'deleted', '2026-04-01T00:00:00Z', ['sp_me']),
  talk('t_new', 'confirmed', '2026-03-01T00:00:00Z', ['sp_me']),
  {
    _id: 'inv',
    _type: 'coSpeakerInvitation',
    proposal: ref('t_old'),
    invitedEmail: 'x@x.no',
    status: 'declined',
    declineReason: 'Too busy',
    lastRemindedAt: '2026-02-02T00:00:00Z',
  },
]
const groq = async (q: string, params: Record<string, unknown>) =>
  (await evaluate(parse(q), { dataset: DATASET, params })).get()

vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: (q: string, p: Record<string, unknown>) => groq(q, p),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { getProposal, getProposals } from './data/sanity'
import { MINE, ONE, MyProposals } from '../../../services/cfp/src/data/mine'

// The API path: the subgraph's own repository over the same dataset, its
// Sanity reads recorded so the test can prove they ran.
const apiReads: { query: string; rows: unknown }[] = []
const mine = new MyProposals(
  {
    fetch: async (q: string, p: Record<string, unknown>) => {
      const rows = await groq(q, p)
      apiReads.push({ query: q, rows })
      return rows
    },
  } as never,
  async () => null,
)
const who = { orgId: 'org', conferenceId: 'conf', speakerId: 'sp_me' }
const context = {
  data: {
    mine: () => ({
      list: () => mine.list(who),
      get: (id: string) => mine.get(who, id),
    }),
  },
}
const SUBGRAPH = '../../../services/cfp/src/subgraph'
const { schema } = (await import(/* @vite-ignore */ SUBGRAPH)) as {
  schema: unknown
}
const { graphql } = createRequire(
  new URL('../../../services/cfp/package.json', import.meta.url),
)('graphql') as {
  graphql: (a: {
    schema: unknown
    source: string
    contextValue: unknown
  }) => Promise<{
    data?: Record<string, never>
    errors?: unknown[]
  }>
}

/** Runs one query through the subgraph and proves its Sanity read happened. */
async function api(source: string, query: string) {
  const before = apiReads.length
  const r = await graphql({ schema, source, contextValue: context })
  expect(r.errors).toBeUndefined()
  const reads = apiReads.slice(before)
  expect(reads.map((x) => x.query)).toContain(query)
  expect(reads.find((x) => x.query === query)!.rows).toBeTruthy()
  return r.data!
}

beforeEach(() => {
  apiReads.length = 0
})

const SPEAKER = `speakers { id title bio links consent { dataProcessing marketing publicProfile photography } }`
const granted = (
  c: Record<string, { granted?: boolean } | undefined> | undefined,
) =>
  c
    ? Object.fromEntries(
        ['dataProcessing', 'marketing', 'publicProfile', 'photography'].map(
          (k) => [k, c[k]?.granted === true],
        ),
      )
    : null

describe('MyProposal parity with the site (#2135)', () => {
  it('list: same proposals, deleted included, same order and updatedAt', async () => {
    const { proposals } = await getProposals({
      speakerId: 'sp_me',
      conferenceId: 'conf',
    })
    const data = await api(`{ myProposals { id status updatedAt } }`, MINE)
    const site = proposals.map((p) => ({
      id: p._id,
      status: p.status,
      updatedAt: (p as unknown as { _updatedAt: string })._updatedAt,
    }))
    expect(site.map((p) => p.id)).toEqual(['t_del', 't_new', 't_old'])
    expect(data.myProposals).toEqual(site)
  })

  it('one: invitation fields and speaker fields as the editor shows them', async () => {
    const { proposal } = await getProposal({ id: 't_old', speakerId: 'sp_me' })
    const data = (await api(
      `{ myProposal(id: "t_old") { coSpeakerInvitations { declineReason lastRemindedAt } ${SPEAKER} } }`,
      ONE,
    )) as unknown as {
      myProposal: {
        coSpeakerInvitations: unknown[]
        speakers: Record<string, unknown>[]
      }
    }
    const inv = (
      proposal as unknown as { coSpeakerInvitations: Record<string, unknown>[] }
    ).coSpeakerInvitations
    expect(data.myProposal.coSpeakerInvitations).toEqual(
      inv.map((i) => ({
        declineReason: i.declineReason,
        lastRemindedAt: i.lastRemindedAt,
      })),
    )
    const sp = proposal!.speakers as unknown as Record<string, never>[]
    // The caller's own entry: what SpeakerDetailsForm renders.
    expect(data.myProposal.speakers[0]).toEqual({
      id: sp[0]._id,
      title: sp[0].title,
      bio: sp[0].bio,
      links: sp[0].links,
      consent: granted(sp[0].consent),
    })
    // A co-speaker: ProposalCoSpeaker renders only the title (and email);
    // the editor never renders their bio, links or consent.
    expect(data.myProposal.speakers[1]).toEqual({
      id: sp[1]._id,
      title: sp[1].title,
      bio: null,
      links: [],
      consent: null,
    })
  })
})
