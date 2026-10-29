import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { SponsorsWaitingData } from '@/lib/dashboard/data-types'
import { SponsorsWaitingWidget } from '../SponsorsWaitingWidget'
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

const TYPE = 'sponsors-waiting'
const conferences = Object.fromEntries(
  ['loading', 'failure', 'empty', 'mixed'].map((state) => [
    state,
    conferenceInPhase('planning', `${TYPE}/${state}`),
  ]),
)
const mixed: SponsorsWaitingData = {
  items: [
    {
      id: 'acme-overdue',
      title: 'Invoice Overdue',
      sponsorName: 'Acme Cloud',
      priority: 1,
      href: '/admin/sponsors/acme?view=pipeline',
    },
    {
      id: 'nordic-follow-up-due',
      title: 'Follow-up Due',
      sponsorName: 'Nordic Kubernetes Consulting With A Very Long Name AS',
      priority: 2,
      href: '/admin/sponsors/nordic?view=pipeline',
    },
    {
      id: 'fjord-missing-contact',
      title: 'No Contact Info',
      sponsorName: 'Fjord Data',
      priority: 3,
      href: '/admin/sponsors/fjord?view=pipeline',
    },
    {
      id: 'bergen-unassigned',
      title: 'Assign an owner',
      sponsorName: 'Bergen Bytes',
      priority: 3.8,
      href: '/admin/sponsors/bergen?view=pipeline',
    },
  ],
}
setMockActionFor(conferences.loading._id, 'fetchSponsorsWaiting', mockPending)
setMockActionFor(conferences.failure._id, 'fetchSponsorsWaiting', mockFailure)
setMockActionFor(
  conferences.empty._id,
  'fetchSponsorsWaiting',
  mockResolved({ items: [] }),
)
setMockActionFor(
  conferences.mixed._id,
  'fetchSponsorsWaiting',
  mockResolved(mixed),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/SponsorsWaiting',
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
          <SponsorsWaitingWidget conference={conference} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
}

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Nothing waiting')).toBeVisible()
  },
  render: () => (
    <WidgetFrame label="empty" {...defaultSizeFor(TYPE)}>
      <SponsorsWaitingWidget conference={conferences.empty} />
    </WidgetFrame>
  ),
}

export const Mixed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('link', { name: /Acme Cloud/ }),
    ).toHaveAttribute('href', '/admin/sponsors/acme?view=pipeline')
    await expect(
      canvas.getByRole('link', { name: /Bergen Bytes.*Assign an owner/ }),
    ).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/admin/sponsors/crm',
    )
  },
  render: () => (
    <WidgetFrame label="mixed" {...defaultSizeFor(TYPE)}>
      <SponsorsWaitingWidget conference={conferences.mixed} />
    </WidgetFrame>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <MatrixGrid>
      {matrixSizesFor(TYPE).map((size) => (
        <WidgetFrame key={size.name} label={size.name} {...size}>
          <SponsorsWaitingWidget conference={conferences.mixed} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
}
