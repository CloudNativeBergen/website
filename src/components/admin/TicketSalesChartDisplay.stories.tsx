import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import { CategoryBreakdownTable } from '@/app/(admin)/admin/tickets/TicketBreakdownTables'
import type {
  CombinedDataPoint,
  TicketAnalysisResult,
} from '@/lib/tickets/types'
import type { CategoryStat } from '@/lib/tickets/utils'

const FIXED_NOW = new Date('2026-04-20T09:00:00Z')

const CAPACITY = 300

const CATEGORY_SHARE = {
  'Early Bird': 0.45,
  Standard: 0.35,
  Student: 0.12,
  Workshop: 0.08,
} as const

/**
 * Eight weekly points with cumulative per-category totals, which is the shape
 * the processor produces. Sales run a little ahead of a linear target.
 */
const progression: CombinedDataPoint[] = Array.from({ length: 8 }, (_, i) => {
  const date = new Date(FIXED_NOW)
  date.setDate(date.getDate() - (7 - i) * 7)
  const actualTickets = Math.round(18 + i * 21)
  const targetTickets = Math.round(15 + i * 19)
  return {
    date: date.toISOString().slice(0, 10),
    actualTickets,
    targetTickets,
    revenue: actualTickets * 4500,
    categoryBreakdown: Object.fromEntries(
      Object.entries(CATEGORY_SHARE).map(([category, share]) => [
        category,
        Math.round(actualTickets * share),
      ]),
    ),
    isMilestone: i === 5,
    milestoneLabel: i === 5 ? 'CFP closed' : null,
  }
})

const latest = progression[progression.length - 1]

const analysis: TicketAnalysisResult = {
  capacity: CAPACITY,
  progression,
  statistics: {
    totalPaidTickets: latest.actualTickets,
    totalRevenue: latest.revenue,
    totalOrders: 121,
    averageTicketPrice: 4500,
    categoryBreakdown: latest.categoryBreakdown,
    sponsorTickets: 24,
    speakerTickets: 18,
  },
  performance: {
    currentPercentage: 55,
    targetPercentage: 50.7,
    variance: 4.3,
    isOnTrack: true,
    nextMilestone: {
      date: '2026-05-11',
      label: 'Blind bird ends',
      daysAway: 21,
    },
  },
}

const categoryStats: CategoryStat[] = Object.entries(CATEGORY_SHARE).map(
  ([category, share]) => ({
    category,
    count: Math.round(latest.actualTickets * share),
    orders: Math.round(latest.actualTickets * share * 0.8),
    revenue: Math.round(latest.actualTickets * share) * 4500,
    percentage: share * 100,
  }),
)

const meta = {
  title: 'Systems/Tickets/Admin/TicketSalesChartDisplay',
  component: TicketSalesChartDisplay,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Ticket sales overview: the stat cards (two per row on a phone, five across from `lg`) and the sales chart. Below the `sm` breakpoint the chart is replaced by the category breakdown table passed as `chartFallback` — a stacked six-series column chart with a hover tooltip is not usable at phone width. The `sr-only` paragraph carries the same totals for a screen reader at every width.',
      },
    },
  },
  args: {
    analysis,
    paidAnalysis: analysis,
    salesConfig: {
      enabled: true,
      salesStartDate: '2026-02-16',
      targetCurve: 'linear',
      milestones: [
        { date: '2026-03-30', targetPercentage: 50, label: 'CFP closed' },
        { date: '2026-05-11', targetPercentage: 75, label: 'Blind bird ends' },
      ],
    },
    includeFreeTickets: false,
    onToggleChange: fn(),
    paidCount: latest.actualTickets,
    freeCount: 42,
    participantTally: {
      participants: latest.actualTickets + 36,
      addOnsWithSeat: 4,
      addOnsWithoutSeat: 1,
      repeatTickets: 1,
      certain: true,
    },
    freeTicketAllocation: {
      sponsors: {
        allocated: 24,
        claimed: 9,
        fromProvider: false,
        status: 'Redemptions of 100%-off sponsor codes.',
      },
      speakers: {
        allocated: 18,
        claimed: 12,
        fromProvider: false,
        status: '4 invitations unclaimed · 2 speakers never invited.',
      },
      organizers: {
        allocated: 9,
        claimed: 'unknown',
        fromProvider: false,
        status:
          'Organizer comps cannot be told apart from any other free ticket.',
      },
      totalAllocated: 51,
      // One uncountable row: the card says so instead of implying a rate.
      totalClaimed: 'unknown',
    },
    chartFallback: <CategoryBreakdownTable stats={categoryStats} />,
  },
  beforeEach: () => {
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
  },
} satisfies Meta<typeof TicketSalesChartDisplay>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The page default. Shoot at 393 and 360 to see the stat grid two-up and the
 * breakdown table; shoot at 1280 to see the chart.
 */
export const Default: Story = {}

/** No fallback passed: the chart renders at every width, as it did before. */
export const WithoutFallback: Story = {
  args: { chartFallback: undefined },
}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing, not decoration:
 * `.storybook/test-runner.ts` reads it and resizes the real page, and the
 * runner's default is 1280 — without it this story would render the chart and
 * the assertions below would pass for the wrong reason.
 *
 * Both halves are the regression net: the table must be there AND the
 * chart-only toggle must not. Either one alone stays green while the other
 * breaks.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile2' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // One "Tickets Sold" label per breakdown card — the DataTable mobile card
    // renders column headers as labels, so the desktop <thead> is not there.
    const soldLabels = await canvas.findAllByText('Tickets Sold')
    await expect(soldLabels[0]).toBeVisible()
    await expect(canvas.queryByText('Paid Tickets Only')).toBeNull()
  },
}

/** Free-ticket allocation missing: four stat cards instead of five. */
export const WithoutFreeTickets: Story = {
  args: { freeTicketAllocation: undefined, freeCount: 0 },
}

/**
 * The discount list could not be read, so no code can be told from a purchase.
 * The count is still one-per-email over admitting tickets, but it is shown as
 * approximate rather than asserted.
 */
export const UnverifiedParticipants: Story = {
  args: {
    participantTally: {
      participants: 155,
      addOnsWithSeat: 0,
      addOnsWithoutSeat: 0,
      repeatTickets: 0,
      certain: false,
    },
  },
}

/**
 * Behind target. The verdict is derived from the variance shown beside it, so
 * the words, the sign, the arrow and the colour can no longer disagree — the
 * live page rendered a red downward arrow, "-4.2%" and "On Track" together.
 */
export const BehindTarget: Story = {
  args: {
    paidAnalysis: {
      ...analysis,
      performance: {
        ...analysis.performance,
        currentPercentage: 46.5,
        targetPercentage: 50.7,
        variance: -4.2,
        // Still true on the record: the old rule was `variance >= -5`. The card
        // must NOT read it.
        isOnTrack: true,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/Behind \(-4\.2%\)/)).toBeVisible()
    await expect(canvas.queryByText(/On Track/)).toBeNull()
  },
}

/**
 * The "include free tickets" toggle changes the CHART only — the cards are the
 * paid population by definition. The line under the heading says which
 * population is being drawn so the two halves of the screen cannot silently
 * describe different sets of tickets.
 */
export const IncludingFreeTickets: Story = {
  args: { includeFreeTickets: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(
        'All tickets, paid and free. The cards above count paid tickets only.',
      ),
    ).toBeVisible()
  },
}

/**
 * Nothing to chart. `adaptForChart` always appends the target series, so the
 * old `!series.length` guard could never fire and this rendered an empty chart
 * whose screen-reader summary asserted "Sales target for the period: 0".
 */
export const EmptyProgression: Story = {
  args: {
    analysis: { ...analysis, progression: [] },
    chartFallback: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No chart data available'),
    ).toBeVisible()
    await expect(canvas.queryByText(/Sales target for the period/)).toBeNull()
  },
}

/**
 * The conference never set `ticketCapacity`. There is no denominator to show,
 * so the sales card is a count and says so — it must NOT fall back to the
 * invented 250 the page used to pass.
 */
export const NoCapacitySet: Story = {
  args: {
    analysis: { ...analysis, capacity: 0 },
    paidAnalysis: {
      ...analysis,
      capacity: 0,
      performance: { ...analysis.performance, currentPercentage: 0 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No capacity set')).toBeVisible()
    await expect(canvas.queryByText(/250/)).toBeNull()
  },
}
