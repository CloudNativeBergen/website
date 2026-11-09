import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { avatarAsset } from './assets'
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
    inSanity = [DEMO_ORG_ID, LIVE_CONFERENCE_ID, 'd1-past-7f3', 'd1-next-9a2'],
    haveAssets = [] as string[],
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
    fetch: vi.fn(async (_q: string, p: { ids: string[] }) =>
      [...inSanity, ...haveAssets].filter((x) => p.ids.includes(x)),
    ) as unknown as SanityWriter['fetch'],
    // Like Sanity: the asset id is the sha1 of the uploaded bytes.
    assets: {
      upload: vi.fn<SanityWriter['assets']['upload']>(async (_t, body) => ({
        _id: `image-${createHash('sha1').update(body).digest('hex')}-256x256-svg`,
      })),
    },
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
  return { d, mutations, commit, seedDemoD1, upload: client.assets.upload }
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
    const { d, commit } = deps('demo', {
      inSanity: [DEMO_ORG_ID, LIVE_CONFERENCE_ID],
    })
    await expect(run(opts(), d)).rejects.toThrow(/missing in Sanity: d1-/)
    expect(commit).not.toHaveBeenCalled()
  })

  it('uploads nothing when a Sanity check stops the run', async () => {
    const { d, upload } = deps('demo', { inSanity: [LIVE_CONFERENCE_ID] })
    await expect(run(opts(), d)).rejects.toThrow(/missing in Sanity/)
    expect(d.createSanityClient).toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploads nothing on guard refusal or dry run', async () => {
    for (const [kind, o] of [
      ['customer', opts()],
      ['demo', opts({ dryRun: true })],
    ] as const) {
      const { d, upload } = deps(kind)
      await run(o, d).catch(() => undefined)
      expect(upload).not.toHaveBeenCalled()
    }
  })

  it('uploads each avatar once, before any commit, and skips unchanged ones', async () => {
    const first = deps('demo')
    await run(opts(), first.d)
    const n = first.upload.mock.calls.length
    expect(n).toBe(
      new Set(first.upload.mock.calls.map((c) => c[2].filename)).size,
    )
    expect(n).toBeGreaterThan(34)
    expect(first.upload.mock.invocationCallOrder[n - 1]).toBeLessThan(
      first.commit.mock.invocationCallOrder[0],
    )
    const uploaded = await Promise.all(
      first.upload.mock.results.map((r) => r.value as Promise<{ _id: string }>),
    )
    const again = deps('demo', { haveAssets: uploaded.map((u) => u._id) })
    await run(opts(), again.d)
    expect(again.upload).not.toHaveBeenCalled()
  })

  it('stops before any commit if Sanity names an avatar differently', async () => {
    const { d, upload, commit } = deps('demo')
    upload.mockResolvedValueOnce({ _id: 'image-other-256x256-svg' })
    await expect(run(opts(), d)).rejects.toThrow(/avatar uploaded as/)
    expect(commit).not.toHaveBeenCalled()
  })

  it('every speaker gets a deterministic avatar ref; every sponsor its own logo', () => {
    const { upsert, avatars } = buildDocuments(fixtures, EDITION_IDS)
    const speakers = upsert.filter((x) => x._type === 'speaker')
    expect(speakers.length).toBe(avatars.length)
    const refs = speakers.map(
      (x) => (x.image as { asset: { _ref: string } }).asset._ref,
    )
    expect(refs.every((r) => /^image-[0-9a-f]{40}-256x256-svg$/.test(r))).toBe(
      true,
    )
    expect(new Set(refs).size).toBe(refs.length)
    expect(refs).toEqual(avatars.map((a) => a.assetId))
    // Same key and name, same bytes.
    expect(avatarAsset('speaker-1', 'Ada Berg')).toEqual(
      avatarAsset('speaker-1', 'Ada Berg'),
    )
    const sponsors = upsert.filter((x) => x._type === 'sponsor')
    expect(sponsors).toHaveLength(12)
    const logos = sponsors.map((x) => x.logo as string)
    expect(new Set(logos).size).toBe(12)
    for (const [i, l] of logos.entries())
      expect(l).toContain(`aria-label="${sponsors[i].name}"`)
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
    const set = (live[0][2] as { setIfMissing: Record<string, unknown> })
      .setIfMissing
    for (const f of [
      'logoBright',
      'logoDark',
      'logomarkBright',
      'logomarkDark',
    ])
      expect(set[f]).toMatch(/^<svg [^>]*aria-label="KontainerKonf"/)
    expect(set.theme).toEqual({
      primaryColor: '#0f5c8a',
      accentColor: '#f2a541',
    })
    // Branding goes on the live edition only.
    expect(JSON.stringify(touching('d1-past-7f3'))).not.toMatch(/logo|theme/)
    // Past/upcoming use the D1 ids from the query; no seed-made conference ids.
    expect(touching('d1-past-7f3').map((m) => m[0])).toEqual(['patch'])
    expect(touching('d1-next-9a2').map((m) => m[0])).toEqual(['patch'])
    expect(JSON.stringify(a.mutations)).not.toContain(
      `${DEMO_PREFIX}conference`,
    )
    expect(JSON.stringify(a.mutations)).toContain('"_ref":"d1-past-7f3"')
  })

  it('never writes kkdemo.org and references only it as the organization', async () => {
    const { d, mutations } = deps('demo')
    await run(opts(), d)
    const targets = (mutations as unknown[][]).map((m) =>
      typeof m[1] === 'string' ? m[1] : (m[1] as { _id: string })._id,
    )
    expect(targets.length).toBeGreaterThan(400)
    expect(targets).not.toContain(DEMO_ORG_ID)
    expect(targets.filter((t) => t.includes('organization'))).toEqual([])
    const json = JSON.stringify(mutations)
    const orgRefs = [
      ...json.matchAll(
        /"organizations?":(\[?)\{"_type":"reference","_ref":"([^"]+)"/g,
      ),
    ].map((m) => m[2])
    expect(orgRefs.length).toBeGreaterThan(40)
    expect(new Set(orgRefs)).toEqual(new Set([DEMO_ORG_ID]))
  })

  it('stops when kkdemo.org is missing in Sanity, writing nothing', async () => {
    const { d, commit } = deps('demo', {
      inSanity: [LIVE_CONFERENCE_ID, 'd1-past-7f3', 'd1-next-9a2'],
    })
    await expect(run(opts(), d)).rejects.toThrow(
      /missing in Sanity: kkdemo.org/,
    )
    expect(commit).not.toHaveBeenCalled()
  })

  it('gives every topic the hex color the schema requires', () => {
    const { upsert } = buildDocuments(fixtures, EDITION_IDS)
    const topics = upsert.filter((d) => d._type === 'topic')
    expect(topics.length).toBeGreaterThan(0)
    for (const d of topics) {
      expect(d.color).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    }
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
    const { upsert, conferences, avatars } = buildDocuments(
      fixtures,
      EDITION_IDS,
    )
    const docs = upsert
    for (const doc of docs) expect(doc._id.startsWith(DEMO_PREFIX)).toBe(true)
    const refs = (
      JSON.stringify([docs, conferences]).match(/"_ref":"[^"]+"/g) ?? []
    ).map((r) => r.slice(8, -1))
    expect(refs.length).toBeGreaterThan(100)
    const ids = new Set([
      ...docs.map((x) => x._id),
      ...conferences.map((c) => c.id),
      ...avatars.map((a) => a.assetId), // uploaded before the transactions
      DEMO_ORG_ID,
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
