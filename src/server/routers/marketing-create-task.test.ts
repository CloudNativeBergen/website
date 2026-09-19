/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { TaskRecords } from '@/lib/marketing/materialize'
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
