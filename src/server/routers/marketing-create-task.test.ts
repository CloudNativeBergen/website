/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { TaskRecords } from '@/lib/marketing/materialize'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import { planRedates, type RedatableTask } from '@/lib/marketing/redate'
import { marketingRouter } from './marketing'

const h = vi.hoisted(() => ({
  read: vi.fn(),
  conference: vi.fn(),
  campaign: vi.fn(),
  create: vi.fn(),
  standing: vi.fn(),
  sponsor: vi.fn(),
  ceilings: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.read },
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
}))
vi.mock('@/lib/marketing/sanity', async (original) => ({
  ...(await original<typeof import('@/lib/marketing/sanity')>()),
  createMarketingTask: h.create,
}))
vi.mock('@/lib/marketing/outreach/sanity', () => ({
  getOutreachCampaign: h.campaign,
  resolveOutreachSponsor: h.sponsor,
}))
vi.mock('@/lib/messaging/standing', () => ({
  speakerHasStandingInConference: h.standing,
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  ceilingWarningsFor: h.ceilings,
  channelCeilingWarnings: vi.fn(async () => []),
}))
const t = initTRPC.context<Context>().create()
function caller() {
  const speaker = { _id: 'admin', organizerOrgIds: ['org-A'] }
  const user = { email: 'admin@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(marketingRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}
const base = {
  campaignId: 'camp-ours',
  title: 'Manual task',
  dueAt: '2027-06-10T22:30:00.000Z',
}
const publishing = {
  ...base,
  kind: 'publishing' as const,
  channel: 'linkedin' as const,
  targetPage: '/tickets',
}
const dates = {
  startDate: '2027-05-01',
  endDate: '2027-05-02',
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
}
function datedConference(extra: Record<string, string> = {}) {
  h.conference.mockResolvedValue({
    conference: {
      _id: 'conf-A',
      title: 'Conference',
      organization: { _ref: 'org-A' },
      domains: ['example.com'],
      ...dates,
      ...extra,
    },
    error: null,
  })
}
const undated = {
  campaignId: base.campaignId,
  title: base.title,
  kind: 'publishing' as const,
  channel: 'linkedin' as const,
  targetPage: '/tickets',
}
const anchored = { ...undated, milestone: 'CFP_CLOSE' as const, offsetDays: -3 }
function records(): TaskRecords {
  return h.create.mock.calls[0][0]
}
beforeEach(() => {
  vi.clearAllMocks()
  h.conference.mockResolvedValue({
    conference: {
      _id: 'conf-A',
      title: 'Conference',
      organization: { _ref: 'org-A' },
      domains: ['example.com'],
    },
    error: null,
  })
  h.read.mockImplementation(async (_q: string, p: { id: string }) => ({
    _type: 'marketingCampaign',
    conferenceId: p.id === 'camp-foreign' ? 'conf-B' : 'conf-A',
    conferenceOrgId: 'org-A',
    memberOrgIds: [],
  }))
  h.campaign.mockResolvedValue({
    _id: 'camp-ours',
    key: 'tickets',
    planId: 'plan-A',
    planRev: 'plan-rev-1',
    ownerId: 'owner',
  })
  h.create.mockResolvedValue(true)
  h.standing.mockResolvedValue(true)
  h.sponsor.mockResolvedValue({ _id: 'sfc-A' })
  h.ceilings.mockResolvedValue(['Near daily ceiling'])
})
describe('manual Tasks of every Kind', () => {
  it.each([
    'speakerOutreach',
    'sponsorOutreach',
    'studioRender',
    'eventPageUpdate',
    'checklist',
  ] as const)('creates %s through the transactional writer', async (kind) => {
    const outreach = kind === 'speakerOutreach' || kind === 'sponsorOutreach'
    const result = await caller().task.create({
      ...base,
      kind,
      instructions: 'Do this',
      ...(outreach ? { subjectId: 'subject-1', targetPage: '/tickets' } : {}),
    })
    expect(records()).toMatchObject({
      tasks: [
        {
          _id: result.taskId,
          kind,
          instructions: 'Do this',
          origin: 'manual',
          status: 'open',
          dueAt: base.dueAt,
          assigneeId: 'owner',
          conferenceId: 'conf-A',
        },
      ],
      posts: [],
      variants: [],
    })
    expect(h.create.mock.calls[0][1]).toBe('conf-A')
    expect(result.ceilingWarnings).toEqual([])
    expect(h.standing).toHaveBeenCalledTimes(kind === 'speakerOutreach' ? 1 : 0)
    expect(h.sponsor).toHaveBeenCalledTimes(kind === 'sponsorOutreach' ? 1 : 0)
  })
  it('creates one empty draft by default with a real tagged URL and actual ceiling ids', async () => {
    const result = await caller().task.create(publishing)
    const data = records()
    expect(data.tasks).toHaveLength(1)
    expect(data.posts).toHaveLength(1)
    expect(data.variants).toHaveLength(1)
    expect(data.posts[0].body).toBe('')
    expect(data.variants[0]).toMatchObject({
      status: 'draft',
      body: '',
      platform: 'linkedin',
      scheduledAt: base.dueAt,
    })
    const url = new URL(data.variants[0].link)
    expect(url.origin).toBe('https://example.com')
    expect(url.pathname).toBe('/tickets')
    expect(url.searchParams.get('utm_campaign')).toBe('tickets')
    expect(url.searchParams.get('utm_content')).toBe(data.tasks[0].key)
    expect(h.ceilings).toHaveBeenCalledWith('conf-A', {
      variantIds: [data.variants[0]._id],
    })
    expect(result).toEqual({
      taskId: data.tasks[0]._id,
      ceilingWarnings: ['Near daily ceiling'],
    })
  })
  it('retains publishing instructions on both manually created siblings', async () => {
    await caller().task.create({
      ...publishing,
      instructions: 'Use the approved artwork.',
      alsoCreateSibling: true,
    })
    expect(records().tasks.map((task) => task.instructions)).toEqual([
      'Use the approved artwork.',
      'Use the approved artwork.',
    ])
  })
  it('creates an opted-in sibling with its own key and post at the other channel slot on the Oslo day', async () => {
    await caller().task.create({ ...publishing, alsoCreateSibling: true })
    const data = records()
    expect(data.tasks).toHaveLength(2)
    expect(new Set(data.tasks.map((t) => t.key)).size).toBe(2)
    expect(data.tasks.every((t) => t.key.startsWith('custom-'))).toBe(true)
    expect(new Set(data.variants.map((v) => v.postId)).size).toBe(2)
    expect(
      data.variants.map((v) => [v.platform, v.scheduledAt, v.body]),
    ).toEqual([
      ['linkedin', base.dueAt, ''],
      ['bluesky', '2027-06-11T16:00:00.000Z', ''],
    ])
    expect(h.create).toHaveBeenCalledTimes(1)
  })
  it('uses the LinkedIn winter slot when Bluesky requests a sibling', async () => {
    await caller().task.create({
      ...publishing,
      channel: 'bluesky',
      dueAt: '2027-01-10T23:30:00.000Z',
      alsoCreateSibling: true,
    })
    expect(records().variants[1]).toMatchObject({
      platform: 'linkedin',
      scheduledAt: '2027-01-11T07:00:00.000Z',
    })
  })
  it('refuses a foreign campaign before reading or writing it', async () => {
    await expect(
      caller().task.create({ ...publishing, campaignId: 'camp-foreign' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No marketingCampaign with that id for this request',
    })
    expect(h.campaign).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })
  it.each([
    { ...base, kind: 'publishing' as const, targetPage: '/tickets' },
    { ...base, kind: 'publishing' as const, channel: 'linkedin' as const },
    { ...base, kind: 'speakerOutreach' as const, targetPage: '/tickets' },
    { ...base, kind: 'sponsorOutreach' as const, subjectId: 'sponsor' },
    { ...base, kind: 'checklist' as const, alsoCreateSibling: true },
    { ...base, kind: 'checklist' as const, subjectId: 'unused-foreign' },
  ])('rejects missing or irrelevant Kind inputs: %j', async (input) => {
    await expect(caller().task.create(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('writes against the plan revision its validation read saw', async () => {
    // Deletion guards the plan in its first bundle, so a Task created after a
    // delete starts loses. The reverse order needed this: a Task whose
    // validation read happened BEFORE the delete and whose commit landed after
    // it still succeeded, creating a Task, post and variant holding a weak
    // reference to a Campaign that no longer exists — and no multi-chunk delete
    // was required for it.
    await caller().task.create(publishing)
    expect(h.create.mock.calls[0].slice(1)).toEqual(['conf-A', 'plan-rev-1'])
  })
  it('returns a conflict if the transactional writer loses', async () => {
    h.create.mockResolvedValue(false)
    await expect(caller().task.create(publishing)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(h.ceilings).not.toHaveBeenCalled()
  })
})
describe('manual Tasks anchored to a Milestone', () => {
  beforeEach(() => datedConference())
  it('places an anchored publishing Task on the resolved day at its Channel slot', async () => {
    await caller().task.create(anchored)
    const data = records()
    // CFP_CLOSE 2027-02-01 − 3 days, LinkedIn 08:00 Oslo (winter, UTC+1).
    expect(data.tasks[0]).toMatchObject({
      milestone: 'CFP_CLOSE',
      offsetDays: -3,
      provisional: false,
      plannedAt: '2027-01-29T07:00:00.000Z',
      origin: 'manual',
    })
    expect(data.variants[0].scheduledAt).toBe('2027-01-29T07:00:00.000Z')
  })
  it('gives the sibling the same anchor at its own Channel slot', async () => {
    await caller().task.create({ ...anchored, alsoCreateSibling: true })
    const data = records()
    expect(
      data.tasks.map((t) => [
        t.channel,
        t.milestone,
        t.offsetDays,
        t.plannedAt,
      ]),
    ).toEqual([
      ['linkedin', 'CFP_CLOSE', -3, '2027-01-29T07:00:00.000Z'],
      ['bluesky', 'CFP_CLOSE', -3, '2027-01-29T17:00:00.000Z'],
    ])
    expect(data.variants.map((v) => v.scheduledAt)).toEqual([
      '2027-01-29T07:00:00.000Z',
      '2027-01-29T17:00:00.000Z',
    ])
  })
  it('places an anchored non-publishing Task at the work slot', async () => {
    await caller().task.create({
      campaignId: 'camp-ours',
      title: 'Book the photographer',
      kind: 'checklist',
      milestone: 'CONFERENCE_START',
      offsetDays: -14,
    })
    expect(records().tasks[0]).toMatchObject({
      milestone: 'CONFERENCE_START',
      offsetDays: -14,
      dueAt: '2027-04-17T07:00:00.000Z',
      plannedAt: '2027-04-17T07:00:00.000Z',
    })
  })
  it('flags the Task provisional when its Milestone resolved from a fallback', async () => {
    await caller().task.create({ ...anchored, milestone: 'EARLY_BIRD_END' })
    // EARLY_BIRD_END unset → PROGRAM_PUBLISHED 2027-04-01 − 3 days (summer, UTC+2).
    expect(records().tasks[0]).toMatchObject({
      provisional: true,
      plannedAt: '2027-03-29T06:00:00.000Z',
    })
  })
  it('is re-dated with the edition, and stays put once approved', async () => {
    await caller().task.create({
      campaignId: 'camp-ours',
      title: 'Book the photographer',
      kind: 'checklist',
      milestone: 'CFP_CLOSE',
      offsetDays: 2,
    })
    const task = records().tasks[0]
    const stored: RedatableTask = {
      _id: task._id,
      _rev: 'r1',
      kind: task.kind,
      channel: null,
      milestone: task.milestone ?? null,
      offsetDays: task.offsetDays ?? null,
      provisional: task.provisional,
      plannedAt: task.plannedAt ?? null,
      dueAt: task.dueAt ?? null,
      status: 'open',
      approvedAt: null,
      variant: null,
    }
    const milestones = resolveAllMilestones({
      ...dates,
      cfpEndDate: '2027-02-15',
    })
    expect(
      planRedates({ milestones, tasks: [stored], campaigns: [] }).tasks,
    ).toEqual([
      expect.objectContaining({
        taskId: task._id,
        at: '2027-02-17T08:00:00.000Z',
      }),
    ])
    expect(
      planRedates({
        milestones,
        tasks: [{ ...stored, approvedAt: '2027-01-05T00:00:00.000Z' }],
        campaigns: [],
      }).tasks,
    ).toEqual([])
  })
  it('leaves a bare date unanchored', async () => {
    await caller().task.create(publishing)
    const task = records().tasks[0]
    expect(task.plannedAt).toBe(base.dueAt)
    expect(Object.keys(task)).not.toContain('milestone')
    expect(Object.keys(task)).not.toContain('offsetDays')
  })
  it.each([
    {
      why: 'both a date and an anchor',
      input: { ...anchored, dueAt: base.dueAt },
    },
    { why: 'neither', input: undated },
    { why: 'a Milestone alone', input: { ...undated, milestone: 'CFP_CLOSE' } },
    { why: 'an offset alone', input: { ...undated, offsetDays: 3 } },
    { why: 'an offset beyond a year', input: { ...anchored, offsetDays: 366 } },
    { why: 'a fractional offset', input: { ...anchored, offsetDays: 1.5 } },
  ])('refuses $why', async ({ input }) => {
    await expect(caller().task.create(input as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('names the missing conference date instead of creating an undated Task', async () => {
    datedConference({ cfpEndDate: '' })
    await expect(caller().task.create(anchored)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
})
