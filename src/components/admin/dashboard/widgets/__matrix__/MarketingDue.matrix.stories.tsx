import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { MarketingDueData } from '@/lib/dashboard/data-types'
import { MarketingDueWidget } from '../MarketingDueWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import { conferenceInPhase } from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  defaultSizeFor,
  matrixSizesFor,
} from './WidgetFrame'

const TYPE = 'marketing-due'
const conferences = Object.fromEntries(
  ['loading', 'failure', 'empty', 'due-today', 'overdue'].map((state) => [
    state,
    conferenceInPhase('planning', `${TYPE}/${state}`),
  ]),
)
const due: MarketingDueData = {
  tasks: [
    {
      id: 'linkedin',
      title: 'Publish the programme announcement on LinkedIn',
      assigneeName: 'Ingrid Olsen',
      dueAt: '2026-09-16T10:00:00Z',
      overdue: false,
      href: '/admin/marketing/tasks/linkedin',
    },
    {
      id: 'outreach',
      title: 'Invite speakers to share their talks',
      assigneeName: 'Unassigned',
      dueAt: '2026-09-16T14:00:00Z',
      overdue: false,
      href: '/admin/marketing/tasks/outreach',
    },
  ],
}
const overdue: MarketingDueData = {
  tasks: [
    {
      id: 'studio',
      title: 'Render sponsor artwork for the announcement',
      assigneeName: 'Alexander Very Long Organizer Name',
      dueAt: '2026-09-14T10:00:00Z',
      overdue: true,
      href: '/admin/marketing/tasks/studio',
    },
    ...due.tasks,
  ],
}
setMockActionFor(conferences.loading._id, 'fetchMarketingDue', mockPending)
setMockActionFor(conferences.failure._id, 'fetchMarketingDue', mockFailure)
setMockActionFor(
  conferences.empty._id,
  'fetchMarketingDue',
  mockResolved({ tasks: [] }),
)
setMockActionFor(
  conferences['due-today']._id,
  'fetchMarketingDue',
  mockResolved(due),
)
setMockActionFor(
  conferences.overdue._id,
  'fetchMarketingDue',
  mockResolved(overdue),
)

const FIXED_NOW = new Date('2026-09-16T10:00:00Z').getTime()

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see PaymentDetailsModal.stories): the
    // widget fixtures remain stable when run on any calendar date.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(FIXED_NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => FIXED_NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

  title: 'Systems/Proposals/Admin/Dashboard/Matrix/MarketingDue',
  tags: ['matrix'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const AllStatesDefaultSize: Story = {
  render: () => (
    <MatrixGrid>
      {Object.entries(conferences).map(([state, conference]) => (
        <WidgetFrame key={state} label={state} {...defaultSizeFor(TYPE)}>
          <MarketingDueWidget conference={conference} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
}
export const AllSizes: Story = {
  render: () => (
    <MatrixGrid>
      {matrixSizesFor(TYPE).map((size) => (
        <WidgetFrame key={size.name} label={size.name} {...size}>
          <MarketingDueWidget conference={conferences.overdue} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
}
export const Mobile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const taskLink = await canvas.findByRole('link', {
      name: /Render sponsor artwork/,
    })
    await expect(taskLink).toHaveAttribute(
      'href',
      '/admin/marketing/tasks/studio',
    )
    await expect(
      canvas.getByText('Alexander Very Long Organizer Name'),
    ).toBeVisible()
    await expect(canvas.getAllByText('Due today')).toHaveLength(1)
    await expect(
      canvas.getByRole('link', { name: '+1 more task' }),
    ).toHaveAttribute('href', '/admin/marketing')
  },
  render: () => (
    <WidgetFrame mode="mobile" label="Due today and overdue">
      <MarketingDueWidget conference={conferences.overdue} />
    </WidgetFrame>
  ),
}
