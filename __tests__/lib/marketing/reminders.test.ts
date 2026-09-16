/** @vitest-environment node */
import { evaluate, parse } from 'groq-js'
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
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: mocks.notify,
}))
const NOW = '2026-09-16T12:00:00Z'
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
        if (row._rev !== rev) throw { statusCode: 409 }
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
it('joins publishing dates and status, rejecting foreign variants and future/finished/automatic variants', async () => {
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
    variant('pub-v', { status: 'published' }),
    task('foreign', { kind: 'publishing', variant: { _ref: 'foreign-v' } }),
    variant('foreign-v', { conference: { _ref: 'b' } }),
  ]
  expect(
    (await getReminderCandidates('a', NOW, 'remindedAt')).map((t) => t._id),
  ).toEqual(['manual'])
  expect(await runMarketingReminders('a', '2026-09-17T12:00:00Z')).toEqual({
    due: 1,
    overdue: 1,
  })
})
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
it('discovery is ordered and bounded to 50 conferences with a plan', async () => {
  data = Array.from({ length: 52 }, (_, i) => [
    {
      _id: `c${String(i).padStart(2, '0')}`,
      _type: 'conference',
      startDate: new Date(Date.UTC(2026, 0, 52 - i)).toISOString(),
    },
    {
      _id: `plan${i}`,
      _type: 'marketingPlan',
      conference: { _ref: `c${String(i).padStart(2, '0')}` },
    },
  ]).flat()
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

  expect(await resolveReminderConferences()).toEqual(
    Array.from({ length: 50 }, (_, i) => `c${String(51 - i).padStart(2, '0')}`),
  )
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
      variant: { status: 'awaiting-manual', scheduledAt: NOW },
    },
    { ...eligible, _id: 'marked', remindedAt: NOW },
    { ...eligible, _id: 'future', dueAt: '2026-09-20T00:00:00Z' },
    { ...eligible, _id: 'done', status: 'done' },
    {
      ...eligible,
      _id: 'auto',
      kind: 'publishing' as const,
      variant: { status: 'scheduled', scheduledAt: NOW },
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
