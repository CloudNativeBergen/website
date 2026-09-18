/**
 * @vitest-environment node
 *
 * The persistence layer: the read EXECUTED with groq-js against a fixture
 * dataset (so tenancy and plan membership are proven on the query text), and
 * the seed commit captured mutation by mutation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => {
  const state = { commitError: null as Error | null }
  const created: Record<string, unknown>[] = []
  const tx = {
    create: (doc: Record<string, unknown>) => {
      created.push(doc)
      return tx
    },
    commit: async () => {
      if (state.commitError) throw state.commitError
      return {}
    },
  }
  return { dataset: [] as Record<string, unknown>[], created, state, tx }
})

async function run(query: string, params: Record<string, unknown> = {}) {
  const value = await evaluate(parse(query), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: () => h.tx },
  clientReadUncached: { fetch: run },
}))

import { commitSeedPlan, getPlanView } from './sanity'
import { expandTemplate } from './seed'
import { BUILTIN_TEMPLATE } from './template'

const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const r = (id: string) => ({ _type: 'reference', _ref: id })

beforeEach(() => {
  h.dataset.length = 0
  h.created.length = 0
  h.state.commitError = null
})

describe('getPlanView', () => {
  beforeEach(() => {
    h.dataset.push(
      { _id: 'sp-1', _type: 'speaker', name: 'Ada' },
      // A Content Release copy of the plan, a campaign and a task: never live.
      // Listed FIRST so `[0]` would pick the copy if the exclusion were missing.
      {
        _id: 'versions.rel1.marketingPlan.conf-A',
        _type: 'marketingPlan',
        conference: r(CONF_A),
        owner: r('sp-1'),
        templateVersion: 'release',
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        _id: 'versions.rel1.camp-A2',
        _type: 'marketingCampaign',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        key: 'cfp-release',
        startDate: '2027-01-10',
        endDate: '2027-03-02',
      },
      {
        _id: 'versions.rel1.task-check',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A1'),
        key: 'linkedinEvent-release',
        kind: 'eventPageUpdate',
        status: 'open',
      },
      {
        _id: 'marketingPlan.conf-A',
        _type: 'marketingPlan',
        conference: r(CONF_A),
        owner: r('sp-1'),
        templateVersion: '2026.1',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      // Another tenant's plan, campaign and task.
      {
        _id: 'marketingPlan.conf-B',
        _type: 'marketingPlan',
        conference: r(CONF_B),
        templateVersion: '2026.1',
      },
      {
        _id: 'camp-B',
        _type: 'marketingCampaign',
        conference: r(CONF_B),
        plan: r('marketingPlan.conf-B'),
        key: 'cfp',
        startDate: '2027-01-01',
        endDate: '2027-02-01',
      },
      // A campaign that claims our plan but belongs to another conference.
      {
        _id: 'camp-cross',
        _type: 'marketingCampaign',
        conference: r(CONF_B),
        plan: r('marketingPlan.conf-A'),
        key: 'cross',
        startDate: '2027-01-01',
        endDate: '2027-02-01',
      },
      {
        _id: 'camp-A1',
        _type: 'marketingCampaign',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        key: 'earlyBird',
        title: 'Early bird',
        startDate: '2027-03-18',
        endDate: '2027-04-20',
        provisional: true,
        startMilestone: 'TICKETS_OPEN',
        endMilestone: 'EARLY_BIRD_END',
        primaryOutcome: 'ticketsSoldInWindow',
        target: 60,
        optional: false,
      },
      {
        _id: 'camp-A2',
        _type: 'marketingCampaign',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        key: 'cfp',
        title: 'CFP',
        startDate: '2027-01-10',
        endDate: '2027-03-02',
        provisional: false,
        startMilestone: 'CFP_OPEN',
        endMilestone: 'CFP_CLOSE',
        primaryOutcome: 'cfpSubmissions',
        optional: false,
      },
      {
        _id: 'task-render',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A2'),
        key: 'cfpOpenRender',
        title: 'Render',
        kind: 'studioRender',
        dueAt: '2027-01-08T08:00:00.000Z',
        status: 'open',
        milestone: 'CFP_OPEN',
        assignee: r('sp-1'),
        prerequisites: [],
      },
      {
        _id: 'task-li',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A2'),
        key: 'cfpOpen:linkedin',
        title: 'CFP open',
        kind: 'publishing',
        channel: 'linkedin',
        milestone: 'CFP_OPEN',
        provisional: false,
        assignee: r('sp-1'),
        prerequisites: [{ _key: 'k1', ...r('task-render') }],
        variant: r('variant-li'),
      },
      {
        _id: 'variant-li',
        _type: 'socialPostVariant',
        conference: r(CONF_A),
        status: 'published',
        scheduledAt: '2027-01-10T07:00:00.000Z',
        publishResult: { url: 'https://www.linkedin.com/posts/x' },
      },
      // A publishing task whose variant belongs to another conference.
      {
        _id: 'task-foreign-variant',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A2'),
        key: 'cfpOpen:bluesky',
        kind: 'publishing',
        channel: 'bluesky',
        variant: r('variant-B'),
        prerequisites: [],
      },
      {
        _id: 'variant-B',
        _type: 'socialPostVariant',
        conference: r(CONF_B),
        status: 'published',
        scheduledAt: '2027-01-10T17:00:00.000Z',
        publishResult: { url: 'https://bsky.app/x' },
      },
      // Done checklist, and a task of another plan in our conference.
      {
        _id: 'task-check',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A1'),
        key: 'linkedinEvent',
        kind: 'eventPageUpdate',
        dueAt: '2027-03-18T08:00:00.000Z',
        status: 'done',
        prerequisites: [],
      },
      // A task that claims our plan but belongs to another conference.
      {
        _id: 'task-cross',
        _type: 'marketingTask',
        conference: r(CONF_B),
        plan: r('marketingPlan.conf-A'),
        campaign: r('camp-A2'),
        key: 'crossTask',
        kind: 'checklist',
        status: 'open',
      },
      {
        _id: 'task-other-plan',
        _type: 'marketingTask',
        conference: r(CONF_A),
        plan: r('marketingPlan.conf-B'),
        campaign: r('camp-B'),
        key: 'stray',
        kind: 'checklist',
        status: 'open',
      },
    )
  })

  it('returns only the campaigns and tasks of this conference and plan, campaigns by start', async () => {
    const view = await getPlanView(CONF_A)
    expect(view?.plan).toEqual({
      _id: 'marketingPlan.conf-A',
      ownerId: 'sp-1',
      ownerName: 'Ada',
      templateVersion: '2026.1',
      copiedFromTitle: null,
      createdAt: '2026-09-01T00:00:00.000Z',
    })
    expect(view?.campaigns.map((c) => c.key)).toEqual(['cfp', 'earlyBird'])
    expect(view?.tasks.map((t) => t.key).sort()).toEqual(
      [
        'cfpOpen:bluesky',
        'cfpOpen:linkedin',
        'cfpOpenRender',
        'linkedinEvent',
      ].sort(),
    )
  })

  it('returns null when the conference has no plan', async () => {
    expect(await getPlanView('conf-none')).toBeNull()
  })

  it('reads a publishing task from its variant and applies the completion rules', async () => {
    const view = await getPlanView(CONF_A)
    const by = (key: string) => view!.tasks.find((t) => t.key === key)!
    expect(by('cfpOpen:linkedin')).toMatchObject({
      date: '2027-01-10T07:00:00.000Z',
      status: 'published',
      complete: true,
      prerequisiteIds: ['task-render'],
      variantId: 'variant-li',
      assigneeId: 'sp-1',
      campaignId: 'camp-A2',
    })
    expect(by('cfpOpenRender')).toMatchObject({
      date: '2027-01-08T08:00:00.000Z',
      status: 'open',
      complete: false,
    })
    expect(by('linkedinEvent')).toMatchObject({
      status: 'done',
      complete: true,
    })
  })

  it('completes a studio render once its asset is saved even while handoff is pending (spec §2.3)', async () => {
    const render = h.dataset.find((doc) => doc._id === 'task-render')!
    render.asset = { _type: 'image', asset: r('image-render-1200x630-png') }
    render.handoffPending = true
    const view = await getPlanView(CONF_A)
    expect(
      view!.tasks.find((task) => task._id === 'task-render'),
    ).toMatchObject({
      complete: true,
      handoffPending: true,
    })
  })

  it('never follows a variant of another conference', async () => {
    const view = await getPlanView(CONF_A)
    const foreign = view!.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
    expect(foreign).toMatchObject({
      date: null,
      status: 'draft',
      complete: false,
    })
  })

  it('does not count a published variant without a URL as complete', async () => {
    const v = h.dataset.find((d) => d._id === 'variant-li')!
    v.publishResult = {}
    const view = await getPlanView(CONF_A)
    expect(
      view!.tasks.find((t) => t.key === 'cfpOpen:linkedin')!.complete,
    ).toBe(false)
  })

  it('projects the campaign fields the timeline draws', async () => {
    const view = await getPlanView(CONF_A)
    expect(view!.campaigns[1]).toEqual({
      _id: 'camp-A1',
      key: 'earlyBird',
      title: 'Early bird',
      startDate: '2027-03-18',
      endDate: '2027-04-20',
      provisional: true,
      startMilestone: 'TICKETS_OPEN',
      endMilestone: 'EARLY_BIRD_END',
      primaryOutcome: 'ticketsSoldInWindow',
      target: 60,
      optional: false,
    })
  })
})

describe('commitSeedPlan', () => {
  const seed = () => {
    let n = 0
    return expandTemplate({
      template: BUILTIN_TEMPLATE,
      conference: {
        _id: CONF_A,
        title: 'Cloud Native Bergen 2027',
        city: 'Bergen',
        baseUrl: 'https://cloudnativebergen.dev',
        cfpStartDate: '2027-01-10',
        cfpEndDate: '2027-03-01',
        cfpNotifyDate: '2027-04-01',
        programDate: '2027-04-20',
        startDate: '2027-06-10',
        endDate: '2027-06-11',
      },
      includeOptional: ['sponsorAcquisition'],
      ownerId: 'sp-owner',
      now: '2026-09-14T10:00:00.000Z',
      newId: (type) => `${type}.${++n}`,
    })
  }

  it('creates every record in one transaction with the conference on each', async () => {
    const plan = seed()
    const result = await commitSeedPlan(plan)
    expect(result).toEqual({ committed: true })
    const expected =
      1 +
      plan.campaigns.length +
      plan.tasks.length +
      plan.posts.length +
      plan.variants.length
    expect(h.created).toHaveLength(expected)
    for (const doc of h.created) {
      expect(doc.conference, String(doc._id)).toEqual(r(CONF_A))
    }
    expect(h.created[0]).toMatchObject({
      _id: 'marketingPlan.conf-A',
      _type: 'marketingPlan',
      owner: { _ref: 'sp-owner', _weak: true },
      templateVersion: '2026.1',
    })
  })

  it('serializes references, keyed arrays and per-Kind fields', async () => {
    const plan = seed()
    await commitSeedPlan(plan)
    const li = plan.tasks.find((t) => t.key === 'cfpOpen:linkedin')!
    const doc = h.created.find((d) => d._id === li._id) as Record<
      string,
      unknown
    >
    expect(doc).toMatchObject({
      _type: 'marketingTask',
      campaign: r(li.campaignId),
      plan: r('marketingPlan.conf-A'),
      kind: 'publishing',
      channel: 'linkedin',
      milestone: 'CFP_OPEN',
      offsetDays: 0,
      plannedAt: '2027-01-10T07:00:00.000Z',
      provisional: false,
      assignee: { _ref: 'sp-owner', _weak: true },
      variant: { _ref: li.variantId, _weak: true },
      targetPage: '/cfp',
      alt: 'Call for papers open: Cloud Native Bergen 2027, torsdag 10. juni 2027, Bergen.',
      origin: 'template',
    })
    expect(doc.dueAt).toBeUndefined()
    expect(doc.status).toBeUndefined()
    const prerequisites = doc.prerequisites as { _key: string; _ref: string }[]
    expect(prerequisites).toHaveLength(1)
    expect(prerequisites[0]._key).toBeTruthy()
    expect(prerequisites[0]._ref).toBe(li.prerequisiteIds[0])

    const campaign = h.created.find(
      (d) =>
        d._id ===
        plan.campaigns.find((c) => c.key === 'sponsorAcquisition')!._id,
    ) as Record<string, unknown>
    const triggers = campaign.triggers as { _key: string; event: string }[]
    expect(triggers).toHaveLength(1)
    expect(triggers[0]._key).toBeTruthy()
    expect(triggers[0].event).toBe('sponsorSigned')

    const variant = h.created.find((d) => d._id === li.variantId)!
    expect(variant).toMatchObject({
      _type: 'socialPostVariant',
      post: r(li.postId!),
      platform: 'linkedin',
      status: 'draft',
      usesCustomTime: false,
      attempts: [],
      attemptCount: 0,
    })
    expect(variant.link).toContain('utm_content=cfpOpen%3Alinkedin')
    const post = h.created.find((d) => d._id === li.postId)!
    expect(post).toMatchObject({
      _type: 'socialPost',
      createdBy: { _ref: 'sp-owner', _weak: true },
    })
  })

  it('reports an existing plan instead of throwing', async () => {
    h.state.commitError = Object.assign(
      new Error('Document "marketingPlan.conf-A" already exists'),
      { statusCode: 409 },
    )
    expect(await commitSeedPlan(seed())).toEqual({
      committed: false,
      reason: 'exists',
    })
  })

  it('rethrows a 409 that is not about the plan document', async () => {
    h.state.commitError = Object.assign(
      new Error('Document "socialPost.7" already exists'),
      { statusCode: 409 },
    )
    await expect(commitSeedPlan(seed())).rejects.toThrow(/socialPost\.7/)
  })

  it('rethrows any other commit failure', async () => {
    h.state.commitError = new Error('network')
    await expect(commitSeedPlan(seed())).rejects.toThrow('network')
  })
})
