import { describe, expect, it, vi } from 'vitest'
import { generateDemoFixtures } from './fixtures/generate'
import {
  buildDocuments,
  DEMO_PREFIX,
  DEMO_SEED,
  inviteToken,
  LIVE_CONFERENCE_ID,
  NotDemoOrgError,
  OperatorTokenError,
  run,
  assertDemoIds,
  DEMO_ORG_ID,
  type Deps,
  type SanityWriter,
} from './seed'

const now = new Date('2026-11-08T00:00:00Z')
const fixtures = generateDemoFixtures({ seed: DEMO_SEED, now })
const titleOf = (key: string) =>
  fixtures.d1.editions.find((e) => e.key === key)!.title
// D1 ids deliberately unlike any seed id.
const D1_EDITIONS = [
  { id: 'd1-past-7f3', title: titleOf('edition-past'), primaryHost: null },
  { id: 'd1-live-111', title: titleOf('edition-live'), primaryHost: 'kk' },
  { id: 'd1-next-9a2', title: titleOf('edition-upcoming'), primaryHost: null },
]
const EDITION_IDS = {
  'edition-past': 'd1-past-7f3',
  'edition-upcoming': 'd1-next-9a2',
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (exp: unknown) =>
  `${b64({ alg: 'EdDSA' })}.${b64({ sub: 'op', exp })}.sig`
const TOKEN = jwt(Math.floor(Date.now() / 1000) + 900)

function deps(
  kind: string | null,
  {
    orgId = DEMO_ORG_ID,
    editions = D1_EDITIONS,
    inSanity = [LIVE_CONFERENCE_ID, 'd1-past-7f3', 'd1-next-9a2'],
  } = {},
) {
  const mutations: unknown[] = []
  const commit = vi.fn(async () => undefined)
  const client = {
    transaction: () => {
      const tx = {
        createOrReplace: (d: unknown) => (mutations.push(['put', d]), tx),
        createIfNotExists: (d: unknown) => (
          mutations.push(['ifMissing', d]),
          tx
        ),
        patch: (id: string, ops: unknown) => (
          mutations.push(['patch', id, ops]),
          tx
        ),
        commit,
      }
      return tx
    },
    fetch: vi.fn(async () => inSanity) as unknown as SanityWriter['fetch'],
  }
  const seedDemoD1 = vi.fn(async () => ({ ok: true }))
  const d = {
    api: {
      request: vi.fn(async (_host: string | null, query: string) =>
        query.includes('conferenceEditions')
          ? { conferenceEditions: editions }
          : { organization: kind === null ? null : { id: orgId, kind } },
      ) as unknown as Deps['api']['request'],
    },
    createSanityClient: vi.fn(async () => client),
    loadSeedDemoD1: vi.fn(async () => seedDemoD1),
    log: vi.fn(),
  } satisfies Deps
  return { d, mutations, commit, seedDemoD1 }
}

const opts = (o: Partial<Parameters<typeof run>[0]> = {}) => ({
  dryRun: false,
  now,
  token: TOKEN,
  origin: 'https://my.konf.app',
  ...o,
})

describe('demo:seed', () => {
  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-jwt'],
    ['undecodable payload', 'a.!!!.c'],
    ['no exp', jwt(undefined)],
    ['expired', jwt(Math.floor(Date.now() / 1000) - 60)],
  ])(
    'refuses a %s operator token before the guard or any client',
    async (_, token) => {
      const { d } = deps('demo')
      await expect(run(opts({ token }), d)).rejects.toThrow(OperatorTokenError)
      expect(d.api.request).not.toHaveBeenCalled()
      expect(d.createSanityClient).not.toHaveBeenCalled()
    },
  )

  it('refuses a missing origin before the guard or any client', async () => {
    const { d } = deps('demo')
    await expect(run(opts({ origin: undefined }), d)).rejects.toThrow(
      /KONF_OPERATOR_ORIGIN/,
    )
    expect(d.api.request).not.toHaveBeenCalled()
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('refuses a token with under 30 s left', async () => {
    const { d } = deps('demo')
    await expect(
      run(opts({ token: jwt(Math.floor(Date.now() / 1000) + 20) }), d),
    ).rejects.toThrow(OperatorTokenError)
    expect(d.api.request).not.toHaveBeenCalled()
  })

  it('re-checks expiry before each API call and stops before Sanity', async () => {
    const { d } = deps('demo')
    const t0 = Date.now()
    // The guard call passes; then the clock jumps past the margin.
    vi.mocked(d.api.request).mockImplementationOnce((async () => {
      vi.spyOn(Date, 'now').mockReturnValue(t0 + 890_000)
      return { organization: { id: DEMO_ORG_ID, kind: 'demo' } }
    }) as unknown as Deps['api']['request'])
    try {
      await expect(run(opts(), d)).rejects.toThrow(/under 30 s/)
    } finally {
      vi.restoreAllMocks()
    }
    expect(d.api.request).toHaveBeenCalledTimes(1)
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('never puts the token in an error message', async () => {
    const { d } = deps('demo')
    const expired = jwt(1)
    await expect(run(opts({ token: expired }), d)).rejects.not.toThrow(expired)
  })

  it('refuses a customer org before any Sanity client exists', async () => {
    const { d } = deps('customer')
    await expect(run(opts(), d)).rejects.toThrow(NotDemoOrgError)
    expect(d.createSanityClient).not.toHaveBeenCalled()
    expect(d.loadSeedDemoD1).not.toHaveBeenCalled()
  })

  it('refuses an unknown org the same way', async () => {
    const { d } = deps(null)
    await expect(run(opts(), d)).rejects.toThrow(NotDemoOrgError)
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('refuses a demo org that is not KontainerKonf', async () => {
    const { d } = deps('demo', { orgId: 'org-other-demo' })
    await expect(run(opts(), d)).rejects.toThrow(NotDemoOrgError)
    expect(d.loadSeedDemoD1).not.toHaveBeenCalled()
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('refuses a write target outside the prefix and the allowlist', () => {
    const allow = new Set([LIVE_CONFERENCE_ID, 'd1-past-7f3'])
    expect(() =>
      assertDemoIds(
        [`${DEMO_PREFIX}talk.x`, 'd1-past-7f3', LIVE_CONFERENCE_ID],
        allow,
      ),
    ).not.toThrow()
    expect(() => assertDemoIds(['someone-elses-conference'], allow)).toThrow(
      /refusing/,
    )
    expect(() => assertDemoIds(['kkdemo.org'], allow)).toThrow(/refusing/)
  })

  it('stops when an edition document is missing in Sanity, writing nothing', async () => {
    const { d, commit } = deps('demo', { inSanity: [LIVE_CONFERENCE_ID] })
    await expect(run(opts(), d)).rejects.toThrow(/missing in Sanity: d1-/)
    expect(commit).not.toHaveBeenCalled()
  })

  it('stops when D1 has no edition for a fixture edition', async () => {
    const { d } = deps('demo', { editions: [D1_EDITIONS[1]] })
    await expect(run(opts(), d)).rejects.toThrow(/edition-past/)
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('dry run prints counts and creates no write client', async () => {
    const { d } = deps('demo', { editions: [] })
    await run(opts({ dryRun: true }), d)
    expect(d.createSanityClient).not.toHaveBeenCalled()
    const out = d.log.mock.calls.map((c) => c[0]).join('\n')
    expect(out).toMatch(/talk\s+46/)
    expect(out).toMatch(/no D1 edition yet/)
  })

  it('runs seedDemoD1 before reading editions and writing Sanity', async () => {
    const { d, seedDemoD1 } = deps('demo')
    await run(opts(), d)
    const reqs = vi.mocked(d.api.request).mock.invocationCallOrder
    expect(seedDemoD1.mock.invocationCallOrder[0]).toBeLessThan(reqs[1])
    expect(reqs[1]).toBeLessThan(
      d.createSanityClient.mock.invocationCallOrder[0],
    )
  })

  it('writes in transactions, twice identically; live conference patched not replaced, edition ids from D1', async () => {
    const a = deps('demo')
    const b = deps('demo')
    await run(opts(), a.d)
    await run(opts(), b.d)
    expect(a.commit).toHaveBeenCalled()
    expect(a.mutations.length).toBeGreaterThan(400)
    // Tokens are random without DEMO_SEED_TOKEN_SECRET; everything else matches.
    const noTokens = (m: unknown[]) =>
      JSON.parse(JSON.stringify(m).replace(/"token":"[^"]*"/g, '"token":""'))
    expect(noTokens(a.mutations)).toEqual(noTokens(b.mutations))

    // The live doc: patched only, never createOrReplace'd.
    const touching = (id: string) =>
      a.mutations.filter(
        (m) =>
          JSON.stringify(m).startsWith(`["put",{"_id":"${id}"`) ||
          (m as unknown[])[1] === id ||
          ((m as unknown[])[1] as { _id?: string })?._id === id,
      ) as unknown[][]
    const live = touching(LIVE_CONFERENCE_ID)
    expect(live.map((m) => m[0])).toEqual(['patch'])
    // setIfMissing only: an existing theme or branding is never overwritten.
    expect(Object.keys(live[0][2] as object)).toEqual(['setIfMissing'])
    expect(JSON.stringify(live[0][2])).not.toMatch(/theme|logo|primaryColor/)
    // Past/upcoming use the D1 ids from the query; no seed-made conference ids.
    expect(touching('d1-past-7f3').map((m) => m[0])).toEqual(['patch'])
    expect(touching('d1-next-9a2').map((m) => m[0])).toEqual(['patch'])
    expect(JSON.stringify(a.mutations)).not.toContain(
      `${DEMO_PREFIX}conference`,
    )
    expect(JSON.stringify(a.mutations)).toContain('"_ref":"d1-past-7f3"')
  })

  it('invite tokens are not derivable from the fixture key', () => {
    const { upsert } = buildDocuments(fixtures, EDITION_IDS)
    const invites = upsert.filter((d) => d._type === 'coSpeakerInvitation')
    expect(invites.length).toBeGreaterThan(0)
    for (const d of invites) {
      expect(d.token).toMatch(/^[0-9a-f]{64}$/)
      expect(d.token).not.toContain(d._id.split('.').pop())
    }
    expect(inviteToken('cospeaker-0', 's')).toBe(
      inviteToken('cospeaker-0', 's'),
    )
    expect(inviteToken('cospeaker-0', 's')).not.toBe(
      inviteToken('cospeaker-0', 't'),
    )
    expect(inviteToken('cospeaker-0', '')).not.toBe(
      inviteToken('cospeaker-0', ''),
    )
  })

  it('every _id stays inside the demo prefix; refs hit seeded docs or D1 editions', () => {
    const { upsert, ifMissing, conferences } = buildDocuments(
      fixtures,
      EDITION_IDS,
    )
    const docs = [...upsert, ...ifMissing]
    for (const doc of docs) expect(doc._id.startsWith(DEMO_PREFIX)).toBe(true)
    const refs = (
      JSON.stringify([docs, conferences]).match(/"_ref":"[^"]+"/g) ?? []
    ).map((r) => r.slice(8, -1))
    expect(refs.length).toBeGreaterThan(100)
    const ids = new Set([
      ...docs.map((x) => x._id),
      ...conferences.map((c) => c.id),
    ])
    expect(refs.filter((r) => !ids.has(r))).toEqual([])
    expect(conferences.map((c) => c.id).sort()).toEqual(
      ['d1-next-9a2', 'd1-past-7f3', LIVE_CONFERENCE_ID].sort(),
    )
  })

  it('gives every array item a _key', () => {
    const { upsert, conferences } = buildDocuments(fixtures, EDITION_IDS)
    const missing: string[] = []
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v))
        v.forEach((x, i) => {
          if (x && typeof x === 'object' && !('_key' in x))
            missing.push(`${path}[${i}]`)
          walk(x, `${path}[${i}]`)
        })
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
    }
    for (const doc of upsert) walk(doc, doc._id)
    for (const c of conferences) walk(c, c.id)
    expect(missing).toEqual([])
  })
})
