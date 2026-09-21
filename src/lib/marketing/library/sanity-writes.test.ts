// @vitest-environment node
/**
 * The Recipe writer against the REAL `@sanity/client` transaction builder and
 * Sanity's REAL patch semantics (`@sanity/mutator`, resolved through `sanity`).
 * A hand-rolled patch mock once recorded three chained `.append()` calls as
 * three writes; the real client keeps only the last `insert` of a patch, so
 * Recipes and Triggers were silently never stored. Nothing here is a mock of
 * the thing under test: only the network commit is intercepted.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  transactions: [] as { serialize: () => unknown[] }[],
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })
  return {
    clientReadUncached: { fetch: vi.fn() },
    clientWrite: {
      transaction: () => {
        const tx = client.transaction()
        tx.commit = (async () => {
          h.transactions.push(tx)
          return {}
        }) as typeof tx.commit
        return tx
      },
    },
  }
})

import { emptyRecords, materializeTask } from '../materialize'
import { recipeToStored } from '../recipes'
import { triggerMember } from '../sanity'
import { libraryEntry } from '.'
import { saveCampaignRecipes } from './sanity'

type Doc = Record<string, unknown> & { _id: string }
const { Mutation } = createRequire(
  createRequire(import.meta.url).resolve('sanity/package.json'),
)('@sanity/mutator') as {
  Mutation: new (options: { mutations: unknown[] }) => {
    apply: (doc: Doc | null) => Doc | null
  }
}

/** What Sanity would hold for `doc` after the last committed transaction. */
function applied(doc: Doc): Doc {
  const mutations = h.transactions
    .at(-1)!
    .serialize()
    .filter((m) => (m as { patch?: { id: string } }).patch?.id === doc._id)
  return new Mutation({ mutations }).apply(structuredClone(doc))!
}

const speakerCard = libraryEntry('speakerCard')
const countdown = libraryEntry('countdown')
const HALF_FILLED = { _key: 'half', title: 'A half-filled Studio row' }
const OTHER_TRIGGER = {
  _key: 'other',
  _type: 'marketingTrigger',
  event: 'sponsorSigned',
  taskRecipeKey: 'sponsorCardRender',
}
const campaign = (): Doc => ({
  _id: 'camp-1',
  _rev: 'rev-1',
  _type: 'marketingCampaign',
  recipes: [HALF_FILLED, ...countdown.recipes.map(recipeToStored)],
  triggers: [OTHER_TRIGGER],
  generatedKeys: ['countdown:d-3:bluesky'],
})
const base = {
  campaignId: 'camp-1',
  rev: 'rev-1',
  planId: 'plan-1',
  conferenceId: 'conf-A',
  actorId: 'sp-actor',
  removeKeys: [] as string[],
  recipes: [],
  triggers: [],
  records: emptyRecords(),
}
const keys = (doc: Doc, field: 'recipes' | 'triggers') =>
  (doc[field] as Record<string, string>[]).map(
    (row) => row.key ?? row.taskRecipeKey ?? row._key,
  )

beforeEach(() => {
  h.transactions = []
})

describe('saveCampaignRecipes, as Sanity applies it', () => {
  it('ATTACH stores the Recipes AND the Trigger, beside everything already there', async () => {
    await saveCampaignRecipes({
      ...base,
      recipes: speakerCard.recipes,
      triggers: speakerCard.triggers,
    })
    const after = applied(campaign())
    expect(keys(after, 'recipes')).toEqual([
      'half',
      'countdown:bluesky',
      'speakerCardRender',
      'speakerCard:linkedin',
      'speakerCard:bluesky',
    ])
    expect(keys(after, 'triggers')).toEqual([
      'sponsorCardRender',
      'speakerCardRender',
    ])
    expect(after.generatedKeys).toEqual(['countdown:d-3:bluesky'])
    expect((after.recipes as unknown[])[0]).toEqual(HALF_FILLED)
  })
  it('UPDATE swaps the entry’s own rows and puts its Trigger back', async () => {
    const before = campaign()
    before.recipes = [
      ...(before.recipes as unknown[]),
      ...speakerCard.recipes.map(recipeToStored),
    ]
    before.triggers = [
      OTHER_TRIGGER,
      ...speakerCard.triggers.map(triggerMember),
    ]
    const edited = speakerCard.recipes
      .filter((r) => r.channel !== 'linkedin')
      .map((r) => ({ ...r, title: 'Meet the speaker' }))
    await saveCampaignRecipes({
      ...base,
      removeKeys: speakerCard.recipes.map((r) => r.key),
      recipes: edited,
      triggers: speakerCard.triggers,
    })
    const after = applied(before)
    expect(keys(after, 'recipes')).toEqual([
      'half',
      'countdown:bluesky',
      'speakerCardRender',
      'speakerCard:bluesky',
    ])
    expect(
      (after.recipes as { title: string }[]).slice(2).map((r) => r.title),
    ).toEqual(['Meet the speaker', 'Meet the speaker'])
    expect(keys(after, 'triggers')).toEqual([
      'sponsorCardRender',
      'speakerCardRender',
    ])
  })
  it('REMOVE takes the rows and the Trigger naming them, and leaves the marker alone', async () => {
    await saveCampaignRecipes({ ...base, removeKeys: ['countdown:bluesky'] })
    const after = applied(campaign())
    expect(keys(after, 'recipes')).toEqual(['half'])
    expect(keys(after, 'triggers')).toEqual(['sponsorCardRender'])
    expect(after.generatedKeys).toEqual(['countdown:d-3:bluesky'])
  })
  it('an attach onto a Campaign with no arrays at all still lands, and creates the expansion’s Tasks with their keys on the marker in the SAME transaction', async () => {
    const records = materializeTask({
      recipe: countdown.recipes[0],
      taskId: 'task-1',
      key: 'countdown:d-2:bluesky',
      campaign: { _id: 'camp-1', key: 'custom-1' },
      planId: 'plan-1',
      conference: { _id: 'conf-A', baseUrl: 'https://example.com' },
      values: {},
      at: '2027-06-08T16:00:00.000Z',
      anchor: { milestone: 'CONFERENCE_START', offsetDays: -2 },
      provisional: false,
      assigneeId: 'sp-owner',
      prerequisiteIds: [],
      origin: 'expansion',
      newId: (type) => `${type}.1`,
    })
    await saveCampaignRecipes({
      ...base,
      recipes: countdown.recipes,
      records,
    })
    const after = applied({
      _id: 'camp-1',
      _rev: 'rev-1',
      _type: 'marketingCampaign',
    })
    expect(keys(after, 'recipes')).toEqual(['countdown:bluesky'])
    expect(after.triggers).toEqual([])
    expect(after.generatedKeys).toEqual(['countdown:d-2:bluesky'])
    expect(h.transactions).toHaveLength(1)
    expect(
      h.transactions[0]
        .serialize()
        .flatMap((m) => (m as { create?: { _id: string } }).create?._id ?? []),
    ).toEqual(['socialPost.1', 'socialPostVariant.1', 'task-1'])
  })
  it('gives an ownerless plan the acting organizer as owner in the same transaction, and never replaces an owner', async () => {
    await saveCampaignRecipes({ ...base, recipes: speakerCard.recipes })
    const ownerless = applied({ _id: 'plan-1', _type: 'marketingPlan' })
    expect(ownerless.owner).toEqual({
      _type: 'reference',
      _ref: 'sp-actor',
      _weak: true,
    })
    const owned = applied({
      _id: 'plan-1',
      _type: 'marketingPlan',
      owner: { _type: 'reference', _ref: 'sp-owner', _weak: true },
    })
    expect((owned.owner as { _ref: string })._ref).toBe('sp-owner')
    expect(owned.structurallyEdited).toBe(true)
  })
  it('carries the compare-and-set on the first write to the Campaign, and sends no empty operation', async () => {
    await saveCampaignRecipes({ ...base, removeKeys: ['countdown:bluesky'] })
    const patches = h.transactions[0]
      .serialize()
      .map((m) => (m as { patch: Record<string, unknown> }).patch)
      .filter((p) => p?.id === 'camp-1')
    expect(patches[0].ifRevisionID).toBe('rev-1')
    expect(patches.filter((p) => 'insert' in p)).toEqual([])
    expect(JSON.stringify(patches)).not.toContain('"unset":[]')
  })
})
