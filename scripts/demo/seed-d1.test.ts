import { describe, expect, it } from 'vitest'
import { generateDemoFixtures } from './fixtures/generate'
import { NotDemoOrgError, seedDemoD1, type DemoGraphQLClient } from './seed-d1'

const fixtures = generateDemoFixtures({
  seed: 42,
  now: new Date('2026-11-08T12:00:00Z'),
})
const HOST = 'kontainerkonf.konf.run'

/** A fake gateway keeping just enough state to answer the seeder's reads. */
function fakeGateway(kind: string | null = 'demo') {
  const calls: {
    host: string | null
    op: string
    vars?: unknown
    conferenceId?: string
  }[] = []
  const editions: {
    id: string
    title: string
    primaryHost: string | null
  }[] = [{ id: 'conf-current', title: 'Current', primaryHost: HOST }]
  const client: DemoGraphQLClient = {
    async request<T>(
      host: string | null,
      query: string,
      vars?: Record<string, unknown>,
      conferenceId?: string,
    ) {
      const op = /^(\w+)/.exec(
        query.replace(/^\s*(mutation|query)?\s*(\([^)]*\))?\s*\{\s*/, ''),
      )![1]
      calls.push({ host, op, vars, conferenceId })
      const answer = (data: unknown) => data as T
      switch (op) {
        case 'organization':
          return answer({ organization: { id: 'org-demo', kind } })
        case 'conference':
          return answer({
            conference: { id: 'conf-current' },
            conferenceEditions: editions,
          })
        case 'provisionConference': {
          const input = vars!.input as { title: string }
          const id = `conf-${editions.length}`
          // No verified host: the seeder must target it by id.
          editions.push({ id, title: input.title, primaryHost: null })
          return answer({ provisionConference: { conferenceId: id } })
        }
        default:
          return answer({ [op]: true })
      }
    },
  }
  const writes = () =>
    calls.filter((c) => !['organization', 'conference'].includes(c.op))
  return { client, calls, writes }
}

describe('seedDemoD1', () => {
  it.each(['customer', null])(
    'refuses org kind %s before any write',
    async (kind) => {
      const g = fakeGateway(kind)
      await expect(
        seedDemoD1(fixtures, g.client, { host: HOST }),
      ).rejects.toBeInstanceOf(NotDemoOrgError)
      // Only the kind read ran: no mutation, not even another read.
      expect(g.calls.map((c) => c.op)).toEqual(['organization'])
    },
  )

  it('a dry run counts per entity and writes nothing', async () => {
    const g = fakeGateway()
    const r = await seedDemoD1(fixtures, g.client, { host: HOST, dryRun: true })
    expect(g.writes()).toEqual([])
    expect(r.counts).toEqual({
      editions: fixtures.d1.editions.length,
      settings: fixtures.d1.editions.length,
      lifecycle: fixtures.d1.editions.length,
      members: fixtures.d1.members.length,
      speakerProfiles: fixtures.d1.speakerProfiles.length,
      invites: fixtures.d1.invites.length,
      ticketOrders: fixtures.d1.ticketOrders.length,
    })
    expect(r.counts.members).toBeGreaterThan(0)
    expect(r.counts.ticketOrders).toBeGreaterThan(0)
  })

  it('writes every entity, and a re-run converges without duplicates', async () => {
    const g = fakeGateway()
    const first = await seedDemoD1(fixtures, g.client, { host: HOST })
    const firstWrites = g.writes()
    const count = (op: string, ws = firstWrites) =>
      ws.filter((c) => c.op === op).length
    // Two editions besides the current one are provisioned, each once.
    expect(count('provisionConference')).toBe(2)
    expect(count('updateConference')).toBe(3)
    expect(count('setConferenceLifecycle')).toBe(3)
    expect(count('seedDemoInvitation')).toBe(fixtures.d1.invites.length)
    expect(first.skipped).toEqual([])
    // Every invite state the fixtures hold is seeded, terminal ones included.
    expect(
      new Set(
        firstWrites
          .filter((c) => c.op === 'seedDemoInvitation')
          .map((c) => (c.vars as { status: string }).status),
      ).size,
    ).toBeGreaterThan(1)
    expect(first.counts.ticketOrders).toBe(fixtures.d1.ticketOrders.length)
    expect(count('seedDemoUser')).toBeGreaterThanOrEqual(
      fixtures.d1.members.length,
    )
    // Settings, lifecycle and orders go to each edition by id on the
    // operator lane (the current one by its host), even with no verified host.
    for (const op of ['updateConference', 'setConferenceLifecycle'])
      expect(
        firstWrites
          .filter((c) => c.op === op)
          .map((c) => [c.host, c.conferenceId]),
      ).toEqual([
        ...fixtures.d1.editions.map((e) =>
          e.key === 'edition-live'
            ? [HOST, undefined]
            : [HOST, expect.stringMatching(/^conf-\d$/)],
        ),
      ])
    // Draft and live are set like any other state.
    expect(
      firstWrites
        .filter((c) => c.op === 'setConferenceLifecycle')
        .map((c) => (c.vars as { status: string }).status),
    ).toEqual(fixtures.d1.editions.map((e) => e.lifecycle))
    // Ticket orders always name the demo provider and the org as account.
    for (const c of firstWrites.filter((c) => c.op === 'seedTicketOrders'))
      expect(c.vars).toMatchObject({
        event: { provider: 'demo', accountId: 'org-demo' },
      })

    const before = g.calls.length
    const second = await seedDemoD1(fixtures, g.client, { host: HOST })
    const secondWrites = g.calls
      .slice(before)
      .filter((c) => !['organization', 'conference'].includes(c.op))
    expect(count('provisionConference', secondWrites)).toBe(0)
    // Everything else is an upsert on its natural key: the same calls again.
    const upserts = (ws: typeof firstWrites) =>
      ws.filter((c) => c.op !== 'provisionConference')
    expect(upserts(secondWrites)).toEqual(upserts(firstWrites))
    expect(second.counts.editions).toBe(0)
  })
})
