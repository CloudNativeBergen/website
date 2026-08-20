import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ProposalMessagesLink } from './ProposalMessagesLink'

// The footer control on the ORGANIZER proposal page. It replaces the inline
// thread with an opener for the layout-wide MessageSlideOver, and keeps the
// legacy `#messages` anchor (the string stored on notification documents)
// pointing at something real.

const meta = {
  title: 'Components/Messaging/ProposalMessagesLink',
  component: ProposalMessagesLink,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/admin/proposals/talk-1',
        push: fn(),
        replace: fn(),
      },
    },
    docs: {
      description: {
        component:
          'Opens the proposal’s conversation in the layout-wide MessageSlideOver via `?messageId=`, so an organizer reads messages without losing the proposal. Also carries the `#messages` anchor id that `conversationLinkPath()` deep-links to.',
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-900 p-4' : 'p-4'}>
        <div className="mx-auto w-full max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProposalMessagesLink>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { proposalId: 'talk-1' },
}

export const Dark: Story = {
  args: { proposalId: 'talk-1' },
  parameters: { dark: true },
}
