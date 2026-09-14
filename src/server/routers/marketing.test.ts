/**
 * @vitest-environment node
 *
 * The Marketing Plan's organizer surface through the tRPC caller: seeding
 * shape, optional Campaigns, provisional dates, sibling Tasks, Prerequisites,
 * variant creation, and tenancy. Expansion runs for REAL (it is pure); only
 * persistence (`@/lib/marketing/sanity`) and the domain conference are
 * mocked, so what is asserted is the seed the router would commit.
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
  commitSeedPlan: vi.fn(),
  getPlanView: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))
vi.mock('@/lib/marketing/sanity', () => ({
  commitSeedPlan: h.commitSeedPlan,
  getPlanView: h.getPlanView,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { SeedPlan } from '@/lib/marketing/seed'
import { placeholdersIn } from '@/lib/marketing/placeholders'
import { marketingRouter } from './marketing'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const ADMIN_ID = 'sp-admin'

function ctx(orgId: string = ORG_A): Context {
  const speaker = { _id: ADMIN_ID, name: 'Admin', organizerOrgIds: [orgId] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const marketing = (orgId?: string) =>
  t.createCallerFactory(marketingRouter)(ctx(orgId))

/** The domain conference: every required date, no optional Milestone. */
const CONFERENCE = {
  _id: CONF_A,
  organization: { _ref: ORG_A },
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  ticketCapacity: 400,
  domains: ['cloudnativebergen.dev'],
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

const SEED_INPUT = { templateVersion: '2026.1' as const, includeOptional: [] }

function committedSeed(): SeedPlan {
  expect(h.commitSeedPlan).toHaveBeenCalledTimes(1)
  return h.commitSeedPlan.mock.calls[0][0] as SeedPlan
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: CONFERENCE,
    domain: 'cloudnativebergen.dev',
    error: null,
  })
  h.getPlanView.mockResolvedValue(null)
  h.commitSeedPlan.mockResolvedValue({ committed: true })
})

describe('marketing.plan.seed — shape', () => {
  it('seeds the REQUEST conference, owned by the caller, and reports the counts', async () => {
    const result = await marketing().plan.seed(SEED_INPUT)
    const seed = committedSeed()
    expect(seed.plan).toMatchObject({
      _id: `marketingPlan.${CONF_A}`,
      conferenceId: CONF_A,
      ownerId: ADMIN_ID,
      templateVersion: '2026.1',
    })
    for (const record of [
      ...seed.campaigns,
      ...seed.tasks,
      ...seed.posts,
      ...seed.variants,
    ]) {
      expect(record.conferenceId).toBe(CONF_A)
    }
    expect(result).toEqual({
      planId: `marketingPlan.${CONF_A}`,
      campaigns: seed.campaigns.length,
      tasks: seed.tasks.length,
    })
    expect(result.campaigns).toBe(8)
    expect(result.tasks).toBeGreaterThan(30)
  })

  it('includes only the optional Campaigns asked for (8 / 9 / 10)', async () => {
    await marketing().plan.seed({
      templateVersion: '2026.1',
      includeOptional: ['keynotes'],
    })
    const nine = committedSeed()
    expect(nine.campaigns.map((c) => c.key)).toContain('keynotes')
    expect(nine.campaigns.map((c) => c.key)).not.toContain('sponsorAcquisition')
    expect(nine.campaigns).toHaveLength(9)

    h.commitSeedPlan.mockClear()
    await marketing().plan.seed({
      templateVersion: '2026.1',
      includeOptional: ['sponsorAcquisition', 'keynotes'],
    })
    expect(committedSeed().campaigns).toHaveLength(10)
  })

  it('flags Tasks and windows on an unset Milestone provisional, others not', async () => {
    await marketing().plan.seed(SEED_INPUT)
    const seed = committedSeed()
    const earlyBird = seed.campaigns.find((c) => c.key === 'earlyBird')!
    expect(earlyBird.provisional).toBe(true)
    // TICKETS_OPEN fell back to CONFERENCE_START − 12 wk.
    expect(earlyBird.startDate).toBe('2027-03-18')
    const ticketsOpen = seed.tasks.find((t) => t.key === 'ticketsOpen:bluesky')!
    expect(ticketsOpen.provisional).toBe(true)
    const cfpOpen = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
    expect(cfpOpen.provisional).toBe(false)
    expect(seed.campaigns.find((c) => c.key === 'cfp')!.provisional).toBe(false)
  })

  it('uses the real date when the Milestone is set', async () => {
    h.getConference.mockResolvedValue({
      conference: {
        ...CONFERENCE,
        ticketTargets: { enabled: true, salesStartDate: '2027-02-01' },
        earlyBirdEndDate: '2027-03-15',
      },
      domain: 'x',
      error: null,
    })
    await marketing().plan.seed(SEED_INPUT)
    const earlyBird = committedSeed().campaigns.find(
      (c) => c.key === 'earlyBird',
    )!
    expect(earlyBird).toMatchObject({
      startDate: '2027-02-01',
      endDate: '2027-03-15',
      provisional: false,
    })
  })

  it('creates sibling Tasks per Channel, each with its own variant', async () => {
    await marketing().plan.seed(SEED_INPUT)
    const seed = committedSeed()
    const li = seed.tasks.find((t) => t.key === 'cfpOpen:linkedin')!
    const bs = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
    expect(li.campaignId).toBe(bs.campaignId)
    expect([li.channel, bs.channel]).toEqual(['linkedin', 'bluesky'])
    expect(li.variantId).not.toBe(bs.variantId)
    const liV = seed.variants.find((v) => v._id === li.variantId)!
    const bsV = seed.variants.find((v) => v._id === bs.variantId)!
    expect(liV.platform).toBe('linkedin')
    expect(bsV.platform).toBe('bluesky')
    expect(liV.body).not.toBe(bsV.body)
  })

  it('resolves Prerequisites to Task ids within the Campaign', async () => {
    await marketing().plan.seed(SEED_INPUT)
    const seed = committedSeed()
    const li = seed.tasks.find((t) => t.key === 'cfpOpen:linkedin')!
    expect(li.prerequisiteIds).toHaveLength(1)
    const render = seed.tasks.find((t) => t._id === li.prerequisiteIds[0])!
    expect(render).toMatchObject({
      key: 'cfpOpenRender',
      kind: 'studioRender',
      campaignId: li.campaignId,
      status: 'open',
    })
  })

  it('creates a post plus a draft variant for every publishing Task with placeholders resolved', async () => {
    await marketing().plan.seed(SEED_INPUT)
    const seed = committedSeed()
    const publishing = seed.tasks.filter((t) => t.kind === 'publishing')
    expect(publishing.length).toBeGreaterThan(20)
    expect(seed.posts).toHaveLength(publishing.length)
    expect(seed.variants).toHaveLength(publishing.length)
    for (const task of publishing) {
      const variant = seed.variants.find((v) => v._id === task.variantId)!
      expect(variant.postId).toBe(task.postId)
      expect(variant.status).toBe('draft')
      expect(placeholdersIn(variant.body)).toEqual([])
      expect(variant.link).toMatch(
        /^https:\/\/cloudnativebergen\.dev\/.*utm_source=(linkedin|bluesky)&utm_medium=social&utm_campaign=[a-zA-Z]+&utm_content=/,
      )
      expect(variant.body).toContain(variant.link)
    }
    // Every Task is assigned to the plan owner.
    for (const task of seed.tasks) expect(task.assigneeId).toBe(ADMIN_ID)
  })
})

describe('marketing.plan.seed — refusals', () => {
  it('refuses when the edition already has a plan, before writing', async () => {
    h.getPlanView.mockResolvedValue({ plan: { _id: 'x' } })
    await expect(marketing().plan.seed(SEED_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })

  it('maps a lost create race to CONFLICT', async () => {
    h.commitSeedPlan.mockResolvedValue({ committed: false, reason: 'exists' })
    await expect(marketing().plan.seed(SEED_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rejects an unknown Template version or optional key at the schema', async () => {
    await expect(
      marketing().plan.seed({
        templateVersion: '1999.1' as never,
        includeOptional: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      marketing().plan.seed({
        templateVersion: '2026.1',
        includeOptional: ['cfp'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      marketing().plan.seed({
        templateVersion: '2026.1',
        includeOptional: ['keynotes', 'keynotes'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })

  it('reports a missing required conference date as a precondition', async () => {
    h.getConference.mockResolvedValue({
      conference: { ...CONFERENCE, cfpNotifyDate: undefined },
      domain: 'x',
      error: null,
    })
    await expect(marketing().plan.seed(SEED_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('cfpNotifyDate'),
    })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })

  it('denies a non-organizer of this org', async () => {
    await expect(
      marketing('org-Z').plan.seed(SEED_INPUT),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
    expect(h.getPlanView).not.toHaveBeenCalled()
  })

  it('fails closed when the domain resolves no conference', async () => {
    h.getConference.mockResolvedValue({
      conference: null,
      domain: 'x',
      error: new Error('nope'),
    })
    // The authz waist denies before the router runs: no tenant, no access.
    await expect(marketing().plan.seed(SEED_INPUT)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })
})

describe('marketing.plan.get', () => {
  it('reads the REQUEST conference and returns null before seeding', async () => {
    expect(await marketing().plan.get()).toBeNull()
    expect(h.getPlanView).toHaveBeenCalledWith(CONF_A)
  })

  it('adds the resolved Milestones and today to the stored plan', async () => {
    h.getPlanView.mockResolvedValue({
      plan: { _id: 'p' },
      campaigns: [],
      tasks: [],
    })
    const view = await marketing().plan.get()
    expect(view?.milestones.CFP_OPEN).toEqual({
      date: '2027-01-10',
      provisional: false,
    })
    expect(view?.milestones.EARLY_BIRD_END).toEqual({
      date: '2027-04-20',
      provisional: true,
    })
    expect(view?.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reports a plan whose conference lost a required date as a precondition', async () => {
    h.getPlanView.mockResolvedValue({
      plan: { _id: 'p' },
      campaigns: [],
      tasks: [],
    })
    h.getConference.mockResolvedValue({
      conference: { ...CONFERENCE, startDate: '' },
      domain: 'x',
      error: null,
    })
    await expect(marketing().plan.get()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('denies a non-organizer of this org', async () => {
    await expect(marketing('org-Z').plan.get()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.getPlanView).not.toHaveBeenCalled()
  })
})
