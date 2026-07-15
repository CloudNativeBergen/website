import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { LinkedProviders } from './LinkedProviders'

const meta = {
  title: 'Systems/CFP/LinkedProviders',
  component: LinkedProviders,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shows which OAuth providers are linked to a speaker profile (parsed from `speaker.providers[]`), highlights the provider the user is currently signed in with, and offers a "Link" action for providers that are not yet connected (identity Phase 2 self-service linking).',
      },
    },
  },
  args: {
    onLinkAction: fn(),
  },
  argTypes: {
    providers: {
      control: 'object',
      description: 'Raw `speaker.providers[]` entries, e.g. "github:123".',
    },
    currentProvider: {
      control: 'select',
      options: [undefined, 'github', 'linkedin'],
      description: 'Provider the user is currently signed in with.',
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkedProviders>

export default meta
type Story = StoryObj<typeof meta>

export const OnlyGitHubLinked: Story = {
  args: {
    providers: ['github:1234567'],
    currentProvider: 'github',
  },
}

export const OnlyLinkedInLinked: Story = {
  args: {
    providers: ['linkedin:abcdef'],
    currentProvider: 'linkedin',
  },
}

export const BothProvidersLinked: Story = {
  args: {
    providers: ['github:1234567', 'linkedin:abcdef'],
    currentProvider: 'github',
  },
}

export const NoLinkHandler: Story = {
  args: {
    providers: ['github:1234567'],
    currentProvider: 'github',
    onLinkAction: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Without an `onLinkAction` (e.g. rendered outside the profile page) the Link buttons render disabled.',
      },
    },
  },
}
