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
    totalCapacityUsed: latest.actualTickets,
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
    uniquePaidCount: latest.actualTickets - 4,
    uniqueFreeCount: 40,
    freeTicketAllocation: {
      sponsorTickets: 24,
      speakerTickets: 18,
      organizerTickets: 9,
      totalAllocated: 51,
      totalClaimed: 42,
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
  args: { freeTicketAllocation: undefined, freeCount: 0, uniqueFreeCount: 0 },
}
