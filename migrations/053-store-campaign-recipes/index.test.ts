import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { expandCampaignSubjectless } from '../../src/lib/marketing/expansion'
import { resolveAllMilestones } from '../../src/lib/marketing/milestones'
import { recipesFromStored } from '../../src/lib/marketing/recipes'
import { BUILTIN_TEMPLATE } from '../../src/lib/marketing/template'
import { backfillCampaign } from './backfill'
import migration from './index'
import { TEMPLATE_2026_1 } from './template-2026.1'
import { sequentialShortCodes } from '@/lib/marketing/short-code'

type Doc = Record<string, unknown>
interface Patch {
  id: string
  options?: { ifRevision?: string }
  patches: { path: string[]; op: { type: string; value: unknown } }[]
}

/**
 * 053 writes the FROZEN 2026.1 Recipes, so the fixtures and the expectations
 * are built from the snapshot, never from the live built-in.
 */
const builtin = (key: string) =>
  TEMPLATE_2026_1.campaigns.find((c) => c.key === key)!

const campaign = (key: string, over: Doc = {}): Doc => ({
  _id: `camp-${key}`,
  _rev: `r-${key}`,
  _type: 'marketingCampaign',
  key,
  conference: { _ref: 'conf' },
  triggers: builtin(key)?.triggers ?? [],
  ...over,
})
const task = (key: string, campaignId: string, over: Doc = {}): Doc => ({
  _id: `task-${campaignId}-${key}`,
  _rev: 'r-task',
  _type: 'marketingTask',
  key,
  conference: { _ref: 'conf' },
  campaign: { _type: 'reference', _ref: campaignId, _weak: true },
  ...over,
})

async function run(docs: Doc[]) {
  const documents = async function* () {
    for (const document of docs) yield document
  }
  const out: Patch[] = []
  const migrate = migration.migrate as unknown as (
    d: () => AsyncGenerator<Doc>,
  ) => AsyncGenerator<Patch | Patch[]>
  for await (const mutation of migrate(documents))
    out.push(...(Array.isArray(mutation) ? mutation : [mutation]))
  return out
}

const fields = (p: Patch) =>
  Object.fromEntries(p.patches.map((x) => [x.path.join('.'), x.op.value]))

/** Apply the patches the way Sanity would, for re-run and expansion checks. */
function apply(docs: Doc[], patches: Patch[]): Doc[] {
  return docs.map((d) => {
    const mine = patches.filter((p) => p.id === d._id)
    return mine.length
      ? { ...d, ...Object.assign({}, ...mine.map(fields)), _rev: `${d._rev}+` }
      : d
  })
}

const COUNTDOWN = ['countdown:d-30:bluesky', 'countdown:d-29:bluesky']

describe('migration 053', () => {
  it('copies the 2026.1 Recipes onto a Campaign with a built-in key, compare-and-set', async () => {
    const out = await run([campaign('speakers')])
    expect(out).toHaveLength(1)
    expect(out[0].options).toEqual({ ifRevision: 'r-speakers' })
    const written = fields(out[0])
    expect(
      recipesFromStored(written.recipes as never).map((r) => r.key),
    ).toEqual(builtin('speakers').recipes.map((r) => r.key))
    const members = written.recipes as { _key: string }[]
    expect(new Set(members.map((m) => m._key)).size).toBe(members.length)
    // No countdown on this Campaign: the marker is not touched at all.
    expect(written).not.toHaveProperty('generatedKeys')
  })

  it('writes the keys of EXISTING countdown Tasks onto the marker, keeping what is there', async () => {
    const out = await run([
      campaign('finalPush', {
        generatedKeys: ['already:there', COUNTDOWN[0]],
      }),
      ...COUNTDOWN.map((key) => task(key, 'camp-finalPush')),
      // Not a countdown Task: a static post of the same Campaign.
      task('lastChance:linkedin', 'camp-finalPush'),
      // A countdown Task of ANOTHER Campaign, conference, or a draft.
      task('countdown:d-5:bluesky', 'camp-other'),
      task('countdown:d-4:bluesky', 'camp-finalPush', {
        conference: { _ref: 'conf-B' },
      }),
      task('countdown:d-3:bluesky', 'camp-finalPush', {
        _id: 'drafts.task-x',
      }),
    ])
    expect(fields(out[0]).generatedKeys).toEqual([
      'already:there',
      COUNTDOWN[0],
      COUNTDOWN[1],
    ])
  })

  it('after the backfill, putting the countdown on the Campaign again creates NOTHING that exists', async () => {
    const conference = {
      _id: 'conf',
      cfpStartDate: '2027-01-10',
      cfpEndDate: '2027-03-01',
      cfpNotifyDate: '2027-04-01',
      programDate: '2027-04-20',
      startDate: '2027-06-10',
      endDate: '2027-06-11',
    }
    const expand = (generatedKeys: string[]) =>
      expandCampaignSubjectless({
        recipes: builtin('finalPush').recipes,
        generatedKeys: new Set(generatedKeys),
        milestones: resolveAllMilestones(conference),
        now: '2027-01-01T00:00:00.000Z',
        campaign: { _id: 'camp-finalPush', key: 'finalPush' },
        planId: 'plan',
        conference: { _id: 'conf', baseUrl: 'https://example.com' },
        values: {},
        assigneeId: 'owner',
        taskId: (key) => key,
        newShortCode: sequentialShortCodes(),
        newId: (type) => type,
      }).tasks.map((t) => t.key)
    const live = expand([])
    expect(live.length).toBeGreaterThan(1)
    const docs = [
      campaign('finalPush'),
      ...live.map((key) => task(key, 'camp-finalPush')),
    ]
    const [migrated] = apply(docs, await run(docs))
    expect(expand(migrated.generatedKeys as string[])).toEqual([])
  })

  it('never overwrites Recipes a Campaign already has: the plan is frozen, and a re-run is a no-op', async () => {
    const docs = [
      campaign('finalPush'),
      ...COUNTDOWN.map((key) => task(key, 'camp-finalPush')),
      campaign('speakers', {
        recipes: [
          { _key: 'mine', key: 'mine', beat: 'mine', kind: 'checklist' },
        ],
      }),
    ]
    const first = await run(docs)
    expect(first.map((p) => p.id)).toEqual(['camp-finalPush'])
    expect(await run(apply(docs, first))).toEqual([])
  })

  it("does not overwrite Recipes it cannot read: a non-empty array is somebody's, whatever is in it", async () => {
    expect(
      await run([
        campaign('speakers', { recipes: [{ _key: 'half', title: 'Half' }] }),
      ]),
    ).toEqual([])
  })

  it('records a countdown key once, however many Tasks carry it', async () => {
    const out = await run([
      campaign('finalPush'),
      task(COUNTDOWN[0], 'camp-finalPush'),
      task(COUNTDOWN[0], 'camp-finalPush', { _id: 'task-duplicate' }),
    ])
    expect(fields(out[0]).generatedKeys).toEqual([COUNTDOWN[0]])
  })

  it('refuses to backfill from a Template that is not 2026.1', () => {
    expect(() =>
      backfillCampaign(campaign('speakers'), [], {
        ...TEMPLATE_2026_1,
        version: '2027.1',
      }),
    ).toThrow(/2026\.1/)
    // The LIVE built-in has moved on (2026.2, #1134) and is refused too, so a
    // future bump can never quietly become what 053 writes.
    expect(BUILTIN_TEMPLATE.version).not.toBe('2026.1')
    expect(() =>
      backfillCampaign(campaign('speakers'), [], BUILTIN_TEMPLATE),
    ).toThrow(/2026\.1/)
    expect(backfillCampaign(campaign('speakers'), [])).not.toBeNull()
  })

  it('the Recipes it would write are still the 2026.1 Recipes', () => {
    // A plan seeded before this release was resolved against THESE Recipes, so
    // `template-2026.1.ts` is a frozen snapshot and this digest is the one the
    // test pinned while it still read the live built-in — the proof that the
    // freeze is verbatim. If this fails, the snapshot was edited: it must not
    // be. Once 053 has run on every dataset, the snapshot, this test and the
    // migration go together.
    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          TEMPLATE_2026_1.campaigns.map((c) => [c.key, c.recipes]),
        ),
      )
      .digest('hex')
    expect(digest).toBe(
      '3f759c2074ea7db680814471996c0d68b908cbe3ac1cf7c17df7e657cf12b519',
    )
  })

  it('leaves custom Campaigns, drafts and Content Release copies alone', async () => {
    expect(
      await run([
        campaign('custom-1234'),
        campaign('cfp', { _id: 'drafts.camp-cfp' }),
        campaign('cfp', { _id: 'versions.r1.camp-cfp' }),
      ]),
    ).toEqual([])
  })
})
