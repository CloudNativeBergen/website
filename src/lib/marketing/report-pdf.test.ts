import { describe, expect, it } from 'vitest'
import { renderMarketingReportPdf } from './report-pdf'
import { exportFixture } from './report/__tests__/export-fixture'
import { buildReport } from './report/model'
import type { ReportView } from './report/types'
import { extractPdfText } from '../../../__tests__/lib/pdf/extract-text'

describe('Marketing Report PDF', () => {
  it.each<{
    name: string
    grain: ReportView['range']['grain']
    values: (number | null)[]
    caption: string
  }>([
    {
      name: 'retained weekly reading',
      grain: 'weekly',
      values: [137, null],
      caption:
        '137. Oldest measurement: 16. juni 2026 (last measured observation; may be stale)',
    },
    {
      name: 'fresh weekly zero',
      grain: 'weekly',
      values: [137, 0],
      caption: '0. Oldest measurement: 17. juni 2026',
    },
    {
      name: 'missing daily reading after a measurement',
      grain: 'daily',
      values: [137, null],
      caption: '-. Not measured',
    },
    {
      name: 'unmeasured weekly reading',
      grain: 'weekly',
      values: [null, null],
      caption: '-. Not measured',
    },
    {
      name: 'empty timeline',
      grain: 'weekly',
      values: [],
      caption: '-. Not measured',
    },
  ])(
    'dates and qualifies the latest plotted $name on its value',
    async ({ grain, values, caption }) => {
      const fixture = exportFixture()
      const report = buildReport({
        conference: fixture.conference,
        plan: {
          plan: fixture.plan!,
          campaigns: fixture.campaigns,
          tasks: fixture.tasks,
        },
        snapshots: values.map((value, i) => ({
          ...fixture.snapshots[0],
          _id: `snapshot-${i}`,
          date: ['2026-06-16', '2026-06-17'][i],
          primaryOutcomeValue: value,
        })),
        range: { ...fixture.range, grain },
        today: '2026-06-18',
      })
      const text = await extractPdfText(await renderMarketingReportPdf(report))
      const timeline = text.split('Timeline curve')[1].split('Top ten Tasks')[0]
      expect(
        timeline
          .match(/Latest plotted observation: .*?(?= 1\. juni)/)?.[0]
          .trim(),
      ).toBe(`Latest plotted observation: ${caption}`)
    },
  )
  it('names a window split as well as an Outcome split in the chart title', async () => {
    // The model splits a series on a window change as well as an Outcome
    // change, and only the latter was named in the export — so the PDF carried
    // two identically titled charts with the same Outcome and nothing saying
    // why the series restarted, while the screen labelled it.
    const view = exportFixture()
    const [series] = view.timeline
    view.timeline = [
      { ...series, metricChanged: false, windowChanged: false },
      { ...series, metricChanged: false, windowChanged: true },
      { ...series, metricChanged: true, windowChanged: false },
    ]
    const text = await extractPdfText(await renderMarketingReportPdf(view))
    expect(text).toContain('Campaign window changed; measurements restart')
    expect(text).toContain('Outcome changed; measurements restart')
  })

  it('labels null Task and Channel measurements as not measured even when stale', async () => {
    const report = exportFixture()
    const unmeasured = { observationDate: null, stale: true }
    Object.assign(report.channels[0], {
      sessions: null,
      clicks: null,
      sessionsMeasurement: unmeasured,
      clicksMeasurement: unmeasured,
    })
    Object.assign(report.topTasks[0], {
      sessions: null,
      clicks: null,
      blueskyInteractions: null,
      sessionsMeasurement: unmeasured,
      clicksMeasurement: unmeasured,
      blueskyInteractionsMeasurement: unmeasured,
    })
    const text = await extractPdfText(await renderMarketingReportPdf(report))
    expect(text).toContain('Sessions -. Not measured')
    expect(text).toContain(
      'combined CFP, sponsor and checkout clicks -. Not measured',
    )
    expect(text).toContain('Combined clicks: -. Not measured')
    expect(text).toContain('Sessions: -. Not measured')
    expect(text).toContain('Bluesky interactions: -. Not measured')
  })
  it('uses Norwegian grouping for every displayed report number', async () => {
    const report = exportFixture()
    report.summary[0].value = 1204
    report.summary[0].target = 2408
    report.summary[0].attributedValue = 1103
    report.channels[0].sessions = 3456
    report.channels[0].clicks = 2345
    report.topTasks[0].sessions = 3456
    report.topTasks[0].clicks = 2345
    report.topTasks[0].blueskyInteractions = 4567
    report.timeline[0].points[2].value = 5678
    report.health.total = 6789
    report.previousEdition = {
      title: '2025',
      campaigns: [
        {
          key: 'cfp',
          title: 'CFP campaign',
          current: 1204,
          previous: 1234,
          comparable: true,
          reason: null,
        },
      ],
    }
    const text = await extractPdfText(await renderMarketingReportPdf(report))
    for (const expected of [
      'CFP submissions : 1 204 / Target: 2 408',
      'Attributed subset: 1 103',
      'Sessions 3 456',
      'checkout clicks 2 345',
      'Combined clicks: 2 345',
      'Sessions: 3 456',
      'Bluesky interactions: 4 567',
      'Scale: 0 to 5 678',
      'Latest plotted observation: 5 678',
      '5 complete / 6 789 Tasks',
      'Current: 1 204 | Previous: 1 234',
    ])
      expect(text).toContain(expected)
  })
  it('dates and flags each carried-forward Task and Channel metric independently of a fresh Outcome', async () => {
    const report = exportFixture()
    report.summary[0].observationDate = '2026-06-17'
    report.summary[0].stale = false
    report.channels[0].sessionsMeasurement = {
      observationDate: '2026-06-16',
      stale: true,
    }
    report.channels[0].clicksMeasurement = {
      observationDate: '2026-06-15',
      stale: true,
    }
    report.topTasks[0].sessionsMeasurement =
      report.channels[0].sessionsMeasurement
    report.topTasks[0].clicksMeasurement = report.channels[0].clicksMeasurement
    report.topTasks[0].blueskyInteractionsMeasurement = {
      observationDate: '2026-06-17',
      stale: false,
    }
    const text = await extractPdfText(await renderMarketingReportPdf(report))
    const channel = text
      .split('Edition funnel by Channel')[1]
      .split('Timeline curve')[0]
    const task = text
      .split('Top ten Tasks')[1]
      .split('Previous-edition comparison')[0]
    expect(channel).toContain(
      'Sessions 913. Oldest measurement: 16. juni 2026 (last measured observation; may be stale)',
    )
    expect(channel).toContain(
      'combined CFP, sponsor and checkout clicks 71. Oldest measurement: 15. juni 2026 (last measured observation; may be stale)',
    )
    expect(task).toContain(
      'Combined clicks: 71. Oldest measurement: 15. juni 2026 (last measured observation; may be stale)',
    )
    expect(task).toContain(
      'Sessions: 913. Oldest measurement: 16. juni 2026 (last measured observation; may be stale)',
    )
    expect(task).toContain(
      'Bluesky interactions: 29. Oldest measurement: 17. juni 2026',
    )
  })
  it('renders all six sections and nonempty observed numbers through the real PDF renderer', async () => {
    const pdf = await renderMarketingReportPdf(exportFixture())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = await extractPdfText(pdf)
    for (const section of [
      'Plan health',
      'Outcome vs Target',
      'Edition funnel by Channel',
      'Timeline curve',
      'Top ten Tasks',
      'Previous-edition comparison',
    ])
      expect(text).toContain(section)
    expect(text).toContain('CFP submissions : 137 / Target: 250')
    expect(text).toContain('Attributed subset: 83')
    expect(text).toContain('Sessions 913')
    expect(text).toContain('Combined clicks: 71')
    expect(text).toContain(
      '5 complete / 12 Tasks; 3 overdue; 2 waiting; 1 failed; 4 unassigned.',
    )
    expect(text).toContain('No previous edition is available for comparison.')
    expect(text.indexOf('Plan health')).toBeLessThan(
      text.indexOf('Outcome vs Target'),
    )
  })
  it('places health last after plan end and prints unavailable observations as dashes', async () => {
    const report = exportFixture()
    report.health.running = false
    report.summary[0].value = null
    report.channels[0].sessions = null
    report.previousEdition = {
      title: '2025',
      campaigns: [
        {
          key: 'cfp',
          title: 'CFP campaign',
          current: 137,
          previous: 102,
          comparable: true,
          reason: null,
        },
      ],
    }
    const text = await extractPdfText(await renderMarketingReportPdf(report))
    expect(text).toContain('CFP submissions : - / Target: 250')
    expect(text).toContain('Sessions -')
    expect(text).toContain('Current: 137 | Previous: 102')
    expect(text.indexOf('Plan health')).toBeGreaterThan(
      text.indexOf('Previous-edition comparison'),
    )
  })
})
