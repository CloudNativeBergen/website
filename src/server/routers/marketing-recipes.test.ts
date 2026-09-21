/**
 * @vitest-environment node
 *
 * The Recipe Library and built-in Campaigns on demand through the tRPC caller
 * (#1122). The tenancy guard runs for REAL against a stubbed
 * `clientReadUncached.fetch`; the Library's Sanity module is mocked at its
 * boundary, and its transactions are proven in `library/sanity.test.ts`.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  tenantRead: vi.fn(),
  readRecipes: vi.fn(),
  saveRecipes: vi.fn(),
  readPlan: vi.fn(),
  commitBuiltin: vi.fn(),
  published: vi.fn(),
  ceilings: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: h.tenantRead },
}))
vi.mock('@/lib/marketing/library/sanity', () => ({
  readCampaignRecipes: h.readRecipes,
  saveCampaignRecipes: h.saveRecipes,
  readPlanForBuiltin: h.readPlan,
  commitBuiltinCampaign: h.commitBuiltin,
}))
vi.mock('@/lib/marketing/generation-sanity', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/marketing/generation-sanity')
  >()),
  publishedTaskKeys: h.published,
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  channelCeilingWarnings: vi.fn(async () => []),
  ceilingWarningsFor: h.ceilings,
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { editsOf, libraryEntry } from '@/lib/marketing/library'
import type { RecipeCampaign } from '@/lib/marketing/library/sanity'
import { publishedPair } from '@/lib/marketing/recipes'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import type { SeedPlan } from '@/lib/marketing/seed'
import { marketingRouter } from './marketing'

const t = initTRPC.context<Context>().create()
function marketing() {
  const speaker = { _id: 'sp-admin', name: 'Admin', organizerOrgIds: ['org-A'] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(marketingRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const CONFERENCE = {
  _id: 'conf-A',
  organization: { _ref: 'org-A' },
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  domains: ['cloudnativebergen.dev'],
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}
const speakerCard = libraryEntry('speakerCard')
const countdown = libraryEntry('countdown')

function campaign(overrides: Partial<RecipeCampaign> = {}): RecipeCampaign {
  return {
    _id: 'camp-ours',
    _rev: 'rev-1',
    key: 'custom-1',
    planId: 'plan-A',
    planOwnerId: 'sp-owner',
    recipes: [],
    triggers: [],
    generatedKeys: [],
    ...overrides,
  }
}
const saved = () => h.saveRecipes.mock.calls[0][0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-05-20T10:00:00Z'))
  h.getConference.mockResolvedValue({ conference: CONFERENCE, error: null })
  h.tenantRead.mockImplementation(async (_q: string, p: { id: string }) =>
    p.id === 'camp-nobody'
      ? null
      : {
          _type: 'marketingCampaign',
          conferenceId: p.id === 'camp-theirs' ? 'conf-B' : 'conf-A',
          conferenceOrgId: 'org-A',
          memberOrgIds: [],
        },
  )
  h.readRecipes.mockResolvedValue(campaign())
  h.saveRecipes.mockResolvedValue(true)
  h.published.mockResolvedValue(new Set())
  h.ceilings.mockResolvedValue([])
  h.readPlan.mockResolvedValue({
    planId: 'plan-A',
    planRev: 'plan-rev-1',
    ownerId: 'sp-owner',
    campaignKeys: ['cfp', 'custom-1'],
  })
  h.commitBuiltin.mockResolvedValue(true)
})

describe('campaign.recipes.library', () => {
  it('lists the entries with their defaults and the placeholders each accepts', async () => {
    const library = await marketing().campaign.recipes.library()
    expect(library.map((e) => e.id)).toEqual([
      'speakerCard',
      'sponsorCard',
      'talkTeaser',
      'videoDrip',
      'countdown',
    ])
    expect(library[1]).toMatchObject({
      recurring: false,
      hasImage: true,
      channels: ['linkedin', 'bluesky'],
    })
    expect(library[1].placeholders).toContain('tier')
    expect(library[4].placeholders).toContain('days')
    expect(library[4].defaults.channels.bluesky?.perWeek).toBe(7)
  })
})

describe('campaign.recipes.attach', () => {
  it('puts the built-in Recipes and Trigger on a custom Campaign, creating no Task', async () => {
    await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'speakerCard',
    })
    expect(saved()).toMatchObject({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      planId: 'plan-A',
      conferenceId: 'conf-A',
      recipes: speakerCard.recipes,
      triggers: [
        { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
      ],
      records: { tasks: [], posts: [], variants: [] },
    })
  })
  it('adds its own rows and names nothing else: what the Campaign already had is not rewritten', async () => {
    h.readRecipes.mockResolvedValue(
      campaign({ recipes: countdown.recipes, generatedKeys: ['x'] }),
    )
    await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'speakerCard',
    })
    expect(saved().removeKeys).toEqual([])
    expect(saved().recipes.map((r: { key: string }) => r.key)).toEqual([
      'speakerCardRender',
      'speakerCard:linkedin',
      'speakerCard:bluesky',
    ])
  })
  it('expands the countdown at attach, assigned to the plan owner, its keys in the same write', async () => {
    const result = await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'countdown',
    })
    const { records } = saved()
    // 2027-05-20 10:00Z: the slots from 20 May 18:00 Oslo to 31 May remain.
    expect(records.tasks.map((t: { key: string }) => t.key)).toEqual(
      Array.from({ length: 12 }, (_, i) => `countdown:d${-12 + i}:bluesky`),
    )
    expect(records.tasks[0]).toMatchObject({
      assigneeId: 'sp-owner',
      origin: 'expansion',
      campaignId: 'camp-ours',
    })
    expect(records.variants[0].link).toContain('utm_campaign=custom-1')
    expect(result.created).toBe(12)
    expect(h.ceilings).toHaveBeenCalledWith('conf-A', {
      variantIds: records.variants.map((v: { _id: string }) => v._id),
    })
  })
  it('does not recreate countdown Tasks whose keys are already on the marker', async () => {
    h.readRecipes.mockResolvedValue(
      campaign({
        generatedKeys: ['countdown:d-12:bluesky', 'countdown:d-1:bluesky'],
      }),
    )
    await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'countdown',
    })
    const keys = saved().records.tasks.map((t: { key: string }) => t.key)
    expect(keys).toHaveLength(10)
    expect(keys).not.toContain('countdown:d-12:bluesky')
    expect(keys).toContain('countdown:d-11:bluesky')
  })
  it('one Recipe on two Campaigns: a post published from the OTHER Campaign does not drop this one', async () => {
    h.published.mockResolvedValue(
      new Set([
        publishedPair('finalPush', 'countdown:d-5:bluesky'),
        publishedPair('custom-1', 'countdown:d-4:bluesky'),
      ]),
    )
    await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'countdown',
    })
    const keys = saved().records.tasks.map((t: { key: string }) => t.key)
    expect(keys).toContain('countdown:d-5:bluesky')
    expect(keys).not.toContain('countdown:d-4:bluesky')
    expect(keys).toHaveLength(11)
  })
  it('refuses the same entry twice', async () => {
    h.readRecipes.mockResolvedValue(campaign({ recipes: speakerCard.recipes }))
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'speakerCard',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This Campaign already has the Speaker card Recipe.',
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('refuses an unknown {token} with the strict rule, naming it', async () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'speakerCard',
        edits: {
          ...edits,
          channels: {
            bluesky: { skeleton: 'Hi {recipient} {url}', perWeek: 3 },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Bluesky copy: {recipient} cannot be filled in for this Recipe.',
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('refuses a window that ends before it starts', async () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'speakerCard',
        edits: {
          ...edits,
          window: {
            from: { milestone: 'CONFERENCE_START', offsetDays: 0 },
            to: { milestone: 'CFP_OPEN', offsetDays: 0 },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The window must end on or after its start.',
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('keeps the countdown counting down to the conference: its window cannot move to another Milestone', async () => {
    const edits = editsOf(countdown, countdown.recipes)
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'countdown',
        edits: {
          ...edits,
          window: {
            from: { milestone: 'TICKETS_OPEN', offsetDays: 0 },
            to: { milestone: 'CONFERENCE_START', offsetDays: -1 },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'The countdown counts the days to the conference: set its window in days from Conference.',
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('refuses a built-in Campaign that has no stored Recipes yet, where a countdown would be duplicated', async () => {
    h.readRecipes.mockResolvedValue(campaign({ key: 'finalPush' }))
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'countdown',
      }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('migration 053'),
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('warns about a rate over the ceiling, and still saves', async () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    const result = await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'speakerCard',
      edits: {
        ...edits,
        channels: { linkedin: { skeleton: '{name} {url}', perWeek: 9 } },
      },
    })
    expect(result.ceilingWarnings).toEqual([
      'LinkedIn: 9 posts a week is over the ceiling of 1 a day.',
    ])
    expect(saved().recipes.at(-1).cadence.perWeek).toEqual({ linkedin: 9 })
  })
})

describe('campaign.recipes.update / remove — forward-only', () => {
  const attached = () =>
    campaign({
      recipes: [...countdown.recipes, ...speakerCard.recipes],
      triggers: speakerCard.triggers,
      generatedKeys: ['speakerCard:sp-1:bluesky', 'countdown:d-3:bluesky'],
    })
  it('swaps the entry’s own rows for the edited ones and creates nothing — not even for a countdown', async () => {
    h.readRecipes.mockResolvedValue(attached())
    const edits = editsOf(countdown, countdown.recipes)
    const result = await marketing().campaign.recipes.update({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'countdown',
      edits: { ...edits, title: 'Days to go' },
    })
    expect(saved().records).toEqual({ tasks: [], posts: [], variants: [] })
    expect(saved().removeKeys).toEqual(['countdown:bluesky'])
    expect(
      saved().recipes.map((r: { key: string; title: string }) => [
        r.key,
        r.title,
      ]),
    ).toEqual([['countdown:bluesky', 'Days to go']])
    expect(saved().triggers).toEqual([])
    expect(result).toEqual({ ceilingWarnings: [] })
    expect(h.published).not.toHaveBeenCalled()
  })
  it('keeps the Trigger through an edit, and warns about a rate over the ceiling', async () => {
    h.readRecipes.mockResolvedValue(attached())
    const edits = editsOf(speakerCard, speakerCard.recipes)
    const result = await marketing().campaign.recipes.update({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'speakerCard',
      edits: {
        ...edits,
        channels: { linkedin: { skeleton: '{name} {url}', perWeek: 9 } },
      },
    })
    expect(saved().removeKeys).toEqual([
      'speakerCardRender',
      'speakerCard:linkedin',
      'speakerCard:bluesky',
    ])
    expect(saved().recipes.map((r: { key: string }) => r.key)).toEqual([
      'speakerCardRender',
      'speakerCard:linkedin',
    ])
    expect(saved().triggers).toEqual(speakerCard.triggers)
    expect(result.ceilingWarnings).toEqual([
      'LinkedIn: 9 posts a week is over the ceiling of 1 a day.',
    ])
  })
  it('refuses to update an entry the Campaign does not have', async () => {
    await expect(
      marketing().campaign.recipes.update({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'videoDrip',
        edits: editsOf(
          libraryEntry('videoDrip'),
          libraryEntry('videoDrip').recipes,
        ),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This Campaign has no Talk video Recipe.',
    })
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
  it('removes the entry’s rows by key — the writer takes the Triggers naming them — and nothing else', async () => {
    h.readRecipes.mockResolvedValue(attached())
    await marketing().campaign.recipes.remove({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'speakerCard',
    })
    expect(saved()).toMatchObject({
      removeKeys: [
        'speakerCardRender',
        'speakerCard:linkedin',
        'speakerCard:bluesky',
      ],
      recipes: [],
      triggers: [],
      records: { tasks: [], posts: [], variants: [] },
    })
  })
  it('removing the countdown and attaching it again recreates nothing: the marker was left alone', async () => {
    await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-1',
      entry: 'countdown',
    })
    const first = saved()
    const marker = first.records.tasks.map((t: { key: string }) => t.key)
    expect(marker).toHaveLength(12)
    // What Sanity now holds: the Recipe, and the marker the attach appended.
    h.readRecipes.mockResolvedValue(
      campaign({
        _rev: 'rev-2',
        recipes: first.recipes,
        generatedKeys: marker,
      }),
    )
    await marketing().campaign.recipes.remove({
      campaignId: 'camp-ours',
      rev: 'rev-2',
      entry: 'countdown',
    })
    // Remove never names the marker, so it is still what the next read returns.
    h.readRecipes.mockResolvedValue(
      campaign({ _rev: 'rev-3', generatedKeys: marker }),
    )
    h.saveRecipes.mockClear()
    const again = await marketing().campaign.recipes.attach({
      campaignId: 'camp-ours',
      rev: 'rev-3',
      entry: 'countdown',
    })
    expect(again.created).toBe(0)
    expect(saved().records).toEqual({ tasks: [], posts: [], variants: [] })
    expect(saved().recipes).toEqual(countdown.recipes)
  })
})

describe('revision and tenancy guards', () => {
  const calls = {
    attach: () =>
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'stale',
        entry: 'speakerCard',
      }),
    update: () =>
      marketing().campaign.recipes.update({
        campaignId: 'camp-ours',
        rev: 'stale',
        entry: 'speakerCard',
        edits: editsOf(speakerCard, speakerCard.recipes),
      }),
    remove: () =>
      marketing().campaign.recipes.remove({
        campaignId: 'camp-ours',
        rev: 'stale',
        entry: 'speakerCard',
      }),
  }
  it.each(Object.entries(calls))(
    '%s refuses a revision the Campaign has moved past',
    async (_name, call) => {
      h.readRecipes.mockResolvedValue(
        campaign({ recipes: speakerCard.recipes.slice(0, 0) }),
      )
      await expect(call()).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(h.saveRecipes).not.toHaveBeenCalled()
    },
  )
  it('reports a lost compare-and-set as a conflict', async () => {
    h.saveRecipes.mockResolvedValue(false)
    await expect(
      marketing().campaign.recipes.attach({
        campaignId: 'camp-ours',
        rev: 'rev-1',
        entry: 'speakerCard',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it.each([
    [
      'attach',
      () =>
        marketing().campaign.recipes.attach({
          campaignId: 'camp-theirs',
          rev: 'rev-1',
          entry: 'speakerCard',
        }),
    ],
    [
      'update',
      () =>
        marketing().campaign.recipes.update({
          campaignId: 'camp-theirs',
          rev: 'rev-1',
          entry: 'speakerCard',
          edits: editsOf(speakerCard, speakerCard.recipes),
        }),
    ],
    [
      'remove',
      () =>
        marketing().campaign.recipes.remove({
          campaignId: 'camp-theirs',
          rev: 'rev-1',
          entry: 'speakerCard',
        }),
    ],
  ])('%s refuses a foreign Campaign before reading it', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No marketingCampaign with that id for this request',
    })
    expect(h.readRecipes).not.toHaveBeenCalled()
    expect(h.saveRecipes).not.toHaveBeenCalled()
  })
})

describe('campaign.addBuiltin', () => {
  const seed = (): SeedPlan => h.commitBuiltin.mock.calls[0][0]
  it('adds a built-in Campaign fully formed, through the seeding expansion, onto the plan that was READ', async () => {
    // `plan-A` is not `marketingPlan.<conference>`: a restored or Studio-made
    // plan. Everything must hang off the id the revision was read from.
    const result = await marketing().campaign.addBuiltin({ key: 'keynotes' })
    expect(seed().plan._id).toBe('plan-A')
    expect(seed().campaigns.map((c) => [c.key, c.planId, c.optional])).toEqual([
      ['keynotes', 'plan-A', true],
    ])
    const builtin = BUILTIN_TEMPLATE.campaigns.find(
      (c) => c.key === 'keynotes',
    )!
    expect(seed().campaigns[0].recipes).toEqual(builtin.recipes)
    expect(seed().tasks.map((t) => t.key)).toEqual(
      builtin.recipes.filter((r) => r.anchor && !r.cadence).map((r) => r.key),
    )
    expect(seed().tasks.every((t) => t.planId === 'plan-A')).toBe(true)
    expect(seed().tasks.every((t) => t.assigneeId === 'sp-owner')).toBe(true)
    expect(h.commitBuiltin.mock.calls[0][1]).toBe('plan-rev-1')
    expect(result).toEqual({
      campaignId: seed().campaigns[0]._id,
      tasks: seed().tasks.length,
    })
  })
  it('honours the published-Task filter when a deleted Campaign is re-added', async () => {
    h.readPlan.mockResolvedValue({
      planId: 'plan-A',
      planRev: 'plan-rev-1',
      ownerId: 'sp-owner',
      campaignKeys: [],
    })
    await marketing().campaign.addBuiltin({ key: 'cfp' })
    const all = seed().tasks.map((t) => t.key)
    expect(all).toContain('cfpOpen:linkedin')
    h.commitBuiltin.mockClear()
    h.published.mockResolvedValue(
      new Set([publishedPair('cfp', 'cfpOpen:linkedin')]),
    )
    await marketing().campaign.addBuiltin({ key: 'cfp' })
    expect(seed().tasks.map((t) => t.key)).toEqual(
      all.filter((key) => key !== 'cfpOpen:linkedin'),
    )
  })
  it('refuses a built-in Campaign the plan already has, before expanding anything', async () => {
    await expect(
      marketing().campaign.addBuiltin({ key: 'cfp' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This plan already has the CFP Campaign.',
    })
    expect(h.published).not.toHaveBeenCalled()
    expect(h.commitBuiltin).not.toHaveBeenCalled()
  })
  it('refuses a key that is not a built-in Campaign', async () => {
    await expect(
      marketing().campaign.addBuiltin({ key: 'custom-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.commitBuiltin).not.toHaveBeenCalled()
  })
  it('reports a concurrent add as a conflict', async () => {
    h.commitBuiltin.mockResolvedValue(false)
    await expect(
      marketing().campaign.addBuiltin({ key: 'keynotes' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('needs a plan', async () => {
    h.readPlan.mockResolvedValue(null)
    await expect(
      marketing().campaign.addBuiltin({ key: 'keynotes' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This edition has no Marketing Plan',
    })
  })
})
