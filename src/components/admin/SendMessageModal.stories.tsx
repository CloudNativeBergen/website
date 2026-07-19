import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SendMessageModal } from './SendMessageModal'
import { NotificationProvider } from './NotificationProvider'

const handlers = [
  http.post('/api/trpc/message.send', () =>
    HttpResponse.json({
      result: {
        data: {
          conversationId: 'conversation.proposal.proposal-1',
          message: {},
        },
      },
    }),
  ),
]

const meta = {
  title: 'Systems/Speakers/Admin/SendMessageModal',
  component: SendMessageModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The admin "Send message" modal (messaging M4): posts into the proposal conversation thread — speakers and organizers keep the exchange in one place. Replaces the old 1:1 speaker email modal; one-to-many broadcasts remain email.',
      },
    },
  },
  args: {
    proposalId: 'proposal-1',
    proposalTitle: 'Observability at the Edge: OpenTelemetry in Practice',
    onClose: fn(),
  },
  decorators: [
    (Story, ctx) => (
      <NotificationProvider>
        <div
          className={
            ctx.parameters.dark
              ? 'dark min-h-screen bg-gray-950'
              : 'min-h-screen'
          }
        >
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SendMessageModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = {
  parameters: { dark: true },
}

/** After a successful send: confirmation with a "View conversation" link. */
export const Sent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByLabelText('Message'),
      'Quick heads-up about your talk slot.',
    )
    await userEvent.click(canvas.getByRole('button', { name: /send message/i }))
    await canvas.findByRole('link', { name: /view conversation/i })
  },
}
