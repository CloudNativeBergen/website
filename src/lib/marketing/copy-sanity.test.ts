/**
 * @vitest-environment node
 *
 * The copy source read EXECUTED with groq-js: a Campaign's stored Recipes
 * come back as the Recipes that were written (Templates spec §2.1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'
import { evaluate, parse } from 'groq-js'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
}))

import { getCopySource, getCopySources } from './copy-sanity'
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

describe('D1 gateway values and fallbacks (#1997)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses merged D1 title and startDate for getCopySources when flagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-old')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-old',
              title: 'D1 Last Year',
              startDate: '2025-06-01',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const sources = await getCopySources('org', 'conf-now')
    expect(sources).toHaveLength(1)
    expect(sources[0].conferenceTitle).toBe('D1 Last Year')
    expect(sources[0].startDate).toBe('2025-06-01')
  })

  it('falls back to Sanity for getCopySources when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'other-conf')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const sources = await getCopySources('org', 'conf-now')
    expect(sources).toHaveLength(1)
    expect(sources[0].conferenceTitle).toBe('Last year')
    expect(sources[0].startDate).toBe('2025-05-01')
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it('falls back to Sanity for getCopySources on gateway error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-old')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 down' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const sources = await getCopySources('org', 'conf-now')
    expect(sources).toHaveLength(1)
    expect(sources[0].conferenceTitle).toBe('Last year')
    expect(sources[0].startDate).toBe('2025-05-01')
  })

  it('sorts getCopySources by merged D1 startDate descending when flagged and differing D1 dates change order', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-older')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'

    h.dataset.push(
      {
        _id: 'conf-older',
        _type: 'conference',
        organization: r('org'),
        title: 'Older conf',
        startDate: '2025-04-01',
        domains: ['older.example.com'],
      },
      {
        _id: 'plan-older',
        _type: 'marketingPlan',
        conference: r('conf-older'),
      },
    )

    // D1 moves conf-older ahead of conf-old (2025-06-01 > 2025-05-01)
    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-older',
              title: 'D1 Older Conf',
              startDate: '2025-06-01',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const sources = await getCopySources('org', 'conf-now')
    expect(sources).toHaveLength(2)
    expect(sources[0].planId).toBe('plan-older')
    expect(sources[0].startDate).toBe('2025-06-01')
    expect(sources[1].planId).toBe('plan-old')
    expect(sources[1].startDate).toBe('2025-05-01')
  })

  it('uses merged D1 fields for getCopySource when flagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-old')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'
    confOld.endDate = '2025-05-02'
    confOld.city = 'Sanity City'
    confOld.venueName = 'Sanity Venue'

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            conference: {
              id: 'conf-old',
              title: 'D1 Last Year',
              city: 'D1 City',
              venueName: 'D1 Venue',
              startDate: '2025-06-01',
              endDate: '2025-06-03',
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const source = await getCopySource('plan-old', 'org', 'conf-now')
    expect(source).not.toBeNull()
    expect(source!.conference.title).toBe('D1 Last Year')
    expect(source!.conference.city).toBe('D1 City')
    expect(source!.conference.venueName).toBe('D1 Venue')
    expect(source!.conference.startDate).toBe('2025-06-01')
    expect(source!.conference.endDate).toBe('2025-06-03')
  })

  it('falls back to Sanity for getCopySource when unflagged', async () => {
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'other-conf')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'
    confOld.endDate = '2025-05-02'
    confOld.city = 'Sanity City'

    const gatewayFetch = vi.fn()
    vi.stubGlobal('fetch', gatewayFetch)

    const source = await getCopySource('plan-old', 'org', 'conf-now')
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(source!.conference.title).toBe('Last year')
    expect(source!.conference.city).toBe('Sanity City')
    expect(source!.conference.startDate).toBe('2025-05-01')
  })

  it('falls back to Sanity for getCopySource on gateway error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('KONF_API_URL', 'https://api.example.com')
    flagTenants('apiRead', 'conf-old')

    const confOld = h.dataset.find((d) => d._id === 'conf-old')!
    confOld.domains = ['old.example.com']
    confOld.startDate = '2025-05-01'
    confOld.endDate = '2025-05-02'
    confOld.city = 'Sanity City'

    const gatewayFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'D1 down' }] }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', gatewayFetch)

    const source = await getCopySource('plan-old', 'org', 'conf-now')
    expect(source!.conference.title).toBe('Last year')
    expect(source!.conference.city).toBe('Sanity City')
    expect(source!.conference.startDate).toBe('2025-05-01')
  })
})
