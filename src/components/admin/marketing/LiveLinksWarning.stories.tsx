import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { LiveLinksWarning } from './LiveLinksWarning'

/**
 * The delete previews' note about short links that may already be live
 * (short-links spec §2.1's known hole, §2.7). Shown in the Task, Campaign and
 * plan delete dialogs; renders nothing at zero.
 */
const meta = {
  title: 'Systems/Marketing/Admin/LiveLinksWarning',
  component: LiveLinksWarning,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LiveLinksWarning>

export default meta
type Story = StoryObj<typeof meta>

export const OneLink: Story = {
  args: { count: 1 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('1 short link may already be shared'),
    ).toBeInTheDocument()
  },
}

export const SeveralLinks: Story = { args: { count: 3 } }

export const SeveralLinksDark: Story = {
  args: { count: 3 },
  globals: { theme: 'dark' },
}

export const None: Story = {
  args: { count: 0 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toBe('')
  },
}
