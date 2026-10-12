import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { withPortalTheme } from '@/lib/storybook'
import { SignupDetailsModal } from './SignupDetailsModal'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { Level } from '@/lib/proposal/types'

const baseSignup = {
  _rev: '1',
  _type: 'workshopSignup' as const,
  _createdAt: '2025-01-10T08:00:00Z',
  _updatedAt: '2025-01-10T08:00:00Z',
  userWorkOSId: 'user_abc',
  experienceLevel: Level.intermediate,
  operatingSystem: 'macos' as const,
  workshop: { _type: 'reference' as const, _ref: 'ws-1' },
  conference: { _type: 'reference' as const, _ref: 'conf-1' },
  signedUpAt: '2025-01-10T08:00:00Z',
}

const confirmedSignups = [
  {
    ...baseSignup,
    _id: 'signup-1',
    userName: 'Alice Johnson',
    userEmail: 'alice@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    confirmedAt: '2025-01-11T10:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-2',
    userName: 'Bob Smith',
    userEmail: 'bob@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    _createdAt: '2025-01-11T09:00:00Z',
    signedUpAt: '2025-01-11T09:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-3',
    userName: 'Charlie Brown',
    userEmail: 'charlie@example.com',
    status: WorkshopSignupStatus.CONFIRMED,
    _createdAt: '2025-01-12T14:00:00Z',
    signedUpAt: '2025-01-12T14:00:00Z',
  },
]

const waitlistSignups = [
  {
    ...baseSignup,
    _id: 'signup-4',
    userName: 'Diana Prince',
    userEmail: 'diana@example.com',
    status: WorkshopSignupStatus.WAITLIST,
    _createdAt: '2025-01-13T11:00:00Z',
    signedUpAt: '2025-01-13T11:00:00Z',
  },
  {
    ...baseSignup,
    _id: 'signup-5',
    userName: 'Eve Torres',
    userEmail: 'eve@example.com',
    status: WorkshopSignupStatus.WAITLIST,
    _createdAt: '2025-01-14T16:00:00Z',
    signedUpAt: '2025-01-14T16:00:00Z',
  },
]

// DARK MODE comes from the GLOBAL decorator (`globals.theme`); this file has no
// decorator of its own reading `parameters.theme`. The modal renders through a
// portal on `document.body`, outside that decorator's `.dark` wrapper, so
// `withPortalTheme` mirrors the theme onto `<html>`. Without it a "dark" story
// here renders light.

/** Visible buttons only: each row is in the document twice, as a card and as a table row. */
const actions = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement.ownerDocument.body).queryAllByRole('button', { name })

/**
 * The PHONE layout rendered: the `<table>` half of the list (`hidden md:block`)
 * is in the document and not shown, so the rows on screen are the cards, and
 * nothing is wider than the page. At desktop width the table is the half on
 * screen and this fails.
 *
 * Call it AFTER something in the modal has been seen to be visible: while the
 * modal fades in nothing in it is visible, and "the table is not visible"
 * would pass at any width.
 */
const expectCards = async (canvasElement: HTMLElement) => {
  const document = canvasElement.ownerDocument
  const tables = [...document.querySelectorAll('table')]
  // At least one: with none, "no table is visible" would say nothing.
  await expect(tables.length).toBeGreaterThan(0)
  for (const table of tables) {
    await expect(table).not.toBeVisible()
  }
  const root = document.documentElement
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
}

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/SignupDetailsModal',
  component: SignupDetailsModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal showing a table of workshop signups filtered by status. An organizer can move a waitlisted participant to confirmed, move a confirmed participant to the waitlist (the attendee is not emailed), or delete a signup.',
      },
    },
  },
  decorators: [withPortalTheme],
  args: {
    onClose: fn(),
    onConfirmSignup: fn(),
    onMoveToWaitlist: fn(),
    onDeleteSignup: fn(),
  },
} satisfies Meta<typeof SignupDetailsModal>

export default meta
type Story = StoryObj<typeof meta>

/** Confirmed sign-ups offer "Move to waitlist", and not "Move to Confirmed". */
export const Confirmed: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    status: WorkshopSignupStatus.CONFIRMED,
    signups: confirmedSignups,
  },
  play: async ({ canvasElement }) => {
    await expect(actions(canvasElement, 'Move to waitlist')).toHaveLength(3)
    await expect(actions(canvasElement, 'Move to Confirmed')).toHaveLength(0)
  },
}

export const ConfirmedDark: Story = {
  ...Confirmed,
  globals: { theme: 'dark' },
}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing: the test runner
 * reads it and resizes the page, and its default is 1280. Without it this
 * renders the desktop table and the assertions pass for the wrong reason.
 */
export const ConfirmedMobile: Story = {
  ...Confirmed,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const buttons = actions(canvasElement, 'Move to waitlist')
    await expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      // `waitFor`: the modal fades in, and a fading element is not visible yet.
      await waitFor(() => expect(button).toBeVisible())
      // A finger-sized target, like the delete button beside it.
      await expect(
        button.getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(44)
    }
    await expectCards(canvasElement)
  },
}

/** Waitlisted sign-ups offer "Move to Confirmed", and not "Move to waitlist". */
export const Waitlist: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    status: WorkshopSignupStatus.WAITLIST,
    signups: waitlistSignups,
  },
  play: async ({ canvasElement }) => {
    await expect(actions(canvasElement, 'Move to Confirmed')).toHaveLength(2)
    await expect(actions(canvasElement, 'Move to waitlist')).toHaveLength(0)
  },
}

export const WaitlistDark: Story = {
  ...Waitlist,
  globals: { theme: 'dark' },
}

export const WaitlistMobile: Story = {
  ...Waitlist,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const buttons = actions(canvasElement, 'Move to Confirmed')
    await expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      await waitFor(() => expect(button).toBeVisible())
      // It emails the attendee at once, with no question, 8px from delete: a
      // finger-sized target matters more here than anywhere in the list.
      await expect(
        button.getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(44)
    }
    await expect(actions(canvasElement, 'Move to waitlist')).toHaveLength(0)
    await expectCards(canvasElement)
  },
}

/**
 * "Move to waitlist" asks first. The question says what the organizer cannot
 * see from the list: the attendee is not emailed, and nobody is moved up.
 */
export const MoveToWaitlistQuestion: Story = {
  ...Confirmed,
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    const first = actions(canvasElement, 'Move to waitlist')[0]
    await waitFor(() => expect(first).toBeVisible())
    await userEvent.click(first)

    const question = await page.findByRole('dialog', {
      name: 'Move to waitlist',
    })
    await expect(question).toHaveTextContent(
      'Move Alice Johnson to the waitlist for Getting Started with Kubernetes?',
    )
    await expect(question).toHaveTextContent(
      'They lose their seat and get no email about it. They stay in line by sign-up date, so a capacity increase can seat them again. The seat is open to whoever signs up next.',
    )
    const keep = within(question).getByRole('button', {
      name: 'Keep confirmed',
    })
    // `waitFor`: the question fades in, and a fading element is not visible yet.
    await waitFor(() => expect(keep).toBeVisible())
    await expect(args.onMoveToWaitlist).not.toHaveBeenCalled()
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}

export const MoveToWaitlistQuestionDark: Story = {
  ...MoveToWaitlistQuestion,
  globals: { theme: 'dark' },
}

/** On a phone the question is a sheet: its two buttons are stacked, not side by side. */
export const MoveToWaitlistQuestionMobile: Story = {
  ...MoveToWaitlistQuestion,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    await MoveToWaitlistQuestion.play!(context)
    const question = within(context.canvasElement.ownerDocument.body).getByRole(
      'dialog',
      { name: 'Move to waitlist' },
    )
    const move = within(question).getByRole('button', {
      name: 'Move to waitlist',
    })
    const keep = within(question).getByRole('button', {
      name: 'Keep confirmed',
    })
    await expect(keep.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      move.getBoundingClientRect().bottom,
    )
    await expectCards(context.canvasElement)
  },
}

export const Empty: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Advanced Terraform Workshop',
    status: WorkshopSignupStatus.CONFIRMED,
    signups: [],
  },
}

export const Confirming: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Cloud Security Fundamentals',
    status: WorkshopSignupStatus.WAITLIST,
    signups: waitlistSignups,
    isConfirming: true,
  },
}

/** While a move is on its way every action in the list is off. */
export const Moving: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    status: WorkshopSignupStatus.CONFIRMED,
    signups: confirmedSignups,
    isMoving: true,
  },
  play: async ({ canvasElement }) => {
    const buttons = actions(canvasElement, 'Move to waitlist')
    await expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      await expect(button).toBeDisabled()
    }
  },
}
