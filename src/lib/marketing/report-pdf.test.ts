import { describe, expect, it } from 'vitest'
import { renderMarketingReportPdf } from './report-pdf'
import { exportFixture } from './report/__tests__/export-fixture'
import { extractPdfText } from '../../../__tests__/lib/pdf/extract-text'

describe('Marketing Report PDF', () => {
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
