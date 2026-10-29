import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorsWaitingHint } from './SponsorsWaitingHint'

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/SponsorsWaitingHint',
  component: SponsorsWaitingHint,
  args: { onAdd: fn(), onDismiss: fn() },
  parameters: {
    docs: {
      description: {
        component:
          'One-time hint on /admin for organizers whose saved layout lacks the "Sponsors waiting on you" card. Adding the card or dismissing the hint hides it for good.',
      },
    },
  },
} satisfies Meta<typeof SponsorsWaitingHint>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add to dashboard' }),
    )
    await expect(args.onAdd).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}
