// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.docs, params })).get(),
  },
  clientWrite: { transaction: vi.fn() },
}))

import { libraryEntry } from '.'
import { recipeToStored } from '../recipes'
import { readCampaignRecipes, readPlanForBuiltin } from './sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const speakerCard = libraryEntry('speakerCard')

beforeEach(() => {
  h.docs = [
    {
      _id: 'plan-A',
      _rev: 'pa',
      _type: 'marketingPlan',
      conference: ref('conf-A'),
      owner: ref('sp-owner'),
    },
    {
      _id: 'plan-B',
      _rev: 'pb',
      _type: 'marketingPlan',
      conference: ref('conf-B'),
    },
    {
      _id: 'drafts.plan-A',
      _rev: 'pd',
      _type: 'marketingPlan',
      conference: ref('conf-A'),
    },
    {
      _id: 'camp-1',
      _rev: 'c1',
      _type: 'marketingCampaign',
      key: 'custom-1',
      conference: ref('conf-A'),
      plan: ref('plan-A'),
      recipes: [
        ...speakerCard.recipes.map(recipeToStored),
        { _key: 'half', title: 'A half-filled Studio row' },
      ],
      triggers: [
        {
          _key: 't1',
          event: 'speakerConfirmed',
          taskRecipeKey: 'speakerCardRender',
        },
        { _key: 't2', event: 'speakerConfirmed' },
      ],
      generatedKeys: ['speakerCard:sp-1:bluesky'],
    },
    {
      _id: 'camp-2',
      _rev: 'c2',
      _type: 'marketingCampaign',
      key: 'cfp',
      conference: ref('conf-A'),
      plan: ref('plan-A'),
    },
    {
      _id: 'drafts.camp-3',
      _rev: 'c3',
      _type: 'marketingCampaign',
      key: 'keynotes',
      conference: ref('conf-A'),
      plan: ref('plan-A'),
    },
    {
      _id: 'camp-B',
      _rev: 'cb',
      _type: 'marketingCampaign',
      key: 'speakers',
      conference: ref('conf-B'),
      plan: ref('plan-B'),
    },
    // Hand-edited: a Campaign of conference A hanging off conference B's plan.
    {
      _id: 'camp-crossed',
      _rev: 'cx',
      _type: 'marketingCampaign',
      key: 'custom-2',
      conference: ref('conf-A'),
      plan: ref('plan-B'),
    },
    {
      _id: 'camp-keyless',
      _rev: 'ck',
      _type: 'marketingCampaign',
      conference: ref('conf-A'),
      plan: ref('plan-A'),
    },
  ]
})

describe('readCampaignRecipes', () => {
  it('reads the Campaign with its plan, owner, readable Recipes, whole Triggers and marker', async () => {
    expect(await readCampaignRecipes('camp-1', 'conf-A')).toEqual({
      _id: 'camp-1',
      _rev: 'c1',
      key: 'custom-1',
      planId: 'plan-A',
      planOwnerId: 'sp-owner',
      recipes: speakerCard.recipes.map((r) =>
        expect.objectContaining({ key: r.key }),
      ),
      triggers: [
        { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
      ],
      generatedKeys: ['speakerCard:sp-1:bluesky'],
    })
  })
  it('never reads another conference’s Campaign, nor one whose plan is another conference’s', async () => {
    expect(await readCampaignRecipes('camp-B', 'conf-A')).toBeNull()
    expect(await readCampaignRecipes('camp-crossed', 'conf-A')).toBeNull()
    // …while the same id is readable from where it belongs.
    expect((await readCampaignRecipes('camp-B', 'conf-B'))?.planId).toBe(
      'plan-B',
    )
  })
  it('is null for a Campaign with no key, and for a draft', async () => {
    expect(await readCampaignRecipes('camp-keyless', 'conf-A')).toBeNull()
    expect(await readCampaignRecipes('drafts.camp-3', 'conf-A')).toBeNull()
  })
})

describe('readPlanForBuiltin', () => {
  it('reads this conference’s live plan, its revision and the keys of its live Campaigns', async () => {
    expect(await readPlanForBuiltin('conf-A')).toEqual({
      planId: 'plan-A',
      planRev: 'pa',
      ownerId: 'sp-owner',
      campaignKeys: ['custom-1', 'cfp'],
    })
  })
  it('sees nothing of another conference, and null without a plan', async () => {
    expect((await readPlanForBuiltin('conf-B'))?.campaignKeys).toEqual([
      'speakers',
    ])
    expect(await readPlanForBuiltin('conf-C')).toBeNull()
  })
})
