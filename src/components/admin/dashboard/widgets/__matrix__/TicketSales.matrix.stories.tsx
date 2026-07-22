import type { Meta, StoryObj, Decorator } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { TicketSalesDashboardWidget } from '../TicketSalesDashboardWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  ticketSalesSelling,
  ticketSalesZero,
  ticketSalesUnconfigured,
  ticketSalesApiError,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'ticket-sales'

// Selling view renders in planning/execution; use execution for dense cells.
const selling = conferenceInPhase('execution', 'ticket-sales/selling')
const zero = conferenceInPhase('execution', 'ticket-sales/zero')
const unconfigured = conferenceInPhase('execution', 'ticket-sales/unconfigured')
const apiError = conferenceInPhase('execution', 'ticket-sales/api-error')
const loading = conferenceInPhase('execution', 'ticket-sales/loading')
const failing = conferenceInPhase('execution', 'ticket-sales/error')
const init = conferenceInPhase('initialization', 'ticket-sales/init')
const post = conferenceInPhase('post-conference', 'ticket-sales/post')
const postNoData = conferenceInPhase(
  'post-conference',
  'ticket-sales/post-empty',
)

setMockActionFor(
  selling._id,
  'fetchTicketSales',
  mockResolved(ticketSalesSelling),
)
setMockActionFor(zero._id, 'fetchTicketSales', mockResolved(ticketSalesZero))
setMockActionFor(
  unconfigured._id,
  'fetchTicketSales',
  mockResolved(ticketSalesUnconfigured),
)
setMockActionFor(
  apiError._id,
  'fetchTicketSales',
  mockResolved(ticketSalesApiError),
)
setMockActionFor(loading._id, 'fetchTicketSales', mockPending)
setMockActionFor(failing._id, 'fetchTicketSales', mockFailure)
setMockActionFor(
  init._id,
  'fetchTicketSales',
  mockResolved(ticketSalesUnconfigured),
)
setMockActionFor(post._id, 'fetchTicketSales', mockResolved(ticketSalesSelling))
setMockActionFor(
  postNoData._id,
  'fetchTicketSales',
  mockResolved(ticketSalesUnconfigured),
)

/**
 * The widget calls next-themes useTheme().resolvedTheme for chart theming.
 * NOT forcedTheme: next-themes does not reflect a forced theme into
 * resolvedTheme (it stays on the stored/system value — light in headless
 * browsers), so a forcedTheme decorator renders dark stories with
 * light-themed charts. defaultTheme + enableSystem=false makes
 * resolvedTheme follow the toolbar; the per-theme storageKey and key
 * ensure no persisted value or stale provider wins over a toolbar switch.
 */
const withNextThemes: Decorator = (Story, ctx) => {
  const theme = ctx.globals.theme === 'dark' ? 'dark' : 'light'
  return (
    <ThemeProvider
      key={theme}
      attribute="class"
      defaultTheme={theme}
      enableSystem={false}
      storageKey={`sb-matrix-theme-${theme}`}
    >
      <Story />
    </ThemeProvider>
  )
}

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/TicketSales',
  tags: ['matrix'],
  decorators: [withNextThemes],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for TicketSalesDashboardWidget inside the real WidgetContainer geometry. The fetcher returns a discriminated TicketSalesResult (unconfigured | error | ok), all three arms are covered. Wrapped in a next-themes ThemeProvider because the widget calls useTheme() for ApexCharts theming.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllSizesSelling: Story = {
  render: () => (
    <MatrixGrid>
      {matrixSizesFor(TYPE).map((s) => (
        <WidgetFrame
          key={s.name}
          label={s.name}
          colSpan={s.colSpan}
          rowSpan={s.rowSpan}
        >
          <TicketSalesDashboardWidget conference={selling} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size in the selling state: stat cards, radial capacity gauge, milestones and the 14-day sales-vs-target line chart.',
      },
    },
  },
}

export const AllStatesDefaultSize: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="loading" {...size}>
          <TicketSalesDashboardWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error (rejected fetch)" {...size}>
          <TicketSalesDashboardWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="error (status:'error')" {...size}>
          <TicketSalesDashboardWidget conference={apiError} />
        </WidgetFrame>
        <WidgetFrame label="unconfigured" {...size}>
          <TicketSalesDashboardWidget conference={unconfigured} />
        </WidgetFrame>
        <WidgetFrame label="zero sales" {...size}>
          <TicketSalesDashboardWidget conference={zero} />
        </WidgetFrame>
        <WidgetFrame label="selling" {...size}>
          <TicketSalesDashboardWidget conference={selling} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <TicketSalesDashboardWidget />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'All states at default size. Note (current behaviour): with NO conference the widget falls through to the amber "Not Configured" card, since data is null and no phase branch applies.',
      },
    },
  },
}

export const Phases: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="initialization (setup guide)" {...size}>
          <TicketSalesDashboardWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="execution (selling)" {...size}>
          <TicketSalesDashboardWidget conference={selling} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (final report)" {...size}>
          <TicketSalesDashboardWidget conference={post} />
        </WidgetFrame>
        <WidgetFrame label="post-conference, no data" {...size}>
          <TicketSalesDashboardWidget conference={postNoData} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="true min, selling" colSpan={3} rowSpan={3}>
        <TicketSalesDashboardWidget conference={selling} />
      </WidgetFrame>
      <WidgetFrame label="narrow, selling" colSpan={3} rowSpan={4}>
        <TicketSalesDashboardWidget conference={selling} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The flagged narrow cells (3x3 true minimum and the 3x4 narrow preset) with the full selling view: gauge + charts squeezed into one column span of 3.',
      },
    },
  },
}

export const MobileAndEditChrome: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="mobile selling" mode="mobile">
          <TicketSalesDashboardWidget conference={selling} />
        </WidgetFrame>
        <WidgetFrame label="mobile unconfigured" mode="mobile">
          <TicketSalesDashboardWidget conference={unconfigured} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <TicketSalesDashboardWidget conference={selling} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
