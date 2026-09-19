import { describe, expect, it } from 'vitest'
import { buildReportCsv } from './report-csv'
import { buildReport } from './report/model'
import { exportFixture } from './report/__tests__/export-fixture'

function rows(csv: string) {
  const [header, ...data] = csv
    .trim()
    .split('\n')
    .map((line) => line.split(','))
  return data.map((cells) =>
    Object.fromEntries(header.map((key, index) => [key, cells[index]])),
  )
}

describe('Marketing Report CSV', () => {
  it('exports raw daily Campaign and Task rows with observed numbers, independent of display grain', () => {
    const report = exportFixture()
    report.range.grain = 'weekly'
    const result = rows(buildReportCsv(report))
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      'Row type': 'Campaign',
      'Observation date': '2026-06-16',
      'Primary outcome': '137',
      'Attributed primary outcome': '83',
      'Attributed sessions': '913',
      'Checkout click-through': '42',
    })
    expect(result[1]).toMatchObject({
      'Row type': 'Task',
      'Task sessions': '913',
      'Task combined clicks': '71',
      'Bluesky likes': '20',
      'Bluesky reposts': '5',
      'Bluesky replies': '3',
      'Bluesky quotes': '1',
    })
    // The STORED basis travels with the reading, and only the stored one. This
    // fixture row predates the denormalization, so those columns are blank
    // rather than carrying the live Campaign's current window — which would
    // make "historical" columns change whenever someone edits the Campaign,
    // and would undo at the export exactly what migration 052 refuses to
    // invent at the source.
    expect(result[0]).toMatchObject({
      'Measured window start': '',
      'Measured window end': '',
      'Measured target': '',
    })
    // A reading that DID record its basis exports it.
    const recorded = rows(
      buildReportCsv({
        ...report,
        snapshots: report.snapshots.map((s) => ({
          ...s,
          campaignStartDate: '2026-06-01',
          campaignEndDate: '2026-06-30',
          campaignTarget: 250,
        })),
      }),
    )
    expect(recorded[0]).toMatchObject({
      'Measured window start': '2026-06-01',
      'Measured window end': '2026-06-30',
      'Measured target': '250',
    })
    expect(Object.keys(result[0])).toHaveLength(29)
    expect(Object.keys(result[1])).toHaveLength(29)
  })
  it('exports BOTH stored readings for one Campaign key and day', () => {
    // The audit export is one line per stored document. `canonicalSnapshots`
    // keeps one row per campaignKey:date, preferring the later `takenAt` —
    // right for a chart, wrong here. A manual refresh, or a plan deleted and
    // reseeded from the template on the same day (same stable key, new
    // Campaign `_id`, so a second snapshot document), leaves two real readings
    // for that key and day, and the CSV used to emit only the newer. The
    // earlier one was then unreachable through any surface in the product.
    //
    // Built through `buildReport`, not by mutating a finished view: the drop
    // happened inside the builder, so a test that assembled the view by hand
    // passed just as well with the bug in place.
    const fixture = exportFixture()
    const first = fixture.snapshots[0]
    const report = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: fixture.campaigns, tasks: [] },
      // The reseed keeps the Template's stable `campaignKey` and mints a new
      // Campaign `_id` — which is exactly what makes the two rows collide in
      // `canonicalSnapshots` while remaining two distinct stored documents.
      snapshots: [
        { ...first, campaignKey: 'cfp' },
        {
          ...first,
          _id: 'snap-after-reseed',
          campaignKey: 'cfp',
          takenAt: '2026-06-17T09:00:00Z',
          campaign: { ...first.campaign, _ref: 'campaign-after-reseed' },
          primaryOutcomeValue: 141,
          perTask: [],
        },
      ],
      range: fixture.range,
      today: '2026-06-17',
    })
    expect(
      rows(buildReportCsv(report))
        .filter((row) => row['Row type'] === 'Campaign')
        .map((row) => [row['Snapshot ID'], row['Primary outcome']]),
    ).toEqual([
      [first._id, '137'],
      ['snap-after-reseed', '141'],
    ])
  })

  it('keeps a historical null target null, and does not relabel a reseeded row', () => {
    const fixture = exportFixture()
    const first = fixture.snapshots[0]
    const report = buildReport({
      conference: fixture.conference,
      plan: {
        plan: fixture.plan!,
        // Same stable key, new document, and the organizer has since set a
        // target on it.
        campaigns: [
          {
            ...fixture.campaigns[0],
            _id: 'campaign-after-reseed',
            key: 'cfp',
            target: 999,
          },
        ],
        // A freshly seeded Task that reuses the stable key the old observation
        // carries — without one in the plan, the lookup could never resolve and
        // the assertion below would hold whether or not the guard existed.
        tasks: [
          {
            _id: 'task-after-reseed',
            campaignId: 'campaign-after-reseed',
            key: 'launch',
            title: 'Newly seeded Task',
            kind: 'publishing',
            channel: 'linkedin',
            date: '2026-06-20T07:00:00.000Z',
            provisional: false,
            milestone: null,
            status: 'draft',
            complete: false,
            prerequisiteIds: [],
            variantId: null,
            assigneeId: null,
            approvedAt: null,
          },
        ],
      },
      snapshots: [
        {
          ...first,
          campaignKey: 'cfp',
          // Measured when the Campaign had no target at all.
          campaignTarget: null,
          perTask: [{ ...first.perTask[0], taskKey: 'launch' }],
        },
      ],
      range: fixture.range,
      today: '2026-06-18',
    })
    const result = rows(buildReportCsv(report))
    // A stored null is a real answer — the Campaign had no goal then — not a
    // gap to fill from today's Campaign.
    expect(result[0]['Measured target']).toBe('')
    // And the row keeps the deleted Task's identity rather than borrowing the
    // newly seeded Task's title.
    expect(result[1]['Task title']).not.toBe('Newly seeded Task')
  })

  it('retains the weak Task reference and numbers when its Task no longer resolves', () => {
    const report = exportFixture()
    expect(report.tasks).toEqual([])
    expect(rows(buildReportCsv(report))[1]).toMatchObject({
      'Task ID': 'deleted-task',
      'Task title': 'Deleted or unavailable Task',
      'Task combined clicks': '71',
    })
  })
  it('neutralises formula-like Campaign text through the shared CSV injection guard', () => {
    const report = exportFixture()
    report.campaigns[0].title = '=1+1'
    expect(rows(buildReportCsv(report))[0]['Campaign title']).toBe("'=1+1")
  })
  it('leaves unmeasured values blank and retains source status', () => {
    const report = exportFixture()
    report.snapshots[0].primaryOutcomeValue = null
    report.snapshots[0].perTask[0].sessions = null
    report.snapshots[0].source.posthog = 'unavailable'
    const result = rows(buildReportCsv(report))
    expect(result[0]['Primary outcome']).toBe('')
    expect(result[1]['Task sessions']).toBe('')
    expect(result[1]['PostHog source']).toBe('unavailable')
  })
})

it('exports preserved keys, labels and the measured metric after Campaign deletion', () => {
  const report = exportFixture()
  report.campaigns = []
  Object.assign(report.snapshots[0], {
    campaignKey: 'cfp',
    campaignTitle: 'Original CFP',
    campaignPrimaryOutcome: 'cfpSubmissions',
  })
  report.snapshots[0].perTask[0].taskKey = 'launch'
  const result = rows(buildReportCsv(report))
  expect(result[0]).toMatchObject({
    'Campaign key': 'cfp',
    'Campaign title': 'Original CFP',
    Outcome: 'cfpSubmissions',
    'Primary outcome': '137',
  })
  expect(result[1]).toMatchObject({
    'Task key': 'launch',
    'Task combined clicks': '71',
  })
})
