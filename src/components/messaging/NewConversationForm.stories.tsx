import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NewConversationForm } from '@/components/messaging'

const speakers = [
  {
    _id: 'speaker-1',
    name: 'Åsa Berg',
    title: 'Principal Engineer, CloudScale',
    isOrganizer: false,
    proposals: [],
  },
  {
    _id: 'speaker-2',
    name: 'Anders Nilsson',
    title: 'SRE Lead, Nordic Cloud',
    isOrganizer: false,
    proposals: [],
  },
]

const handlers = [
  http.get('/api/trpc/speaker.admin.search', () =>
    HttpResponse.json({ result: { data: speakers } }),
  ),
  http.post('/api/trpc/message.send', () =>
    HttpResponse.json({
      result: {
        data: { conversationId: 'conversation.new', message: {} },
      },
    }),
  ),
]

const meta = {
  title: 'Components/Messaging/NewConversationForm',
  component: NewConversationForm,
  parameters: { layout: 'padded', msw: { handlers } },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : ''}>
        <div className="mx-auto w-full max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof NewConversationForm>

export default meta
type Story = StoryObj<typeof meta>

/** Speaker flow — no recipient picker (the thread is implicitly about them). */
export const SpeakerForm: Story = {
  args: { basePath: '/cfp/messages' },
}

/** Organizer flow — a searchable recipient speaker picker is required. */
export const OrganizerForm: Story = {
  args: { basePath: '/admin/messages', requireRecipient: true },
}

/** Organizer flow with the recipient picker opened on a query. */
export const OrganizerPickerOpen: Story = {
  args: { basePath: '/admin/messages', requireRecipient: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText(/search speakers/i)
    await userEvent.click(input)
    await userEvent.type(input, 'a')
  },
}

export const OrganizerFormDark: Story = {
  args: { basePath: '/admin/messages', requireRecipient: true },
  parameters: { dark: true },
}

/**
 * Organizer flow with a KNOWN target (e.g. opened from a speaker-scoped admin
 * surface): the picker is replaced by a fixed recipient chip.
 */
export const FixedRecipient: Story = {
  args: {
    basePath: '/admin/messages',
    fixedRecipient: { _id: 'speaker-1', name: 'Åsa Berg' },
  },
}

/**
 * Proposal-thread mode (used by the admin SendMessageModal): no picker, no
 * subject — the message goes straight into the proposal's conversation.
 */
export const ProposalThread: Story = {
  args: {
    basePath: '/admin/messages',
    proposalId: 'proposal-1',
  },
}
