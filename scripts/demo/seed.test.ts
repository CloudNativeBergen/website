import { describe, expect, it, vi } from 'vitest'
import { generateDemoFixtures } from './fixtures/generate'
import {
  buildDocuments,
  DEMO_PREFIX,
  DEMO_SEED,
  inviteToken,
  NotDemoOrgError,
  run,
  type Deps,
} from './seed'

const now = new Date('2026-11-08T00:00:00Z')

function deps(kind: string | null) {
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
        commit,
      }
      return tx
    },
  }
  const d = {
    api: {
      request: vi.fn(async () => ({
        organization: kind === null ? null : { id: 'org-1', kind },
      })) as unknown as Deps['api']['request'],
    },
    createSanityClient: vi.fn(async () => client),
    loadSeedDemoD1: vi.fn(async () => undefined),
    log: vi.fn(),
  } satisfies Deps
  return { d, mutations, commit }
}

describe('demo:seed', () => {
  it('refuses a customer org before any Sanity client exists', async () => {
    const { d } = deps('customer')
    await expect(
      run({ host: 'customer.example.com', dryRun: false, now }, d),
    ).rejects.toThrow(NotDemoOrgError)
    expect(d.createSanityClient).not.toHaveBeenCalled()
    expect(d.loadSeedDemoD1).not.toHaveBeenCalled()
  })

  it('refuses an unknown org the same way', async () => {
    const { d } = deps(null)
    await expect(
      run({ host: 'nope.example.com', dryRun: false, now }, d),
    ).rejects.toThrow(NotDemoOrgError)
    expect(d.createSanityClient).not.toHaveBeenCalled()
  })

  it('dry run prints counts and creates no write client', async () => {
    const { d } = deps('demo')
    await run({ host: 'kk.example.com', dryRun: true, now }, d)
    expect(d.createSanityClient).not.toHaveBeenCalled()
    const out = d.log.mock.calls.map((c) => c[0]).join('\n')
    expect(out).toMatch(/talk\s+46/)
    expect(out).toMatch(/seedDemoD1 not available/)
  })

  it('a demo org writes in transactions, and twice gives identical mutations', async () => {
    const a = deps('demo')
    const b = deps('demo')
    await run({ host: 'kk.example.com', dryRun: false, now }, a.d)
    await run({ host: 'kk.example.com', dryRun: false, now }, b.d)
    expect(a.commit).toHaveBeenCalled()
    expect(a.mutations.length).toBeGreaterThan(400)
    // Tokens are random without DEMO_SEED_TOKEN_SECRET; everything else matches.
    const noTokens = (m: unknown[]) =>
      JSON.parse(JSON.stringify(m).replace(/"token":"[^"]*"/g, '"token":""'))
    expect(noTokens(a.mutations)).toEqual(noTokens(b.mutations))
  })

  it('invite tokens are not derivable from the fixture key', () => {
    const { upsert } = buildDocuments(
      generateDemoFixtures({ seed: DEMO_SEED, now }),
    )
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

  it('every _id and every reference stays inside the demo prefix', () => {
    const { upsert, ifMissing } = buildDocuments(
      generateDemoFixtures({ seed: DEMO_SEED, now }),
    )
    const docs = [...upsert, ...ifMissing]
    for (const doc of docs) expect(doc._id.startsWith(DEMO_PREFIX)).toBe(true)
    const refs = JSON.stringify(docs).match(/"_ref":"[^"]+"/g) ?? []
    expect(refs.length).toBeGreaterThan(100)
    for (const r of refs) expect(r).toContain(`"_ref":"${DEMO_PREFIX}`)
    // Every reference points at a document this seed writes.
    const ids = new Set(docs.map((x) => x._id))
    expect(refs.map((r) => r.slice(8, -1)).filter((r) => !ids.has(r))).toEqual(
      [],
    )
  })

  it('gives every array item a _key', () => {
    const { upsert } = buildDocuments(
      generateDemoFixtures({ seed: DEMO_SEED, now }),
    )
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
    expect(missing).toEqual([])
  })
})
