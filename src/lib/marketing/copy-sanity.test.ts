/**
 * @vitest-environment node
 *
 * The copy source read EXECUTED with groq-js: a Campaign's stored Recipes
 * come back as the Recipes that were written (Templates spec §2.1).
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
}))

import { getCopySource } from './copy-sanity'
import { recipeToStored } from './recipes'
import { BUILTIN_TEMPLATE } from './template'

const r = (id: string) => ({ _type: 'reference', _ref: id })
const finalPush = BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'finalPush')!

beforeEach(() => {
  h.dataset = [
    { _id: 'org', _type: 'organization' },
    { _id: 'conf-now', _type: 'conference', organization: r('org') },
    {
      _id: 'conf-old',
      _type: 'conference',
      organization: r('org'),
      title: 'Last year',
    },
    { _id: 'plan-old', _type: 'marketingPlan', conference: r('conf-old') },
    {
      _id: 'camp-old',
      _type: 'marketingCampaign',
      conference: r('conf-old'),
      plan: r('plan-old'),
      key: 'finalPush',
      title: 'Final push',
      startMilestone: 'CONFERENCE_START',
      endMilestone: 'CONFERENCE_START',
      primaryOutcome: 'ticketsSoldInWindow',
      recipes: JSON.parse(
        JSON.stringify(finalPush.recipes.map(recipeToStored)),
      ),
    },
  ]
})

it('reads a source Campaign with the Recipes stored on it', async () => {
  const source = await getCopySource('plan-old', 'org', 'conf-now')
  expect(source!.campaigns).toHaveLength(1)
  const recipes = source!.campaigns[0].recipes
  expect(recipes.map((x) => x.key)).toEqual(finalPush.recipes.map((x) => x.key))
  const countdown = recipes.find((x) => x.cadence)!
  expect(countdown.cadence).toEqual(
    finalPush.recipes.find((x) => x.key === countdown.key)!.cadence,
  )
  expect(countdown.skeleton).toBe(
    finalPush.recipes.find((x) => x.key === countdown.key)!.skeleton,
  )
})

it('reads a Campaign from before 053 as having no Recipes, not as broken', async () => {
  delete h.dataset.find((d) => d._id === 'camp-old')!.recipes
  const source = await getCopySource('plan-old', 'org', 'conf-now')
  expect(source!.campaigns[0].recipes).toEqual([])
})
