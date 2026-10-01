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

it('reads the Format of a render Task, a render stored without one as square, and a post as having none (Formats spec §6)', async () => {
  const task = (id: string, kind: string, extra: Record<string, unknown>) => ({
    _id: id,
    _type: 'marketingTask',
    conference: r('conf-old'),
    plan: r('plan-old'),
    campaign: r('camp-old'),
    key: id,
    title: id,
    kind,
    ...extra,
  })
  h.dataset.push(
    task('wide', 'studioRender', { format: 'landscape' }),
    task('old', 'studioRender', {}),
    task('post', 'publishing', { channel: 'linkedin', format: 'landscape' }),
  )
  const source = await getCopySource('plan-old', 'org', 'conf-now')
  const formatOf = (id: string) =>
    source!.tasks.find((t) => t._id === id)!.format
  expect(formatOf('wide')).toBe('landscape')
  expect(formatOf('old')).toBe('square')
  // A publishing Task's Format is its Channel's, never read from the Task.
  expect(formatOf('post')).toBeNull()
})

it('reads a Campaign from before 053 as having no Recipes, not as broken', async () => {
  delete h.dataset.find((d) => d._id === 'camp-old')!.recipes
  const source = await getCopySource('plan-old', 'org', 'conf-now')
  expect(source!.campaigns[0].recipes).toEqual([])
})
