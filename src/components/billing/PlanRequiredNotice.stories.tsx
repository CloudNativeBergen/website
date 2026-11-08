import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { PlanRequiredNotice } from './PlanRequiredNotice'

const meta = {
  title: 'Components/Feedback/PlanRequiredNotice',
  component: PlanRequiredNotice,
  parameters: { layout: 'padded' },
  args: { requiredPlan: 'basic', orgId: 'org_123', onDismiss: fn() },
} satisfies Meta<typeof PlanRequiredNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Owner: Story = { args: { isOwner: true } }
export const NonOwner: Story = { args: { isOwner: false } }
export const OwnerDark: Story = {
  args: { isOwner: true, requiredPlan: 'pro' },
  globals: { theme: 'dark' },
}
export const NonOwnerDark: Story = {
  args: { isOwner: false },
  globals: { theme: 'dark' },
}
