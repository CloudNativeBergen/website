import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { ProposalMessagePanel } from './ProposalMessagePanel'
import type { Speaker } from '@/lib/speaker/types'

// The page-local panel opened by the "Message" action on the admin proposal
// page. `open` is a PROP (local React state in `AdminActionBar`) — there is no
// URL param to set, which is the point of the component.

/**
 * Timestamps are absolute and keyed to the frozen `beforeEach` date below (NOT
 * `Date.now()`, which is the real clock at module load and would drift the
 * rendered relative times on every capture).
 */
const NOW = new Date('2026-07-18T12:00:00Z')
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString()

const CALLER_ID = 'organizer-1'
const PROPOSAL_ID = 'talk-1'
const CONVERSATION_ID = `conversation.proposal.${PROPOSAL_ID}`

const conversationPayload = {
  conversation: {
    _id: CONVERSATION_ID,
    subject: 'Scaling Kubernetes to 10,000 nodes',
    conversationType: 'proposal',
    proposalId: PROPOSAL_ID,
    status: 'open',
  },
  participants: [
    { _id: CALLER_ID, name: 'Ola Organizer', isOrganizer: true },
    { _id: 'speaker-1', name: 'Kari Nordmann', isOrganizer: false },
  ],
  preference: { muted: false, emailOverride: 'default' },
}

const messagesPayload = [
  {
    _id: 'm2',
    authorId: 'speaker-1',
    body: 'Thanks — I have updated the abstract with the new numbers.',
    createdAt: minutesAgo(20),
  },
  {
    _id: 'm1',
    authorId: CALLER_ID,
    body: 'Could you tighten the abstract to focus on the scaling story?',
    createdAt: minutesAgo(90),
  },
]

/**
 * `hasThread: false` is the FIRST-CONTACT state: a proposal conversation is
 * created by the first send, so before then the server answers NOT_FOUND and the
 * panel must still show a live composer.
 */
const handlers = (hasThread: boolean) => [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) => {
          if (!hasThread) {
            // The untransformed tRPC error envelope (this app configures no
            // transformer — the success handlers below are equally bare).
            return {
              error: {
                message: 'Conversation not found',
                code: -32004,
                data: { code: 'NOT_FOUND', httpStatus: 404, path: proc },
              },
            }
          }
          if (proc === 'message.getConversation') {
            return { result: { data: conversationPayload } }
          }
          if (proc === 'message.listMessages') {
            return { result: { data: messagesPayload } }
          }
          return { result: { data: null } }
        }),
    ),
  ),
]

const session: Session = {
  user: { name: 'Ola Organizer', email: 'ola@example.com' },
  speaker: {
    _id: CALLER_ID,
    name: 'Ola Organizer',
    email: 'ola@example.com',
    slug: 'ola-organizer',
  } as unknown as Speaker,
  expires: '2027-01-01T00:00:00.000Z',
} as unknown as Session

const meta = {
  title: 'Components/Messaging/ProposalMessagePanel',
  component: ProposalMessagePanel,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  args: { proposalId: PROPOSAL_ID, open: true, onClose: fn() },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component:
          'Page-local side panel for replying to one proposal thread without leaving `/admin/proposals/<id>`. Thread only — no proposal card and no preview rail, because the page behind it IS the proposal. Opened from local React state by the action bar, never from a query param, and it links out to `/admin/messages/<conversationId>` for the full three-pane workspace.',
      },
    },
  },
  decorators: [
    // A HeadlessUI Dialog PORTALS to document.body — outside any wrapper div —
    // so dark mode has to be set on <html> (as next-themes does in the real
    // app) or the panel renders light on a dark page.
    (Story, ctx) => {
      const dark = Boolean(ctx.parameters.dark)
      document.documentElement.classList.toggle('dark', dark)
      return (
        <SessionProvider session={session} refetchOnWindowFocus={false}>
          <TRPCProvider>
            <div
              className={
                dark ? 'min-h-screen bg-gray-950' : 'min-h-screen bg-gray-100'
              }
            >
              <Story />
            </div>
          </TRPCProvider>
        </SessionProvider>
      )
    },
  ],
} satisfies Meta<typeof ProposalMessagePanel>

export default meta
type Story = StoryObj<typeof meta>

/** An existing thread: messages, composer, and the link out to the workspace. */
export const Open: Story = {
  parameters: { msw: { handlers: handlers(true) } },
}

export const OpenDark: Story = {
  parameters: { dark: true, msw: { handlers: handlers(true) } },
}

/**
 * First contact — nothing has been posted on this proposal yet, so the server
 * answers NOT_FOUND. It must read as a startable empty thread with a live
 * composer, never as "this conversation doesn't exist".
 */
export const FirstContact: Story = {
  parameters: { msw: { handlers: handlers(false) } },
}

/** Closed: `open={false}` renders nothing at all — no dialog, no backdrop. */
export const Closed: Story = {
  args: { open: false },
  parameters: { msw: { handlers: handlers(true) } },
}
