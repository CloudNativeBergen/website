/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { parse, evaluate } from 'groq-js'
import {
  buildDashboardQuery,
  dashboardQueryParams,
} from '@/lib/dashboard/aggregate'
import { shapeMarketingDue } from '@/lib/dashboard/widget-data'

const now = new Date('2026-09-16T10:00:00Z')
const task = (id: string, fields: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'marketingTask',
  conference: { _ref: 'a' },
  kind: 'checklist',
  status: 'open',
  title: id,
  dueAt: '2026-09-16T09:00:00Z',
  ...fields,
})
async function run(dataset: Record<string, unknown>[], conferenceId = 'a') {
  const tree = parse(buildDashboardQuery(['marketingDueTasks'])!)
  return (
    await (
      await evaluate(tree, {
        dataset,
        params: dashboardQueryParams(conferenceId, now),
      })
    ).get()
  ).marketingDueTasks
}

describe('Marketing due composed root', () => {
  it('isolates conferences and cross-tenant variant references with positive controls', async () => {
    const dataset = [
      task('a'),
      task('b', { conference: { _ref: 'b' } }),
      task('cross-variant', {
        kind: 'publishing',
        variant: { _ref: 'variant-b' },
      }),
      task('own-variant', {
        kind: 'publishing',
        variant: { _ref: 'variant-a' },
      }),
      {
        _id: 'variant-a',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status: 'scheduled',
        scheduledAt: '2026-09-16T12:00:00Z',
      },
      {
        _id: 'variant-b',
        _type: 'socialPostVariant',
        conference: { _ref: 'b' },
        status: 'scheduled',
        scheduledAt: '2026-09-16T12:00:00Z',
      },
    ]
    expect((await run(dataset)).map((row: { _id: string }) => row._id)).toEqual(
      ['a', 'own-variant'],
    )
    expect(
      (await run(dataset, 'b')).map((row: { _id: string }) => row._id),
    ).toEqual(['b'])
  })
  it('uses publishing scheduledAt/status and kind-specific completion including skipped', async () => {
    const dataset = [
      task('checklist'),
      task('not-a-task', { _type: 'differentType' }),
      task('unknown-kind', { kind: 'unknown' }),
      task('publishing-skipped', {
        kind: 'publishing',
        status: 'skipped',
        variant: { _ref: 'v' },
      }),
      task('done', { status: 'done' }),
      task('skip', { status: 'skipped' }),
      task('studio-open', { kind: 'studioRender' }),
      task('studio-done', {
        kind: 'studioRender',
        asset: { asset: { _ref: 'asset' } },
      }),
      task('speaker-open', { kind: 'speakerOutreach' }),
      task('speaker-done', { kind: 'speakerOutreach', messageId: 'message' }),
      task('sponsor-open', { kind: 'sponsorOutreach' }),
      task('sponsor-done', { kind: 'sponsorOutreach', messageId: 'message' }),
      task('drafts.hidden'),
      task('versions.release.hidden'),
      task('publish', {
        kind: 'publishing',
        dueAt: '2099-01-01T00:00:00Z',
        status: undefined,
        variant: { _ref: 'v' },
      }),
      task('published-no-url', {
        kind: 'publishing',
        variant: { _ref: 'done-v' },
      }),
      task('published-with-url', {
        kind: 'publishing',
        variant: { _ref: 'url-v' },
      }),
      {
        _id: 'v',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status: 'awaiting-manual',
        scheduledAt: '2026-09-15T12:00:00Z',
      },
      {
        _id: 'url-v',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status: 'published',
        scheduledAt: '2026-09-15T12:00:00Z',
        publishResult: { url: 'https://example.com/published' },
      },
      {
        _id: 'done-v',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status: 'published',
        scheduledAt: '2026-09-15T12:00:00Z',
      },
    ]
    const rows = await run(dataset)
    expect(rows.map((row: { _id: string }) => row._id)).toEqual([
      'publish',
      'published-no-url',
      'checklist',
      'speaker-open',
      'sponsor-open',
      'studio-open',
    ])
    expect(rows[0].dueAt).toBe('2026-09-15T12:00:00Z')
  })
  it('keeps a SUBMITTED variant on the due list — it is in flight, not done (#1128)', async () => {
    const dataset = [
      task('submitted-task', {
        kind: 'publishing',
        status: undefined,
        variant: { _ref: 'sub-v' },
      }),
      {
        _id: 'sub-v',
        _type: 'socialPostVariant',
        conference: { _ref: 'a' },
        status: 'submitted',
        scheduledAt: '2026-09-15T12:00:00Z',
        submission: {
          vendorPostId: 'buffer-1',
          submittedAt: '2026-09-15T12:00:05Z',
        },
      },
    ]
    const rows = await run(dataset)
    expect(rows.map((row: { _id: string }) => row._id)).toEqual([
      'submitted-task',
    ])
  })
  it.each([undefined, null, ''])(
    'keeps a published task with URL %s incomplete',
    async (url) => {
      const rows = await run([
        task('incomplete', { kind: 'publishing', variant: { _ref: 'v' } }),
        {
          _id: 'v',
          _type: 'socialPostVariant',
          conference: { _ref: 'a' },
          status: 'published',
          scheduledAt: '2026-09-15T12:00:00Z',
          publishResult: { url },
        },
      ])
      expect(rows.map((row: { _id: string }) => row._id)).toEqual([
        'incomplete',
      ])
    },
  )
  it('includes later today, excludes tomorrow across offsets, and orders by instant', async () => {
    const rows = await run([
      task('last-today', { dueAt: '2026-09-17T00:30:00+03:00' }),
      task('tomorrow', { dueAt: '2026-09-16T23:30:00+01:00' }),
      task('earlier', { dueAt: '2026-09-16T09:00:00+02:00' }),
      task('future-publish', { kind: 'publishing', variant: { _ref: 'v' } }),
      {
        _id: 'v',
        conference: { _ref: 'a' },
        status: 'scheduled',
        scheduledAt: '2026-09-16T23:30:00+01:00',
      },
    ])
    expect(rows.map((row: { _id: string }) => row._id)).toEqual([
      'earlier',
      'last-today',
    ])
  })
  it('caps the conference-wide list at twenty oldest tasks', async () => {
    const rows = await run(
      Array.from({ length: 21 }, (_, i) =>
        task(`task-${String(i).padStart(2, '0')}`),
      ),
    )
    expect(rows.map((row: { _id: string }) => row._id)).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `task-${String(i).padStart(2, '0')}`,
      ),
    )
  })
  it('uses the Oslo calendar day for badges and explicit unassigned fallback', () => {
    expect(
      shapeMarketingDue(
        [
          {
            _id: 'today',
            title: 'Today',
            dueAt: '2026-09-15T22:30:00Z',
            assigneeName: null,
          },
          {
            _id: 'overdue',
            title: 'Overdue',
            dueAt: '2026-09-15T21:30:00Z',
            assigneeName: 'Ingrid',
          },
        ],
        now,
      ).tasks,
    ).toEqual([
      {
        id: 'today',
        title: 'Today',
        dueAt: '2026-09-15T22:30:00Z',
        assigneeName: 'Unassigned',
        overdue: false,
        href: '/admin/marketing/tasks/today',
      },
      {
        id: 'overdue',
        title: 'Overdue',
        dueAt: '2026-09-15T21:30:00Z',
        assigneeName: 'Ingrid',
        overdue: true,
        href: '/admin/marketing/tasks/overdue',
      },
    ])
  })
})
