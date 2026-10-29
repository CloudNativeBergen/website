import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { withPortalTheme } from '@/lib/storybook'
import { ConfirmBeyondCapacityModal } from './ConfirmBeyondCapacityModal'

// DARK MODE comes from the GLOBAL decorator (`globals.theme`); this file has no
// decorator of its own reading `parameters.theme`. The modal renders through a
// portal on `document.body`, outside that decorator's `.dark` wrapper, so
// `withPortalTheme` mirrors the theme onto `<html>`. Without it a "dark" story
// here renders light.

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/ConfirmBeyondCapacityModal',
  component: ConfirmBeyondCapacityModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The question an organizer is asked when "Move to Confirmed" would take a full workshop past capacity (#1358). The count shown is the one the server refused on, now, not the one the list showed. "Confirm beyond capacity" sends the confirm again, accepting exactly that count.',
      },
    },
  },
  decorators: [withPortalTheme],
  args: {
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ConfirmBeyondCapacityModal>

export default meta
type Story = StoryObj<typeof meta>

const refusal = {
  signupId: 'signup-4',
  userName: 'Diana Prince',
  workshopId: 'ws-1',
  workshopTitle: 'Getting Started with Kubernetes',
  seatsTaken: 30,
  capacity: 30,
  after: 31,
  changed: false,
}

const body = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body)

/** Full: 30 of 30, and confirming goes one seat past. */
export const Full: Story = {
  args: { refusal },
  play: async ({ canvasElement, args }) => {
    const dialog = body(canvasElement)
    await waitFor(() =>
      expect(dialog.getByText('Workshop is full')).toBeVisible(),
    )
    await expect(
      dialog.getByText(
        'Getting Started with Kubernetes has 30 of 30 seats taken. Confirming Diana Prince goes 1 seat past capacity.',
      ),
    ).toBeVisible()
    const confirm = dialog.getByRole('button', {
      name: 'Confirm beyond capacity',
    })
    // The second tap of a double tap, from the row's button that sat where
    // this one is: ignored, like the move and delete questions' buttons.
    await expect(confirm).toHaveAttribute('aria-disabled', 'true')
    confirm.click()
    await expect(args.onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'))
    confirm.click()
    await expect(args.onConfirm).toHaveBeenCalledTimes(1)
  },
}

export const FullDark: Story = {
  ...Full,
  globals: { theme: 'dark' },
}

/**
 * The organizer accepted 31; a seat changed hands before it landed, and the
 * server refused again on 31 of 30. The question says the numbers changed.
 */
export const Changed: Story = {
  args: {
    refusal: { ...refusal, seatsTaken: 31, after: 32, changed: true },
  },
  play: async ({ canvasElement }) => {
    const dialog = body(canvasElement)
    await waitFor(() => expect(dialog.getByText('Still full')).toBeVisible())
    await expect(
      dialog.getByText(
        'The seats changed while you decided. Getting Started with Kubernetes has 31 of 30 seats taken. Confirming Diana Prince goes 2 seats past capacity.',
      ),
    ).toBeVisible()
  },
}

export const ChangedDark: Story = {
  ...Changed,
  globals: { theme: 'dark' },
}

/** Sending: both buttons off until the server answers. */
export const Sending: Story = {
  args: { refusal, isLoading: true },
  play: async ({ canvasElement }) => {
    const dialog = body(canvasElement)
    await waitFor(() =>
      expect(
        dialog.getByRole('button', { name: 'Keep on waitlist' }),
      ).toBeDisabled(),
    )
  },
}

/**
 * The phone case, pinned: `defaultViewport` is load-bearing, the test runner
 * reads it and resizes the page (its default is 1280). The primary action is
 * on top and nothing is wider than the page.
 */
export const FullMobile: Story = {
  ...Full,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const dialog = body(canvasElement)
    await waitFor(() =>
      expect(dialog.getByText('Workshop is full')).toBeVisible(),
    )
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
    const confirm = dialog.getByRole('button', {
      name: 'Confirm beyond capacity',
    })
    const keep = dialog.getByRole('button', { name: 'Keep on waitlist' })
    await expect(confirm.getBoundingClientRect().top).toBeLessThan(
      keep.getBoundingClientRect().top,
    )
  },
}
