/** @vitest-environment node */
import { evaluate, parse } from 'groq-js'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/cron/marketing-reminders/route'
import {
  runMarketingReminders,
  getReminderCandidates,
  resolveReminderConferences,
  MAX_CANDIDATES_PER_CONFERENCE,
} from '@/lib/marketing/reminders/sanity'
import {
  runReminderEngine,
  type ReminderTask,
} from '@/lib/marketing/reminders/engine'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  patch: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mocks.fetch },
  clientWrite: { patch: mocks.patch },
}))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))
vi.mock('@/lib/time', () => ({ getCurrentDateTime: () => runNow }))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: mocks.notify,
}))
const NOW = '2026-09-16T12:00:00Z'
let runNow = NOW
let data: Record<string, unknown>[]
function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    _id: id,
    _rev: 'r0',
    _type: 'marketingTask',
    conference: { _ref: 'a' },
    title: id,
    kind: 'checklist',
    status: 'open',
    dueAt: NOW,
    assignee: { _ref: 'owner' },
    ...extra,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  runNow = NOW
  data = []
  mocks.fetch.mockImplementation(async (query, params) =>
    (await evaluate(parse(query), { dataset: data, params })).get(),
  )
  mocks.notify.mockImplementation(async (inputs) => inputs.length)
  mocks.patch.mockImplementation((id) => {
    let rev: string
    let fields: Record<string, unknown>
    const p = {
      ifRevisionId(r: string) {
        rev = r
        return p
      },
      set(f: Record<string, unknown>) {
        fields = f
        return p
      },
      async commit() {
        const row = data.find((t) => t._id === id)!
        if (rev && row._rev !== rev) throw { statusCode: 409 }
        Object.assign(row, fields!, { _rev: `${rev}+` })
        return row
      },
    }
    return p
  })
})
it('claims before sends so concurrent and subsequent runs never call createNotifications again', async () => {
  data = [task('one')]
  const results = await Promise.all([
    runMarketingReminders('a', NOW),
    runMarketingReminders('a', NOW),
  ])
  expect(results.reduce((n, r) => n + r.due, 0)).toBe(1)
  expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(mocks.notify.mock.calls[0][0]).toEqual([
    expect.objectContaining({
      recipientId: 'owner',
      conferenceId: 'a',
      link: '/admin/marketing/tasks/one',
    }),
  ])
  expect(await runMarketingReminders('a', NOW)).toEqual({ due: 0, overdue: 0 })
  expect(mocks.notify).toHaveBeenCalledTimes(1)
})
it('overdue is exactly 24 hours after scheduled time and sent once', async () => {
  data = [task('one', { remindedAt: NOW })]
  expect(await runMarketingReminders('a', '2026-09-17T11:59:59Z')).toEqual({
    due: 0,
    overdue: 0,
  })
  expect(await runMarketingReminders('a', '2026-09-17T12:00:00Z')).toEqual({
    due: 0,
    overdue: 1,
  })
  expect(await runMarketingReminders('a', '2026-09-18T12:00:00Z')).toEqual({
    due: 0,
    overdue: 0,
  })
  expect(mocks.notify).toHaveBeenCalledTimes(1)
})
it('selects only unfinished assigned tasks of this conference using the real query', async () => {
  data = [
    task('eligible'),
    task('drafts.hidden'),
    task('versions.hidden'),
    task('foreign', { conference: { _ref: 'b' } }),
    task('skip', { status: 'skipped' }),
    task('done', { status: 'done' }),
    task('asset', {
      kind: 'studioRender',
      asset: { asset: { _ref: 'image' } },
    }),
    task('speaker', { kind: 'speakerOutreach', messageId: 'message' }),
    task('sponsor', { kind: 'sponsorOutreach', messageId: 'message' }),
    task('unassigned', { assignee: null }),
  ]
  expect(
    (await getReminderCandidates('a', NOW, 'remindedAt')).map((t) => t._id),
  ).toEqual(['eligible'])
  expect(await runMarketingReminders('a', '2026-09-18T12:00:00Z')).toEqual({
    due: 1,
    overdue: 1,
  })
  expect(
    mocks.notify.mock.calls.map((c) =>
      c[0].map((n: { message: string }) => n.message),
    ),
  ).toEqual([['eligible'], ['eligible']])
})
it('due reminders require manual handoff and reject foreign, future, and automatic variants', async () => {
  const variant = (id: string, extra: Record<string, unknown> = {}) => ({
    _id: id,
    _type: 'socialPostVariant',
    conference: { _ref: 'a' },
    status: 'awaiting-manual',
    scheduledAt: NOW,
    ...extra,
  })
  data = [
    task('manual', {
      kind: 'publishing',
      status: null,
      dueAt: null,
      variant: { _ref: 'v' },
    }),
    variant('v'),
    task('skipped-publishing', {
      kind: 'publishing',
      status: 'skipped',
      variant: { _ref: 'v' },
    }),
    task('future', { kind: 'publishing', variant: { _ref: 'future-v' } }),
    variant('future-v', { scheduledAt: '2026-09-20T00:00:00Z' }),
    task('automatic', { kind: 'publishing', variant: { _ref: 'auto-v' } }),
    variant('auto-v', { status: 'scheduled' }),
    task('published', { kind: 'publishing', variant: { _ref: 'pub-v' } }),
    variant('pub-v', {
      status: 'published',
      publishResult: { url: 'https://example.com/post' },
    }),
    task('foreign', { kind: 'publishing', variant: { _ref: 'foreign-v' } }),
    variant('foreign-v', { conference: { _ref: 'b' } }),
  ]
  expect(
    (await getReminderCandidates('a', NOW, 'remindedAt')).map((t) => t._id),
  ).toEqual(['manual'])
  expect(
    (
      await getReminderCandidates(
        'a',
        '2026-09-17T12:00:00Z',
        'overdueNudgedAt',
      )
    ).map((t) => t._id),
  ).toEqual(['automatic', 'manual'])
  expect(await runMarketingReminders('a', '2026-09-17T12:00:00Z')).toEqual({
    due: 1,
    overdue: 2,
  })
})
it.each(['draft', 'scheduled', 'failed', 'published'])(
  'nudges an incomplete %s publishing task after 24 hours without sending a due reminder',
  async (status) => {
    data = [
      task('publishing-task', {
        kind: 'publishing',
        variant: { _ref: 'variant' },
      }),
      {
        _id: 'variant',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status,
        scheduledAt: NOW,
      },
    ]
    expect(await runMarketingReminders('a', '2026-09-17T11:59:59Z')).toEqual({
      due: 0,
      overdue: 0,
    })
    expect(await runMarketingReminders('a', '2026-09-17T12:00:00Z')).toEqual({
      due: 0,
      overdue: 1,
    })
    expect(mocks.notify.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        recipientId: 'owner',
        notificationType: 'marketing_task_overdue',
        message: 'publishing-task',
      }),
    ])
    expect(await runMarketingReminders('a', '2026-09-18T12:00:00Z')).toEqual({
      due: 0,
      overdue: 0,
    })
  },
)
it('picks a task deferred by the GROQ cap on the next run', async () => {
  data = Array.from({ length: MAX_CANDIDATES_PER_CONFERENCE + 1 }, (_, i) =>
    task(`task-${String(i).padStart(3, '0')}`),
  )
  expect(await runMarketingReminders('a', NOW)).toEqual({
    due: 100,
    overdue: 0,
  })
  expect(await runMarketingReminders('a', NOW)).toEqual({ due: 1, overdue: 0 })
  expect(mocks.notify.mock.calls[1][0][0].message).toBe('task-100')
})
it('eventually delivers to all 51 conferences across bounded cron runs', async () => {
  data = Array.from({ length: 51 }, (_, i) => {
    const conferenceId = `c${String(i).padStart(2, '0')}`
    return [
      { _id: conferenceId, _type: 'conference', startDate: '2026-10-01' },
      {
        _id: `restored-plan-${i}`,
        _type: 'marketingPlan',
        conference: { _ref: conferenceId },
      },
      task(`task-${i}`, { conference: { _ref: conferenceId } }),
    ]
  }).flat()
  data.push(
    { _id: 'no-plan', _type: 'conference', startDate: '2020-01-01' },
    { _id: 'draft-only', _type: 'conference', startDate: '2020-01-01' },
    {
      _id: 'drafts.plan',
      _type: 'marketingPlan',
      conference: { _ref: 'draft-only' },
    },
    { _id: 'version-only', _type: 'conference', startDate: '2020-01-01' },
    {
      _id: 'versions.plan',
      _type: 'marketingPlan',
      conference: { _ref: 'version-only' },
    },
  )
  vi.stubEnv('CRON_SECRET', 'secret')
  try {
    const run = async () =>
      (
        await GET(
          new NextRequest('http://localhost/api/cron/marketing-reminders', {
            headers: { authorization: 'Bearer secret' },
          }),
        )
      ).json()
    const first = await run()
    const second = await run()
    expect(first.summary).toEqual({
      conferences: 50,
      failed: 0,
      due: 50,
      overdue: 0,
    })
    expect(second.summary).toEqual({
      conferences: 50,
      failed: 0,
      due: 1,
      overdue: 0,
    })
    expect(
      new Set(
        mocks.notify.mock.calls.flatMap(([inputs]) =>
          inputs.map((input: { conferenceId: string }) => input.conferenceId),
        ),
      ).size,
    ).toBe(51)
  } finally {
    vi.unstubAllEnvs()
  }
})
it('eventually serves c50 and reports failed rotation stamps when the first 50 plans cannot be stamped', async () => {
  data = Array.from({ length: 51 }, (_, i) => {
    const id = String(i).padStart(2, '0')
    return [
      { _id: `c${id}`, _type: 'conference', startDate: '2026-10-01' },
      {
        _id: `plan-${id}`,
        _type: 'marketingPlan',
        conference: { _ref: `c${id}` },
      },
      task(`task-${id}`, { conference: { _ref: `c${id}` } }),
    ]
  }).flat()
  const healthyPatch = mocks.patch.getMockImplementation()!
  mocks.patch.mockImplementation((id) => {
    const patch = healthyPatch(id)
    const set = patch.set
    patch.set = (fields: Record<string, unknown>) => {
      if (id !== 'plan-50' && 'lastRemindedAt' in fields) {
        patch.commit = async () => {
          throw new Error('rotation stamp unavailable')
        }
      }
      return set(fields)
    }
    return patch
  })
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('CRON_SECRET', 'secret')
  try {
    const runs = []
    for (const now of [NOW, '2026-09-17T12:00:00Z', '2026-09-18T12:00:00Z']) {
      runNow = now
      const response = await GET(
        new NextRequest('http://localhost/api/cron/marketing-reminders', {
          headers: { authorization: 'Bearer secret' },
        }),
      )
      runs.push(await response.json())
    }
    const dueNotifications = mocks.notify.mock.calls
      .flatMap(([inputs]) => inputs)
      .filter((input) => input.notificationType === 'marketing_task_due')
    expect(dueNotifications.map((input) => input.conferenceId)).toContain('c50')
    expect(dueNotifications).toHaveLength(51)
    expect(runs[0].summary).toEqual({
      conferences: 50,
      failed: 50,
      due: 50,
      overdue: 0,
    })
    expect(runs[0].results[0]).toMatchObject({
      ok: false,
      error: 'rotation stamp unavailable',
      due: 1,
    })
    expect(runs.map((run) => run.summary.conferences)).toEqual([50, 50, 50])
  } finally {
    errors.mockRestore()
    vi.unstubAllEnvs()
  }
})
it('moves a failed plan behind waiting plans before processing its reminders', async () => {
  data = [
    { _id: 'a', _type: 'conference' },
    { _id: 'b', _type: 'conference' },
    { _id: 'restored-a', _type: 'marketingPlan', conference: { _ref: 'a' } },
    { _id: 'restored-b', _type: 'marketingPlan', conference: { _ref: 'b' } },
  ]
  mocks.fetch.mockRejectedValueOnce(new Error('candidate lookup failed'))
  await expect(runMarketingReminders('a', NOW, 'restored-a')).rejects.toThrow(
    'candidate lookup failed',
  )
  expect(await resolveReminderConferences()).toEqual([
    { planId: 'restored-b', conferenceId: 'b' },
    { planId: 'restored-a', conferenceId: 'a' },
  ])
})
it('engine nudges incomplete publishing states while excluding completed variants from a broken store', async () => {
  const statuses = [
    'draft',
    'scheduled',
    'failed',
    'published',
    'awaiting-manual',
  ]
  const rows: ReminderTask[] = statuses.map((status) => ({
    _id: status,
    _rev: 'r',
    conferenceId: 'a',
    title: status,
    kind: 'publishing',
    assigneeId: 'owner',
    status: null,
    dueAt: null,
    hasAsset: false,
    messageId: null,
    remindedAt: null,
    overdueNudgedAt: null,
    variant: { status, scheduledAt: NOW, url: null },
  }))
  rows.push({
    ...rows[0],
    _id: 'complete',
    title: 'complete',
    variant: {
      status: 'published',
      scheduledAt: NOW,
      url: 'https://example.com/post',
    },
  })
  const notify = vi.fn(async (inputs) => inputs.length)
  const result = await runReminderEngine('a', '2026-09-17T12:00:00Z', {
    candidates: async () => rows,
    claim: async () => true,
    notify,
  })
  expect(result).toEqual({ due: 1, overdue: 5 })
  expect(
    notify.mock.calls.map(([inputs]) =>
      inputs.map((input: { message: string }) => input.message),
    ),
  ).toEqual([
    ['awaiting-manual'],
    ['draft', 'scheduled', 'failed', 'published', 'awaiting-manual'],
  ])
})
it('engine rejects foreign/completed/unassigned rows even from a broken store', async () => {
  const eligible: ReminderTask = {
    _id: 'ok',
    _rev: 'r',
    conferenceId: 'a',
    title: 'ok',
    kind: 'checklist',
    assigneeId: 'owner',
    status: 'open',
    dueAt: NOW,
    hasAsset: false,
    messageId: null,
    remindedAt: null,
    overdueNudgedAt: null,
    variant: null,
  }
  const claim = vi.fn().mockResolvedValue(true),
    notify = vi.fn().mockResolvedValue(1)
  const rows = [
    eligible,
    { ...eligible, _id: 'foreign', conferenceId: 'b' },
    { ...eligible, _id: 'unassigned', assigneeId: null },
    { ...eligible, _id: 'undated', dueAt: null },
    {
      ...eligible,
      _id: 'sponsor',
      kind: 'sponsorOutreach' as const,
      messageId: 'message',
    },
    {
      ...eligible,
      _id: 'skip',
      status: 'skipped',
      kind: 'publishing' as const,
      variant: { status: 'awaiting-manual', scheduledAt: NOW, url: null },
    },
    { ...eligible, _id: 'marked', remindedAt: NOW },
    { ...eligible, _id: 'future', dueAt: '2026-09-20T00:00:00Z' },
    { ...eligible, _id: 'done', status: 'done' },
    {
      ...eligible,
      _id: 'auto',
      kind: 'publishing' as const,
      variant: { status: 'scheduled', scheduledAt: NOW, url: null },
    },
    {
      ...eligible,
      _id: 'asset',
      kind: 'studioRender' as const,
      hasAsset: true,
    },
    {
      ...eligible,
      _id: 'message',
      kind: 'speakerOutreach' as const,
      messageId: 'message',
    },
  ]
  const result = await runReminderEngine('a', NOW, {
    candidates: async () => rows,
    claim,
    notify,
  })
  expect(result).toEqual({ due: 1, overdue: 0 })
  expect(claim.mock.calls.map((c) => c[0]._id)).toEqual(['ok'])
})
it('does not retry a failed delivery after the marker committed', async () => {
  data = [task('one')]
  mocks.notify.mockResolvedValue(0)
  expect(await runMarketingReminders('a', NOW)).toEqual({ due: 0, overdue: 0 })
  await runMarketingReminders('a', NOW)
  expect(data[0].remindedAt).toBe(NOW)
  expect(mocks.notify).toHaveBeenCalledTimes(1)
})
