import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { send, slackToken, type DataEnv, type Deps } from './data'

/** The slice of D1 send() uses (prepare/bind/run), over node:sqlite. */
function d1(): D1Database {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(join(__dirname, '../migrations/0001_init.sql'), 'utf8'))
  return {
    prepare: (sql: string) => ({
      bind: (...p: (string | number)[]) => ({
        run: async () => ({
          meta: { changes: db.prepare(sql).run(...p).changes },
        }),
      }),
    }),
  } as unknown as D1Database
}

const ORG = 'org-a'
const CONF = 'conf-a'
const ACTOR = 'spk-actor'

type Doc = Record<string, unknown> & { _id: string }
const ref = (_ref: string) => ({ _type: 'reference', _ref })
// Two orgs, evaluated by groq-js: the tenant filter is the real query's.
const seed = (): Doc[] => [
  { _id: ORG, _type: 'organization', featureOverrides: [] },
  { _id: 'org-b', _type: 'organization' },
  {
    _id: CONF,
    _type: 'conference',
    organization: ref(ORG),
    domains: ['a.konf.app'],
    organizers: ['org-1', ACTOR, 'org-2'].map(ref),
    teams: [],
  },
  {
    _id: 'conf-b',
    _type: 'conference',
    organization: ref('org-b'),
    organizers: [ref('b-1')],
  },
  ...['org-1', 'org-2', 'b-1', 't-1'].map((id) => ({
    _id: id,
    _type: 'speaker',
    name: id,
  })),
  { _id: ACTOR, _type: 'speaker', name: 'Ada', email: 'ada@x.no' },
  { _id: 'spk-co', _type: 'speaker', name: 'Bo', email: 'bo@x.no' },
  {
    _id: 'talk-1',
    _type: 'talk',
    title: 'Kubernetes <b>',
    status: 'submitted',
    withdrawnReason: 'Sick',
    conference: ref(CONF),
    speakers: [ref(ACTOR), ref('spk-co')],
  },
  {
    _id: 'talk-b',
    _type: 'talk',
    title: 'B',
    status: 'submitted',
    conference: ref('conf-b'),
    speakers: [ref(ACTOR)],
  },
]
let dataset: Doc[]
const doc = (id: string) => dataset.find((d) => d._id === id)!

let reads: { query: string; params: Record<string, unknown> }[]
let created: Record<string, unknown>[]
let commits: number
let slack: ReturnType<typeof vi.fn>
let deps: Deps
let channel: string | null

const env = (over: Partial<DataEnv> = {}): DataEnv =>
  ({
    SANITY_PROJECT_ID: 'p',
    SANITY_DATASET: 'd',
    // The tenant reaches konf-conference too: a foreign one has no channel.
    CONFERENCE: {
      cfpChannel: async (o: string, c: string) =>
        o === ORG && c === CONF ? channel : null,
    },
    TENANT_SECRETS_JSON: JSON.stringify({
      [ORG]: { slack: { botToken: 'xoxb-own' } },
    }),
    ...over,
  }) as DataEnv

beforeEach(() => {
  dataset = seed()
  channel = '#cfp'
  reads = []
  created = []
  commits = 0
  slack = vi.fn(async () => Response.json({ ok: true }))
  deps = {
    db: d1(),
    read: {
      fetch: async <T>(query: string, params: Record<string, unknown>) => {
        reads.push({ query, params })
        return (await evaluate(parse(query), { dataset, params })).get() as T
      },
    },
    write: {
      transaction: () => ({
        create: (d: Record<string, unknown>) => created.push(d),
        commit: async () => void commits++,
      }),
    },
    fetch: slack as unknown as typeof fetch,
    env: env(),
    now: () => new Date('2026-11-09T12:00:00Z'),
  }
})

const submitted = (over: Record<string, unknown> = {}) => ({
  type: 'proposal.submitted',
  id: 'evt-1',
  orgId: ORG,
  conferenceId: CONF,
  proposalId: 'talk-1',
  actorSpeakerId: ACTOR,
  ...over,
})
const withdrawn = (over: Record<string, unknown> = {}) =>
  submitted({
    type: 'proposal.withdrawn',
    previousStatus: 'submitted',
    ...over,
  })

const slackBody = (i = 0) =>
  JSON.parse((slack.mock.calls[i][1] as RequestInit).body as string)

describe('notifications send', () => {
  it('posts the Slack alert and writes one item per organizer, actor excluded, in one transaction', async () => {
    expect(await send(deps, submitted())).toBe('sent')
    expect(slack).toHaveBeenCalledTimes(1)
    const [url, init] = slack.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer xoxb-own',
    )
    const body = slackBody()
    expect(body.channel).toBe('#cfp')
    expect(body.blocks[0].text.text).toBe('📥 New Talk Proposal')
    expect(body.blocks[1].fields[0].text).toBe('*Title:*\nKubernetes &lt;b&gt;')
    expect(body.blocks[1].fields[1].text).toBe('*Speaker:*\nAda, Bo')
    expect(body.blocks[2].elements[0].url).toBe(
      'https://a.konf.app/admin/proposals/talk-1',
    )
    expect(commits).toBe(1)
    expect(created.map((d) => (d.recipient as { _ref: string })._ref)).toEqual([
      'org-1',
      'org-2',
    ])
    expect(created[0]).toMatchObject({
      _type: 'notification',
      notificationType: 'proposal_submitted',
      title: 'New proposal: "Kubernetes <b>"',
      link: '/admin/proposals/talk-1',
      actor: { _ref: ACTOR, _weak: true },
      conference: { _ref: CONF },
    })
  })

  it('routes to the cfp team when it has members', async () => {
    doc(CONF).teams = [{ key: 'cfp', members: [ref('t-1'), ref(ACTOR)] }]
    await send(deps, submitted())
    expect(created.map((d) => (d.recipient as { _ref: string })._ref)).toEqual([
      't-1',
    ])
  })

  it('a withdrawal carries the reason in Slack and in-app', async () => {
    doc('talk-1').status = 'withdrawn'
    expect(await send(deps, withdrawn())).toBe('sent')
    const body = slackBody()
    expect(body.blocks[0].text.text).toBe('🚫 Talk Withdrawn')
    expect(body.blocks[2].text.text).toBe('*Reason:*\nSick')
    expect(created[0]).toMatchObject({
      notificationType: 'proposal_status_changed',
      title: 'Proposal withdrawn: "Kubernetes <b>"',
      message: 'Sick',
    })
  })

  it('a withdrawn confirmed talk lists tickets to cancel, minus speakers with another confirmed talk', async () => {
    doc('talk-1').status = 'withdrawn'
    dataset.push({
      _id: 'talk-2',
      _type: 'talk',
      status: 'confirmed',
      conference: ref(CONF),
      speakers: [ref('spk-co')],
    })
    await send(deps, withdrawn({ previousStatus: 'confirmed' }))
    expect(slackBody().blocks[3].text.text).toContain('• Ada (ada@x.no)')
    expect(slackBody().blocks[3].text.text).not.toContain('Bo')
  })

  it('refuses an unknown event type without reading, claiming or sending', async () => {
    expect(await send(deps, submitted({ type: 'proposal.accepted' }))).toBe(
      'refused',
    )
    expect(await send(deps, null)).toBe('refused')
    expect(reads).toEqual([])
    expect(slack).not.toHaveBeenCalled()
    expect(created).toEqual([])
    // The id was not claimed: the valid event still goes out.
    expect(await send(deps, submitted())).toBe('sent')
  })

  it('dedupes a replayed event id', async () => {
    expect(await send(deps, submitted())).toBe('sent')
    expect(await send(deps, submitted())).toBe('duplicate')
    expect(slack).toHaveBeenCalledTimes(1)
    expect(commits).toBe(1)
    expect(await send(deps, submitted({ id: 'evt-2' }))).toBe('sent')
    expect(slack).toHaveBeenCalledTimes(2)
  })

  it('refuses a proposal outside the calling tenant', async () => {
    // org-b names org-a's talk under org-a's conference id.
    expect(await send(deps, submitted({ orgId: 'org-b' }))).toBe('refused')
    // org-a names org-b's talk under org-b's conference id.
    expect(
      await send(
        deps,
        submitted({
          id: 'evt-2',
          proposalId: 'talk-b',
          conferenceId: 'conf-b',
        }),
      ),
    ).toBe('refused')
    // The right org, the wrong conference.
    expect(
      await send(deps, submitted({ id: 'evt-3', conferenceId: 'conf-b' })),
    ).toBe('refused')
    expect(slack).not.toHaveBeenCalled()
    expect(created).toEqual([])
    // The control: the same talk under its own tenant goes out.
    expect(await send(deps, submitted({ id: 'evt-4' }))).toBe('sent')
  })

  it('refuses an event whose proposal status or actor does not match', async () => {
    expect(await send(deps, withdrawn())).toBe('refused') // still submitted
    expect(await send(deps, submitted({ actorSpeakerId: 'spk-other' }))).toBe(
      'refused',
    )
    expect(slack).not.toHaveBeenCalled()
  })

  it('skips Slack without a token or channel, still writes in-app', async () => {
    deps.env = env({
      TENANT_SECRETS_JSON: undefined,
      SLACK_BOT_TOKEN: 'xoxb-platform',
    })
    expect(await send(deps, submitted())).toBe('sent')
    expect(slack).not.toHaveBeenCalled()
    expect(commits).toBe(1)
    deps.env = env()
    channel = null
    await send(deps, submitted({ id: 'evt-2' }))
    expect(slack).not.toHaveBeenCalled()
  })

  it('a Slack failure does not stop the in-app write, and send resolves', async () => {
    slack.mockResolvedValue(
      Response.json({ ok: false, error: 'channel_not_found' }),
    )
    expect(await send(deps, submitted())).toBe('sent')
    expect(commits).toBe(1)
  })
})

describe('slackToken (resolveConferenceSlackToken)', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  const base = env({
    TENANT_SECRETS_JSON: undefined,
    SLACK_BOT_TOKEN: 'xoxb-platform',
    PLATFORM_ORG_ID: 'plat',
  })
  it('the platform org gets the platform token; another org does not', () => {
    expect(slackToken(base, 'plat', [], now)).toBe('xoxb-platform')
    expect(slackToken(base, ORG, [], now)).toBeUndefined()
  })
  it('an active override wins in both directions; an expired one is ignored', () => {
    expect(
      slackToken(base, ORG, [{ feature: 'slack-mirror', enabled: true }], now),
    ).toBe('xoxb-platform')
    expect(
      slackToken(
        base,
        'plat',
        [{ feature: 'slack-mirror', enabled: false }],
        now,
      ),
    ).toBeUndefined()
    expect(
      slackToken(
        base,
        ORG,
        [
          {
            feature: 'slack-mirror',
            enabled: true,
            expiresAt: '2026-01-01T00:00:00Z',
          },
        ],
        now,
      ),
    ).toBeUndefined()
  })
  it("the org's own token wins; an empty bag does not", () => {
    const own = {
      ...base,
      TENANT_SECRETS_JSON: JSON.stringify({
        [ORG]: { slack: { botToken: 'xoxb-own' } },
        plat: { slack: {} },
      }),
    }
    expect(slackToken(own, ORG, [], now)).toBe('xoxb-own')
    expect(slackToken(own, 'plat', [], now)).toBe('xoxb-platform')
  })
})
