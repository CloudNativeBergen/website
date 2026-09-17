/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@/server/trpc'

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
const h = vi.hoisted(() => ({
  conference: vi.fn(),
  fetch: vi.fn(),
  commit: vi.fn(),
  getPlan: vi.fn(),
  apply: vi.fn(),
  warnings: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: vi.fn(async () => ({ _id: 'org-A' })),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: {
    fetch: h.fetch,
    patch: (id: string) => {
      let fields: Record<string, unknown> = {}
      const patch = {
        set: (value: Record<string, unknown>) => {
          fields = value
          return patch
        },
        commit: () => h.commit(id, fields),
      }
      return patch
    },
  },
}))
vi.mock('@/lib/marketing/redate-sanity', () => ({
  getRedatablePlan: h.getPlan,
  applyRedates: h.apply,
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  ceilingWarningsFor: h.warnings,
}))

import { conferenceRouter } from './conference'
import { ticketsRouter } from './tickets'
import type { MilestoneSource } from '@/lib/marketing/milestones'
import type { RedatableTask, RedatePlan } from '@/lib/marketing/redate'

const CONF = 'conf-A'
const WARNING = 'Three posts share the same channel slot'
const dates = {
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}
const targets = {
  enabled: true,
  salesStartDate: '2027-03-01',
  targetCurve: 'linear' as const,
  milestones: [],
}
let storedConference: MilestoneSource
let storedTask: RedatableTask
function context(): Context {
  const speaker = { _id: 'admin', organizerOrgIds: ['org-A'] }
  return {
    speaker,
    session: { speaker, user: { name: 'Admin' } },
  } as unknown as Context
}

beforeEach(() => {
  vi.clearAllMocks()
  h.conference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: 'org-A' } },
    error: null,
  })
  storedConference = {
    cfpStartDate: '2027-01-10',
    cfpEndDate: '2027-03-01',
    cfpNotifyDate: '2027-04-01',
    programDate: '2027-04-20',
    startDate: '2027-06-10',
    endDate: '2027-06-11',
  }
  storedTask = {
    _id: 'task-A',
    _rev: 'task-rev',
    kind: 'publishing',
    channel: 'linkedin',
    milestone: 'TICKETS_OPEN',
    offsetDays: 0,
    provisional: true,
    dueAt: null,
    plannedAt: '2027-03-18T07:00:00.000Z',
    status: null,
    approvedAt: null,
    variant: {
      _id: 'variant-A',
      _rev: 'variant-rev',
      status: 'draft',
      usesCustomTime: false,
      scheduledAt: '2027-03-18T07:00:00.000Z',
      postId: 'post-A',
      postRev: 'post-rev',
    },
  }
  h.fetch.mockResolvedValue({ _id: CONF, ticketTargets: targets })
  h.commit.mockImplementation(async (id, fields) => {
    Object.assign(storedConference, fields)
    return { _id: id, ...fields }
  })
  h.getPlan.mockImplementation(async () => ({
    planId: 'plan-A',
    planRev: 'plan-rev',
    conference: storedConference,
    tasks: [storedTask],
    campaigns: [],
  }))
  h.apply.mockImplementation(async (plan: RedatePlan) => {
    for (const task of plan.tasks) {
      storedTask.variant!.scheduledAt = task.at
      storedTask.plannedAt = task.at
      storedTask.provisional = task.provisional
    }
    return true
  })
  h.warnings.mockResolvedValue([WARNING])
})

describe('milestone writes re-date the server-resolved marketing plan', () => {
  it('returns marketing warnings after saving earlyBirdEndDate', async () => {
    storedTask.milestone = 'EARLY_BIRD_END'
    storedTask.variant!.scheduledAt = storedTask.plannedAt =
      '2027-04-20T06:00:00.000Z'
    const result = await conferenceRouter
      .createCaller(context())
      .updateDates({ ...dates, earlyBirdEndDate: '2027-04-01' })
    expect(result).toMatchObject({
      success: true,
      marketingWarnings: [WARNING],
    })
    expect(storedTask).toMatchObject({
      variant: { scheduledAt: '2027-04-01T06:00:00.000Z' },
      provisional: false,
    })
    expect(h.commit).toHaveBeenCalledWith(CONF, {
      ...dates,
      earlyBirdEndDate: '2027-04-01',
    })
    expect(h.getPlan).toHaveBeenCalledWith(CONF)
    expect(h.commit.mock.invocationCallOrder[0]).toBeLessThan(
      h.getPlan.mock.invocationCallOrder[0],
    )
  })

  it('returns marketing warnings through the salesStartDate settings path', async () => {
    const result = await ticketsRouter
      .createCaller(context())
      .admin.updateSettings({ ticketTargets: targets })
    expect(result).toMatchObject({
      success: true,
      marketingWarnings: [WARNING],
    })
    expect(storedTask).toMatchObject({
      variant: { scheduledAt: '2027-03-01T07:00:00.000Z' },
      provisional: false,
    })
    expect(h.commit).toHaveBeenCalledWith(CONF, { ticketTargets: targets })
    expect(h.getPlan).toHaveBeenCalledWith(CONF)
    expect(h.commit.mock.invocationCallOrder[0]).toBeLessThan(
      h.getPlan.mock.invocationCallOrder[0],
    )
  })

  it('re-dates after updating targets directly', async () => {
    const result = await ticketsRouter
      .createCaller(context())
      .admin.updateTargets({ targets })
    expect(result).toMatchObject({ _id: CONF, marketingWarnings: [WARNING] })
    expect(h.getPlan).toHaveBeenCalledWith(CONF)
  })

  it('re-dates when target tracking is disabled without changing salesStartDate', async () => {
    storedTask.variant!.scheduledAt = storedTask.plannedAt =
      '2027-03-01T07:00:00.000Z'
    storedTask.provisional = false
    const result = await ticketsRouter
      .createCaller(context())
      .admin.toggleTargetTracking({ enabled: false })
    expect(storedTask).toMatchObject({
      variant: { scheduledAt: '2027-03-18T07:00:00.000Z' },
      provisional: true,
    })
    expect(result).toMatchObject({
      _id: CONF,
      ticketTargets: { ...targets, enabled: false },
      marketingWarnings: [WARNING],
    })
    expect(h.getPlan).toHaveBeenCalledWith(CONF)
  })
})

describe('marketing failures never undo a settings save', () => {
  it('returns a successful salesStartDate save when reading the plan fails', async () => {
    h.getPlan.mockRejectedValueOnce(new Error('Sanity temporarily unavailable'))
    const result = await ticketsRouter
      .createCaller(context())
      .admin.updateSettings({ ticketTargets: targets })
    expect(result).toMatchObject({ success: true, marketingWarnings: [] })
    expect(storedConference.ticketTargets).toEqual(targets)
    expect(storedTask.variant!.scheduledAt).toBe('2027-03-18T07:00:00.000Z')
  })

  it('returns a successful milestone save when applying dates fails', async () => {
    storedTask.milestone = 'EARLY_BIRD_END'
    h.apply.mockRejectedValueOnce(new Error('Write temporarily unavailable'))
    const result = await conferenceRouter
      .createCaller(context())
      .updateDates({ ...dates, earlyBirdEndDate: '2027-04-01' })
    expect(result).toMatchObject({ success: true, marketingWarnings: [] })
    expect(storedConference.earlyBirdEndDate).toBe('2027-04-01')
  })
})
