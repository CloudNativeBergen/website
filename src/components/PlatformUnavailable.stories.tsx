import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlatformUnavailable } from './PlatformUnavailable'

const meta = {
  title: 'Components/PlatformUnavailable',
  component: PlatformUnavailable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What a visitor sees when the conference read FAILED (#848). Compare with Components/PlatformLanding, which is the SUCCESSFUL "this domain has no conference" answer: that screen invites the visitor to claim the domain, and rendering it during an outage offered a live customer\'s domain to strangers. This one asserts nothing about the Host.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PlatformUnavailable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: {} }
