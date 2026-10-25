import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { WorkshopCard } from './WorkshopCard'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'

/**
 * The workshop card on `/admin/workshops`. One card per workshop in a grid of
 * up to five; the decorator gives it the width it has in that grid on a
 * desktop, and the full width on a phone.
 *
 * Dark mode comes from `globals.theme`, which the global decorator in
 * `.storybook/preview.tsx` reads (`parameters.theme` is NOT read here).
 */

const workshop = (capacity: number) =>
  ({
    _id: 'ws-1',
    title: 'Getting Started with Kubernetes Operators',
    format: 'workshop_120',
    capacity,
    speakers: [],
  }) as unknown as ProposalWithWorkshopData

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopCard',
  component: WorkshopCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A workshop on `/admin/workshops`: its confirmed and waitlist counts, a utilization bar, and the organizer actions. A workshop with more confirmed sign-ups than seats carries an "Over capacity by N" marker (#1361); a full one does not.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full sm:w-72">
        <Story />
      </div>
    ),
  ],
  args: {
    waitlistCount: 4,
    onViewConfirmed: fn(),
    onViewWaitlist: fn(),
    onAddParticipant: fn(),
    onEditCapacity: fn(),
    onAnnounce: fn(),
  },
} satisfies Meta<typeof WorkshopCard>

export default meta
type Story = StoryObj<typeof meta>

const dark = { theme: 'dark' }
const phone = { viewport: { defaultViewport: 'phone' } }

export const Default: Story = {
  args: { workshop: workshop(30), confirmedCount: 12 },
}

/** Every seat taken, none over: the bar is full and there is no marker. */
export const AtCapacity: Story = {
  args: { workshop: workshop(30), confirmedCount: 30 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('30/30')).toBeInTheDocument()
    await expect(canvas.getByText('(100%)')).toBeInTheDocument()
    await expect(canvas.queryByText(/over capacity/i)).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-over-capacity]')).toBeNull()
  },
}
export const AtCapacityDark: Story = { ...AtCapacity, globals: dark }

/** An organizer admitted two past capacity (#1344): the card says so. */
export const OverCapacity: Story = {
  args: { workshop: workshop(30), confirmedCount: 32 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Over capacity by 2')).toBeInTheDocument()
    await expect(canvas.getByText('(107%)')).toBeInTheDocument()
    // The fill is marked over capacity by the same decision that colours it red.
    await expect(
      canvasElement.querySelector('[data-over-capacity]'),
    ).not.toBeNull()
  },
}
export const OverCapacityDark: Story = { ...OverCapacity, globals: dark }
export const OverCapacityMobile: Story = { ...OverCapacity, parameters: phone }

/** Canceled: never listed, but its sign-ups are still counted. */
export const Canceled: Story = {
  args: {
    workshop: {
      ...workshop(30),
      status: 'canceled',
    } as ProposalWithWorkshopData,
    confirmedCount: 12,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Canceled')).toBeInTheDocument()
    await expect(canvas.getByText('12/30')).toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: /add participant/i }),
    ).not.toBeInTheDocument()
  },
}
export const CanceledDark: Story = { ...Canceled, globals: dark }
