import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
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
    // SendMessageModal now sits on ModalShell, whose HeadlessUI Dialog portals
    // to document.body — a wrapper `.dark` class never reaches it. ModalShell
    // reads next-themes instead, so force the theme (synced to the Storybook
    // theme global) here; React context crosses the portal. Mirrors
    // CommandPalette.stories.
    (Story, ctx) => (
      <ThemeProvider
        attribute="class"
        forcedTheme={ctx.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        <NotificationProvider>
          <Story />
        </NotificationProvider>
      </ThemeProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SendMessageModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** After a successful send: confirmation with a "View conversation" link. */
export const Sent: Story = {
  play: async () => {
    // ModalShell PORTALS the dialog to document.body — the canvas element
    // no longer contains the modal content, so query the body instead.
    const body = within(document.body)
    await userEvent.type(
      await body.findByLabelText('Message'),
      'Quick heads-up about your talk slot.',
    )
    await userEvent.click(body.getByRole('button', { name: /send message/i }))
    await body.findByRole('link', { name: /view conversation/i })
  },
}
