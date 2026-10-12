import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
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

// --- The question before a cancel (#1331) -----------------------------------
//
// A cancel deletes the sign-up and nobody can restore it, so the card asks
// first. Four wordings: a seat or a place in line, and registration open or
// closed. DARK comes from the global decorator (`globals.theme`) through
// `withPortalTheme`, which this file already uses for its portaled modals.

const signedUp = (status: 'confirmed' | 'waitlist') => ({
  isSignedUp: true,
  userSignups: [
    {
      _id: 'signup-1',
      _type: 'workshopSignup',
      status,
      workshop: { _type: 'reference', _ref: 'ws-1' },
    },
  ] as never,
})

/** Press the card's button and read the question it asks. Nothing is cancelled. */
const asks =
  (button: string, title: string, words: string): Story['play'] =>
  async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: button }),
    )

    const question = await body.findByRole('dialog', { name: title })
    await expect(question).toHaveTextContent(words)
    // `waitFor`: the question fades in, and a fading element is not visible yet.
    await waitFor(() =>
      expect(
        within(question).getByRole('button', { name: button }),
      ).toBeVisible(),
    )
    await expect(args.onCancel).not.toHaveBeenCalled()
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  }

/**
 * The same, at PHONE width: the question is a sheet with its two buttons
 * stacked. `defaultViewport` is load-bearing: the test runner resizes the page
 * from it, and at its default 1280 these assertions fail.
 */
const asksOnAPhone =
  (button: string, keep: string, title: string, words: string): Story['play'] =>
  async (context) => {
    await asks(button, title, words)!(context)
    const document = context.canvasElement.ownerDocument
    await expect(document.defaultView!.innerWidth).toBeLessThan(640)
    const question = within(document.body).getByRole('dialog', { name: title })
    await expect(
      within(question)
        .getByRole('button', { name: keep })
        .getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(
      within(question)
        .getByRole('button', { name: button })
        .getBoundingClientRect().bottom,
    )
  }

const SEAT_OPEN = [
  'Cancel Registration',
  'Cancel your registration?',
  'You give up your seat in Getting Started with Kubernetes Operators. You can register again while registration is open, but the seat may be taken by then.',
] as const
const SEAT_CLOSED = [
  'Cancel Registration',
  'Cancel your registration?',
  'You give up your seat in Getting Started with Kubernetes Operators. Registration has closed, so you will not be able to register again.',
] as const
const LINE_OPEN = [
  'Leave Waitlist',
  'Leave the waitlist?',
  'You give up your place in line for Getting Started with Kubernetes Operators. You can join again while registration is open, but you lose the place you have now.',
] as const
const LINE_CLOSED = [
  'Leave Waitlist',
  'Leave the waitlist?',
  'You give up your place in line for Getting Started with Kubernetes Operators. Registration has closed, so you will not be able to join again.',
] as const

const phone = { viewport: { defaultViewport: 'phone' } }
const dark = { theme: 'dark' }

/** A confirmed seat, registration open: no promise that the seat will still be there. */
export const CancelQuestion: Story = {
  args: signedUp('confirmed'),
  play: asks(...SEAT_OPEN),
}
export const CancelQuestionDark: Story = { ...CancelQuestion, globals: dark }
export const CancelQuestionMobile: Story = {
  ...CancelQuestion,
  parameters: phone,
  play: asksOnAPhone(SEAT_OPEN[0], 'Keep My Seat', SEAT_OPEN[1], SEAT_OPEN[2]),
}

/** A confirmed seat, registration closed: there is no signing up again. */
export const CancelQuestionRegistrationClosed: Story = {
  args: { ...signedUp('confirmed'), registrationClosed: true },
  play: asks(...SEAT_CLOSED),
}
export const CancelQuestionRegistrationClosedDark: Story = {
  ...CancelQuestionRegistrationClosed,
  globals: dark,
}
export const CancelQuestionRegistrationClosedMobile: Story = {
  ...CancelQuestionRegistrationClosed,
  parameters: phone,
  play: asksOnAPhone(
    SEAT_CLOSED[0],
    'Keep My Seat',
    SEAT_CLOSED[1],
    SEAT_CLOSED[2],
  ),
}

/** A place on the waitlist, registration open. */
export const LeaveWaitlistQuestion: Story = {
  args: signedUp('waitlist'),
  play: asks(...LINE_OPEN),
}
export const LeaveWaitlistQuestionDark: Story = {
  ...LeaveWaitlistQuestion,
  globals: dark,
}
export const LeaveWaitlistQuestionMobile: Story = {
  ...LeaveWaitlistQuestion,
  parameters: phone,
  play: asksOnAPhone(
    LINE_OPEN[0],
    'Stay on Waitlist',
    LINE_OPEN[1],
    LINE_OPEN[2],
  ),
}

/** A place on the waitlist, registration closed. */
export const LeaveWaitlistQuestionRegistrationClosed: Story = {
  args: { ...signedUp('waitlist'), registrationClosed: true },
  play: asks(...LINE_CLOSED),
}
export const LeaveWaitlistQuestionRegistrationClosedDark: Story = {
  ...LeaveWaitlistQuestionRegistrationClosed,
  globals: dark,
}
export const LeaveWaitlistQuestionRegistrationClosedMobile: Story = {
  ...LeaveWaitlistQuestionRegistrationClosed,
  parameters: phone,
  play: asksOnAPhone(
    LINE_CLOSED[0],
    'Stay on Waitlist',
    LINE_CLOSED[1],
    LINE_CLOSED[2],
  ),
}
