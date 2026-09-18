import { describe, expect, it } from 'vitest'
import migration from './index'

type Doc = Record<string, unknown>
interface Patch {
  id: string
  options?: { ifRevision?: string }
  patches: { path: string[]; op: { type: string; value: unknown } }[]
}

const campaign: Doc = {
  _id: 'camp',
  _rev: 'r-camp',
  _type: 'marketingCampaign',
  key: 'cfp',
  title: 'Call',
  primaryOutcome: 'cfpSubmissions',
  target: 0,
  startDate: '2026-02-01',
  endDate: '2026-03-01',
  conference: { _ref: 'conf' },
  plan: { _type: 'reference', _ref: 'plan' },
}
const snapshot = (over: Doc = {}): Doc => ({
  _id: 'snap',
  _rev: 'r-snap',
  _type: 'marketingSnapshot',
  conference: { _ref: 'conf' },
  campaign: { _type: 'reference', _ref: 'camp' },
  perTask: [{ _key: 'row', task: { _ref: 'task' }, sessions: 7 }],
  ...over,
})
const task: Doc = {
  _id: 'task',
  _rev: 'r-task',
  _type: 'marketingTask',
  key: 'cfp:launch',
  conference: { _ref: 'conf' },
  campaign: { _type: 'reference', _ref: 'camp' },
}

async function run(docs: Doc[]) {
  const documents = async function* () {
    for (const document of docs) yield document
  }
  const out: Patch[] = []
  // `migrate` is the async-iterable form; it yields mutations, not documents.
  const migrate = migration.migrate as unknown as (
    d: () => AsyncGenerator<Doc>,
  ) => AsyncGenerator<Patch | Patch[]>
  for await (const mutation of migrate(documents))
    out.push(...(Array.isArray(mutation) ? mutation : [mutation]))
  return out
}

const fields = (p: Patch) =>
  Object.fromEntries(p.patches.map((x) => [x.path.join('.'), x.op.value]))

describe('migration 052 as one run', () => {
  it('writes ONE compare-and-set patch per Snapshot, carrying both passes', async () => {
    // Every patch is guarded on the revision read at stream start, and a
    // Snapshot is touched by BOTH jobs — the owner pass weakens its references,
    // the backfill copies the Campaign's attribution onto it. Emitting them
    // separately meant the first flushed, changed the revision, and the
    // second's guard conflicted on every Snapshot in the dataset, so the
    // migration could never complete in one run and deletion stayed gated.
    const out = await run([campaign, task, snapshot()])
    const forSnap = out.filter((p) => p.id === 'snap')
    expect(forSnap).toHaveLength(1)
    expect(forSnap[0].options).toEqual({ ifRevision: 'r-snap' })
    const written = fields(forSnap[0])
    // The owner pass's job…
    expect(written.campaign).toEqual({
      _type: 'reference',
      _ref: 'camp',
      _weak: true,
    })
    // …and the backfill's, in the same mutation.
    expect(written.campaignKey).toBe('cfp')
    expect(written.campaignTitle).toBe('Call')
    expect(written.perTask).toEqual([
      {
        _key: 'row',
        task: { _ref: 'task', _weak: true },
        taskKey: 'cfp:launch',
        sessions: 7,
      },
    ])
    // Non-Snapshot documents are still weakened, each once.
    expect(out.filter((p) => p.id === 'camp')).toHaveLength(1)
    expect(out.filter((p) => p.id === 'task')).toHaveLength(1)
  })

  it('still weakens every reference when a Campaign join cannot be resolved', async () => {
    // The two jobs stay independent in FAILURE: deletion refuses until the
    // references are weak, so one unrestorable Campaign must not be able to
    // leave every plan permanently undeletable. The backfill keeps its
    // all-or-nothing contract and writes nothing.
    const orphan = snapshot({ _id: 'orphan', _rev: 'r-orphan' })
    const out = await run([task, orphan]).catch((error) => error as Error)
    expect(out).toBeInstanceOf(Error)

    const collected: Patch[] = []
    const documents = async function* () {
      for (const document of [task, orphan]) yield document
    }
    const migrate = migration.migrate as unknown as (
      d: () => AsyncGenerator<Doc>,
    ) => AsyncGenerator<Patch | Patch[]>
    await expect(
      (async () => {
        for await (const mutation of migrate(documents))
          collected.push(...(Array.isArray(mutation) ? mutation : [mutation]))
      })(),
    ).rejects.toThrow(/campaign no longer resolves/)
    const forOrphan = collected.filter((p) => p.id === 'orphan')
    expect(forOrphan).toHaveLength(1)
    expect(fields(forOrphan[0]).campaign).toEqual({
      _type: 'reference',
      _ref: 'camp',
      _weak: true,
    })
    expect(fields(forOrphan[0]).campaignKey).toBeUndefined()
  })
})
