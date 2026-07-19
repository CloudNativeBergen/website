import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, userEvent, within } from 'storybook/test'
import WorkshopCard from './WorkshopCard'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { withPortalTheme } from '@/lib/storybook'

// Renders the REAL public WorkshopCard (not a mock shell). The "Register for
// Workshop" action opens the signup modal, which was converted from a
// hand-rolled portal overlay to the shared ModalShell (Headless UI a11y +
// bottom-sheet on mobile). The Signup* stories open that modal via a play
// function so the capture shows the real converted modal.

const workshop = {
  _id: 'ws-1',
  title: 'Getting Started with Kubernetes Operators',
  format: 'workshop_120',
  capacity: 30,
  signups: 12,
  available: 18,
  waitlistCount: 0,
  date: '2026-09-10',
  startTime: '2026-09-10T09:00:00Z',
  endTime: '2026-09-10T11:00:00Z',
  room: 'Workshop Room A',
  description:
    'A hands-on introduction to building Kubernetes Operators with the ' +
    'Operator SDK. Bring a laptop with kubectl and Docker installed.',
  speakers: [
    {
      _id: 'sp-1',
      name: 'Grace Hopper',
      slug: 'grace-hopper',
      title: 'Principal Engineer, CloudCorp',
      image: 'https://placehold.co/80x80/3b82f6/ffffff?text=GH',
    },
  ],
  topics: [{ _id: 't-1', title: 'Kubernetes', color: '#3b82f6' }],
} as unknown as ProposalWithWorkshopData

const meta = {
  title: 'Systems/Workshops/WorkshopCard',
  component: WorkshopCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Public workshop card with capacity/time badges and a signup flow. The "Register for Workshop" button opens the registration modal (experience level + operating system), now built on the shared ModalShell.',
      },
    },
  },
  args: {
    workshop,
    userSignups: [],
    onSignup: fn(async () => ({ success: true })),
    onCancel: fn(async () => ({ success: true })),
  },
  decorators: [withPortalTheme],
  tags: ['autodocs'],
} satisfies Meta<typeof WorkshopCard>

export default meta
type Story = StoryObj<typeof meta>

/** The card in its default, not-yet-registered state. */
export const Default: Story = {}

/**
 * Signup modal opened via the register button. On the default desktop viewport
 * the modal is a centered card; the play function queries `document.body`
 * because ModalShell portals there.
 */
export const SignupModal: Story = {
  play: async () => {
    const body = within(document.body)
    await userEvent.click(
      await body.findByRole('button', { name: /register for workshop/i }),
    )
    await body.findByText(/complete your registration/i)
  },
}

/**
 * Same signup modal at phone width — ModalShell presents it as a bottom sheet
 * (rounded top, safe-area padding, internally scrollable).
 */
export const SignupModalMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: SignupModal.play,
}
