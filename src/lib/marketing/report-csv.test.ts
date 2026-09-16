import { describe, expect, it } from 'vitest'
import { buildReportCsv } from './report-csv'
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
    expect(Object.keys(result[0])).toHaveLength(26)
    expect(Object.keys(result[1])).toHaveLength(26)
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
