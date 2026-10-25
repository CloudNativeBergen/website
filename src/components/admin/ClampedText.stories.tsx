import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { FieldRow } from './FieldRow'

const LONG =
  'Cloud Native Bergen is a community conference in Bergen, Norway. Two days of talks and workshops about Kubernetes, platform engineering, observability and the people who run it all in production. Bring a jacket: it rains.'

const meta = {
  title: 'Components/Data Display/ClampedText',
  component: FieldRow,
  args: { label: 'Description', value: LONG, type: 'longtext' },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-md rounded-lg bg-white p-4 dark:bg-gray-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FieldRow>

export default meta
type Story = StoryObj<typeof meta>

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const more = await canvas.findByRole('button', { name: 'Show more' })
    await userEvent.click(more)
    await expect(
      canvas.getByRole('button', { name: 'Show less' }),
    ).toHaveAttribute('aria-expanded', 'true')
  },
}

export const Short: Story = {
  args: { value: 'A short description.' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Show more' }),
    ).toBeNull()
  },
}
