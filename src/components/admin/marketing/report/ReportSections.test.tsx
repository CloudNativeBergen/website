/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { exportFixture } from '@/lib/marketing/report/__tests__/export-fixture'
import {
  ChannelFunnel,
  OutcomeSummary,
  ReportTimeline,
  TopTasks,
} from './ReportSections'

afterEach(cleanup)

describe('Report measurement presentation', () => {
  it('labels retained Task and Channel readings independently of a fresh primary outcome', () => {
    const view = exportFixture()
    view.summary[0].observationDate = '2026-06-17'
    const retained = { observationDate: '2026-06-16', stale: true }
    const fresh = { observationDate: '2026-06-17', stale: false }
    view.topTasks[0].sessionsMeasurement = retained
    view.topTasks[0].clicksMeasurement = retained
    view.topTasks[0].blueskyInteractionsMeasurement = fresh
    view.channels[0].sessionsMeasurement = retained
    view.channels[0].clicksMeasurement = retained
    const { container } = render(
      <>
        <OutcomeSummary view={view} />
        <ChannelFunnel view={view} />
        <TopTasks view={view} />
      </>,
    )
    const [summary, channel, task] = Array.from(
      container.querySelectorAll('section'),
    )
    expect(summary.textContent).toContain('Observed 17. juni')
    expect(channel.textContent).toContain('913')
    expect(task.textContent).toContain('71')
    // Assert the complete rendered value/date/status, not a global warning.
    expect(
      within(channel).getByText('Sessions').parentElement?.textContent,
    ).toBe(
      '913SessionsOldest measurement: 16. juni · last measured reading retained',
    )
    expect(
      within(channel).getByText('Combined clicks').parentElement?.textContent,
    ).toBe(
      '71Combined clicksOldest measurement: 16. juni · last measured reading retained',
    )
    expect(task.textContent).toContain(
      'Sessions: 913 · Observed 16. juni · last measured reading retained',
    )
    expect(task.textContent).toContain(
      'Combined clicks: 71 · Observed 16. juni · last measured reading retained',
    )
    expect(task.textContent).toContain(
      'Bluesky interactions: 29 · Oldest measurement: 17. juni',
    )
  })
  it('calls unavailable totals not measured without claiming a retained reading', () => {
    const view = exportFixture()
    const missing = { observationDate: null, stale: true }
    view.channels[0].sessions = null
    view.channels[0].sessionsMeasurement = missing
    view.topTasks[0].sessions = null
    view.topTasks[0].sessionsMeasurement = missing
    const { container } = render(
      <>
        <ChannelFunnel view={view} />
        <TopTasks view={view} />
      </>,
    )
    expect(
      within(container).getByText('Sessions').parentElement?.textContent,
    ).toBe('—SessionsNot measured')
    expect(within(container).getByText(/^Sessions:/).textContent).toBe(
      'Sessions: — · Not measured',
    )
  })
  it('uses Norwegian grouping for report values and chart ticks', () => {
    const view = exportFixture()
    view.summary[0].value = 1204
    view.channels[0].sessions = 1204
    view.topTasks[0].clicks = 1204
    view.timeline[0].points[0].value = 1204
    const { container } = render(
      <>
        <OutcomeSummary view={view} />
        <ChannelFunnel view={view} />
        <TopTasks view={view} />
        <ReportTimeline view={view} />
      </>,
    )
    const sections = Array.from(container.querySelectorAll('section'))
    for (const section of sections)
      expect(section.textContent).toContain('1\u00a0204')
    expect(container.querySelector('svg')?.textContent).toContain('1\u00a0204')
  })
})

describe('Report milestone indices', () => {
  it.each<[string, string, number]>([
    ['2026-07-07', '7. juli', 314.324324],
    ['2026-07-06', '6. juli', 306.648649],
    ['2026-07-04', '4. juli', 291.297297],
  ])(
    'gives right-edge indices on %s separate readable rows and axis clearance',
    (date, notifyDate, notifyX) => {
      const view = exportFixture()
      view.milestones = {
        CFP_OPEN: { date: '2026-06-01', provisional: false },
        CFP_CLOSE: { date: '2026-07-07', provisional: false },
        CFP_NOTIFY: { date, provisional: true },
      }
      const { container } = render(<ReportTimeline view={view} />)
      const svg = container.querySelector('svg')!
      // The 37-day axis spans x=38 to x=322: July 7 is day 36.
      // Use worked coordinates, independent of the production date helpers.
      const expectedMarkers = [
        { index: '1', x: 38, legend: '1. CFP opens · 1. juni' },
        { index: '2', x: 314.324324, legend: '2. CFP closes · 7. juli' },
        {
          index: '3',
          x: notifyX,
          legend: `3. Speakers notified · ${notifyDate} (provisional)`,
        },
      ]
      const markers = Array.from(svg.querySelectorAll('g')).filter((group) =>
        group.querySelector('circle'),
      )
      const legend = within(container).getAllByRole('listitem')
      expect(markers).toHaveLength(expectedMarkers.length)
      expect(legend).toHaveLength(expectedMarkers.length)
      expectedMarkers.forEach((expected, index) => {
        const marker = markers[index]
        const line = marker.querySelector('line')!
        const badge = marker.querySelector('circle')!
        const label = marker.querySelector('text')!
        expect(Number(line.getAttribute('x1'))).toBeCloseTo(expected.x, 5)
        expect(Number(line.getAttribute('x2'))).toBeCloseTo(expected.x, 5)
        expect(Number(badge.getAttribute('cx'))).toBeCloseTo(expected.x, 5)
        expect(Number(label.getAttribute('x'))).toBeCloseTo(expected.x, 5)
        // Check each plotted badge against its own legend entry, including
        // coincident dates where coordinates alone cannot detect swapped IDs.
        expect(label.textContent).toBe(expected.index)
        expect(legend[index].textContent).toBe(expected.legend)
      })
      const labels = Array.from(svg.querySelectorAll('text'))
      const second = labels.find((el) => el.textContent === '2')!
      const third = labels.find((el) => el.textContent === '3')!
      const distance = Math.abs(
        Number(second.getAttribute('y')) - Number(third.getAttribute('y')),
      )
      // 16-unit index badge plus a 4-unit gap, even at the same date.
      expect(distance).toBeGreaterThanOrEqual(20)
      const axis = labels.find((el) => el.textContent?.startsWith('Before'))!
      expect(
        Number(axis.getAttribute('y')) -
          Math.max(
            Number(second.getAttribute('y')),
            Number(third.getAttribute('y')),
          ),
      ).toBeGreaterThanOrEqual(20)
      expect(
        within(container).getByText(/2. CFP closes/).textContent,
      ).toContain('7. juli')
      expect(
        within(container).getByText(/3. Speakers notified/).textContent,
      ).toContain('(provisional)')
    },
  )
})
