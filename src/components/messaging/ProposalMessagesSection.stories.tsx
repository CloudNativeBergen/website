import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { ProposalMessagesSection } from '@/components/messaging'
import type { Speaker } from '@/lib/speaker/types'

// The REAL #messages card mounted on both proposal detail pages. It renders the
// container ConversationThread, so these stories exercise the actual data
// wiring (getConversation / listMessages) through msw — including the
// not-yet-created "empty thread" case where the composer still shows.

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const CALLER_ID = 'speaker-me'
const PROPOSAL_ID = 'talk-1'

/** Empty thread: the proposal conversation does not exist yet. getConversation
 * resolves to null (no prefs bar) and listMessages to an empty page, so the
 * audience-specific "start the conversation …" empty state renders with the
 * composer beneath it. */
const emptyThreadHandlers = [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) =>
          proc === 'message.listMessages'
            ? { result: { data: [] } }
            : { result: { data: null } },
        ),
    ),
  ),
]

/** A populated thread: getConversation returns the participants + the viewer's
 * preference; listMessages returns a page (newest-first, the container reverses
 * it to chat order). */
const populatedThreadHandlers = [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) => {
          if (proc === 'message.getConversation') {
            return {
              result: {
                data: {
                  conversation: {
                    _id: 'conversation.proposal.talk-1',
                    subject: 'Scaling Kubernetes to 10,000 nodes',
                  },
                  participants: [
                    {
                      _id: CALLER_ID,
                      name: 'Kari Nordmann',
                      isOrganizer: false,
                    },
                    {
                      _id: 'organizer-1',
                      name: 'Ola Organizer',
                      isOrganizer: true,
                    },
                  ],
                  preference: { muted: false, emailOverride: 'default' },
                },
              },
            }
          }
          if (proc === 'message.listMessages') {
            return {
              result: {
                data: [
                  {
                    _id: 'm2',
                    authorId: CALLER_ID,
                    body: 'Thanks — I have updated the abstract with the new numbers.',
                    createdAt: minutesAgo(20),
                  },
                  {
                    _id: 'm1',
                    authorId: 'organizer-1',
                    body: 'Could you tighten the abstract to focus on the scaling story?',
                    createdAt: minutesAgo(90),
                  },
                ],
              },
            }
          }
          return { result: { data: null } }
        }),
    ),
  ),
]

const speaker = {
  _id: CALLER_ID,
  name: 'Kari Nordmann',
  email: 'kari@example.com',
  slug: 'kari-nordmann',
} as unknown as Speaker

const session: Session = {
  user: { name: 'Kari Nordmann', email: 'kari@example.com' },
  speaker,
  expires: '2027-01-01T00:00:00.000Z',
} as unknown as Session

const meta = {
  title: 'Components/Messaging/ProposalMessagesSection',
  component: ProposalMessagesSection,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The "Messages" card anchored `#messages` on both proposal detail pages (speaker and organizer). Renders the real ConversationThread for the proposal’s deterministic thread; the composer shows even before the thread exists. Data is msw-mocked per story.',
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <SessionProvider session={session} refetchOnWindowFocus={false}>
        <TRPCProvider>
          <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : 'p-4'}>
            <div className="mx-auto w-full max-w-2xl">
              <Story />
            </div>
          </div>
        </TRPCProvider>
      </SessionProvider>
    ),
  ],
} satisfies Meta<typeof ProposalMessagesSection>

export default meta
type Story = StoryObj<typeof meta>

/** Speaker audience, empty thread — "Start the conversation with the organizers." */
export const SpeakerEmpty: Story = {
  args: { proposalId: PROPOSAL_ID, audience: 'speaker' },
  parameters: { msw: { handlers: emptyThreadHandlers } },
}

/** Organizer audience, empty thread — "Start the conversation with the speakers." */
export const OrganizerEmpty: Story = {
  args: { proposalId: PROPOSAL_ID, audience: 'organizer' },
  parameters: { msw: { handlers: emptyThreadHandlers } },
}

/** A live thread with messages from both sides (speaker view). */
export const SpeakerPopulated: Story = {
  args: { proposalId: PROPOSAL_ID, audience: 'speaker' },
  parameters: { msw: { handlers: populatedThreadHandlers } },
}

export const SpeakerEmptyDark: Story = {
  args: { proposalId: PROPOSAL_ID, audience: 'speaker' },
  parameters: { dark: true, msw: { handlers: emptyThreadHandlers } },
}

export const SpeakerPopulatedDark: Story = {
  args: { proposalId: PROPOSAL_ID, audience: 'speaker' },
  parameters: { dark: true, msw: { handlers: populatedThreadHandlers } },
}
