import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { RouteError } from './RouteError'

const meta = {
  title: 'Components/RouteError',
  component: RouteError,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Body of the route error boundaries (`error.tsx`, `global-error.tsx`). Shown in place of a bare Next 500 (#825).',
      },
    },
  },
  tags: ['autodocs'],
  args: { error: new Error('boom'), reset: fn() },
} satisfies Meta<typeof RouteError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithDigest: Story = {
  args: { error: Object.assign(new Error('boom'), { digest: '2741853902' }) },
}
