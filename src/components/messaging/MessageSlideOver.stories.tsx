import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { MessageSlideOver } from './MessageSlideOver'
import type { Speaker } from '@/lib/speaker/types'

// The layout-wide slide-over mounted by AdminLayout. It is driven ENTIRELY by
// `?messageId=` — there is no `open` prop — so each story sets the query via the
// nextjs navigation mock, exactly as a real admin route would after
// `router.push('<route>?messageId=…')`.

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const CALLER_ID = 'organizer-1'
const CONVERSATION_ID = 'conversation.proposal.talk-1'

const conversationPayload = (conversationType: 'proposal' | 'general') => ({
  conversation: {
    _id: CONVERSATION_ID,
    subject: 'Scaling Kubernetes to 10,000 nodes',
    conversationType,
    proposalId: conversationType === 'proposal' ? 'talk-1' : undefined,
  },
  participants: [
    { _id: CALLER_ID, name: 'Ola Organizer', isOrganizer: true },
    { _id: 'speaker-1', name: 'Kari Nordmann', isOrganizer: false },
  ],
  preference: { muted: false, emailOverride: 'default' },
})

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

const proposalPayload = {
  _id: 'talk-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-02T00:00:00Z',
  title: 'Scaling Kubernetes to 10,000 nodes',
  description: [],
  language: 'en',
  format: 'presentation_45',
  level: 'intermediate',
  audiences: ['developer'],
  status: 'confirmed',
  outline: '',
  topics: [],
  tos: true,
  speakers: [
    {
      _id: 'speaker-1',
      name: 'Kari Nordmann',
      email: 'kari@example.com',
      slug: 'kari-nordmann',
    },
  ],
  attachments: [],
  reviews: [],
}

const handlersFor = (conversationType: 'proposal' | 'general') => [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) => {
          if (proc === 'message.getConversation') {
            return { result: { data: conversationPayload(conversationType) } }
          }
          if (proc === 'message.listMessages') {
            return { result: { data: messagesPayload } }
          }
          if (proc === 'proposal.admin.getById') {
            return { result: { data: proposalPayload } }
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
  title: 'Components/Messaging/MessageSlideOver',
  component: MessageSlideOver,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Layout-wide slide-over for reading one conversation without leaving the current admin page. Mounted once by AdminLayout and opened purely by adding `?messageId=<conversationId>` to any concrete admin route. Proposal threads get a proposal preview rail alongside the thread. It is additive: the canonical deep links from `conversationLinkPath()` still point at the full pages.',
      },
    },
  },
  decorators: [
    // The slide-over is a Headless UI Dialog, so it PORTALS to document.body —
    // outside any wrapper div. Dark mode therefore has to be set on <html> (as
    // next-themes does in the real app) or the panel renders light on a dark page.
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
} satisfies Meta<typeof MessageSlideOver>

export default meta
type Story = StoryObj<typeof meta>

const navigation = {
  appDirectory: true,
  navigation: {
    pathname: '/admin/proposals/talk-1',
    query: { messageId: CONVERSATION_ID },
    push: fn(),
  },
}

/** A proposal thread: the thread on the left, the proposal preview rail on the right. */
export const ProposalThread: Story = {
  parameters: {
    nextjs: navigation,
    msw: { handlers: handlersFor('proposal') },
  },
}

/** A general thread — no proposal, so the preview rail is absent and the thread is full width. */
export const GeneralThread: Story = {
  parameters: {
    nextjs: navigation,
    msw: { handlers: handlersFor('general') },
  },
}

/** Closed: without `?messageId=` the component renders nothing at all. */
export const Closed: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/admin/proposals/talk-1', push: fn() },
    },
    msw: { handlers: handlersFor('proposal') },
  },
}

export const ProposalThreadDark: Story = {
  parameters: {
    dark: true,
    nextjs: navigation,
    msw: { handlers: handlersFor('proposal') },
  },
}
