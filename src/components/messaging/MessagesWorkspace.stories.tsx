import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { MessagesWorkspace } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'
import { Format, Level, Language, Status } from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'

/**
 * `/admin/messages` as a three-pane email client.
 *
 * Every story mounts the REAL container stack (workspace → inbox → list, thread,
 * proposal pane) behind msw, because the point of the surface is how the three
 * panes share width — which a presentational fixture cannot show. The shell
 * gutter is reproduced by the decorator (`lg:pl-20` + `lg:px-8`, matching
 * `DashboardLayout`'s `<main>`) so a capture maps 1:1 to the real admin page.
 *
 * Shoot these at BOTH 393px (one pane per step) and 1280px (three panes).
 */

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const PROPOSAL_CONV = 'conversation.proposal.talk-1'
const GENERAL_CONV = 'conversation.abc123'
const CALLER_ID = 'speaker-storybook'

const makeItems = (): ConversationListItem[] => [
  {
    _id: PROPOSAL_CONV,
    conversationType: 'proposal',
    subject: 'Scaling Kubernetes to 10,000 nodes',
    proposalId: 'talk-1',
    proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
    createdAt: minutesAgo(60 * 24 * 3),
    lastMessageAt: minutesAgo(24),
    unreadCount: 2,
    lastMessage: {
      authorId: 'speaker-1',
      authorName: 'Kari Nordmann',
      excerpt: 'Any update on the review? Happy to trim the abstract.',
    },
    counterpart: { name: 'Kari Nordmann' },
    status: 'open',
    needsReply: true,
    assignedTo: { _id: 'org-1', name: 'Ola Organizer' },
    archived: false,
  },
  {
    _id: GENERAL_CONV,
    conversationType: 'general',
    subject: 'Question about speaker travel',
    createdAt: minutesAgo(60 * 24 * 2),
    lastMessageAt: minutesAgo(60 * 5),
    unreadCount: 0,
    lastMessage: {
      authorId: 'org-2',
      authorName: 'Grace Hopper',
      excerpt: 'We cover flights booked before June — send us the receipt.',
    },
    counterpart: { name: 'Grace Hopper' },
    status: 'open',
    needsReply: false,
    assignedTo: null,
    archived: false,
  },
  {
    _id: 'conversation.proposal.talk-2',
    conversationType: 'proposal',
    subject: 'Designing for Failure',
    proposalId: 'talk-2',
    proposalTitle: 'Designing for Failure',
    createdAt: minutesAgo(60 * 24 * 10),
    lastMessageAt: minutesAgo(60 * 24 * 4),
    unreadCount: 0,
    lastMessage: {
      authorId: CALLER_ID,
      authorName: 'Storybook User',
      excerpt: 'Could you keep the demo under ten minutes?',
    },
    counterpart: { name: 'Åsa Berg' },
    status: 'resolved',
    needsReply: false,
    assignedTo: null,
    archived: false,
  },
]

const conversationFor = (id: string) =>
  id === PROPOSAL_CONV
    ? {
        _id: PROPOSAL_CONV,
        conversationType: 'proposal',
        proposalId: 'talk-1',
        subject: 'Scaling Kubernetes to 10,000 nodes',
        status: 'open',
      }
    : {
        _id: GENERAL_CONV,
        conversationType: 'general',
        subject: 'Question about speaker travel',
        status: 'open',
      }

/** `message.listMessages` answers NEWEST FIRST (keyset page) — mirror that, or
 *  the thread renders the conversation upside down. */
const makeMessages = (organizerLed: boolean) => {
  const cid = organizerLed ? PROPOSAL_CONV : GENERAL_CONV
  return [
    {
      _id: 'm3',
      conversationId: cid,
      authorId: 'speaker-1',
      body: 'Perfect, thank you! Any update on the review?',
      createdAt: minutesAgo(24),
    },
    {
      _id: 'm2',
      conversationId: cid,
      authorId: CALLER_ID,
      body: 'Every room has HDMI and a wired network drop, so a live demo is fine. A recorded fallback never hurts though.',
      createdAt: minutesAgo(120),
    },
    {
      _id: 'm1',
      conversationId: cid,
      authorId: 'speaker-1',
      body: organizerLed
        ? 'Thanks for accepting the talk! One question — is the room set up for a live demo, or should I record a fallback?'
        : 'Hi! Do you cover flights booked before the confirmation email arrives?',
      createdAt: minutesAgo(180),
    },
  ]
}

const PROPOSAL = {
  _id: 'talk-1',
  _rev: 'rev-1',
  _type: 'talk',
  _createdAt: '2026-05-02T09:00:00.000Z',
  _updatedAt: '2026-06-11T09:00:00.000Z',
  title: 'Scaling Kubernetes to 10,000 nodes',
  status: Status.accepted,
  format: Format.presentation_25,
  level: Level.intermediate,
  language: Language.english,
  conference: { _id: 'conf-1', title: 'Cloud Native Days' },
  speakers: [
    {
      _id: 'speaker-1',
      name: 'Kari Nordmann',
      slug: 'kari-nordmann',
      flags: [Flags.requiresTravelFunding],
    },
  ],
  scheduleInfo: {
    date: '2026-10-27',
    trackTitle: 'Platform Engineering',
    timeSlot: { startTime: '13:20', endTime: '13:45' },
  },
}

const VIEW_COUNTS = {
  active: 8,
  needsReply: 3,
  myTeams: 0,
  unassigned: 2,
  mine: 1,
  resolved: 12,
  archived: 5,
}

/**
 * One handler answering every read the workspace makes. The comma-split mirrors
 * the batch link's URL shape so the same handler serves a batched and a single
 * request; unknown procedures answer `null` rather than 404, which keeps a
 * missing mock from looking like a broken component.
 */
const handlers = (selected: string, itemCount = 3) => [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) => {
          switch (proc) {
            case 'message.listConversations':
              return { result: { data: makeItems().slice(0, itemCount) } }
            case 'message.viewCounts':
              return { result: { data: VIEW_COUNTS } }
            case 'message.getConversation':
              return {
                result: {
                  data: {
                    conversation: conversationFor(selected),
                    participants: [
                      { _id: 'speaker-1', name: 'Kari Nordmann' },
                      {
                        _id: CALLER_ID,
                        name: 'Storybook User',
                        isOrganizer: true,
                      },
                    ],
                    preference: { muted: false, emailOverride: 'default' },
                  },
                },
              }
            case 'message.listMessages':
              return {
                result: {
                  data: makeMessages(selected === PROPOSAL_CONV),
                },
              }
            case 'proposal.admin.getById':
              return { result: { data: PROPOSAL } }
            default:
              return { result: { data: null } }
          }
        }),
    ),
  ),
  // Mark-read fires on mount; answer it so the console stays clean.
  http.post('/api/trpc/:procs', () =>
    HttpResponse.json([{ result: { data: { count: 0 } } }]),
  ),
]

const meta = {
  title: 'Systems/Messaging/MessagesWorkspace',
  component: MessagesWorkspace,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'fullscreen' },
  decorators: [
    // The admin shell's content box: `DashboardLayout`'s `<main>` gutters
    // (`lg:pl-20` for the icon rail, `px-2 sm:px-4 lg:px-8`) plus the dvh-tall
    // column that `data-shell-fit="viewport"` makes the shell become. Without
    // this the capture would give the panes ~112px more width at 1280 than the
    // real page does.
    // `TRPCProvider` (the app's BATCHING client) rather than the global
    // Storybook tRPC decorator, whose non-batching `httpLink` does not accept
    // the array-shaped msw responses these handlers return. Same choice as
    // `MessagesInbox.stories`.
    (Story, ctx) => (
      <TRPCProvider>
        <div className={ctx.parameters.dark ? 'dark' : ''}>
          {/*
           * `data-shell-fit="viewport"` marks the SHELL boundary for
           * `scripts/shoot-story.mjs`, which zeroes padding/margin on every
           * ancestor of the first such element so Storybook's own decorator
           * insets don't shrink the capture. Anchoring it here rather than
           * letting it find the workspace's own marker keeps the gutters BELOW
           * this point (`px-2 sm:px-4 lg:px-8`) intact — they are the real
           * shell's, and the workspace's mobile full-bleed cancels exactly them,
           * so a capture that flattened them would show the surface hanging 8px
           * off each edge and misreport a bug that does not exist in the app.
           *
           * `bg-white dark:bg-gray-950` is the ADMIN PAGE BACKGROUND, set once
           * on `<body>` in `src/app/layout.tsx` and inherited by every page
           * under `/admin` (`DashboardLayout`'s `<main>` paints nothing of its
           * own). This used to be `bg-gray-50` in light — a colour the admin
           * never actually shows, which manufactured a light-mode seam that
           * does not exist in the app and would equally have hidden a real one.
           * A harness that lies about the page background cannot be used to
           * judge whether the workspace sits on it.
           */}
          <div
            data-shell-fit="viewport"
            className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-gray-950"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-3 lg:py-4 lg:pl-20">
              <div className="flex min-h-0 flex-1 flex-col px-2 sm:px-4 lg:px-8">
                <Story />
              </div>
            </div>
          </div>
        </div>
      </TRPCProvider>
    ),
  ],
} satisfies Meta<typeof MessagesWorkspace>

export default meta
type Story = StoryObj<typeof meta>

/** `/admin/messages` — the list step. At lg+ the reading pane invites a choice. */
export const ListStep: Story = {
  args: {},
  parameters: { msw: { handlers: handlers(PROPOSAL_CONV) } },
}

export const ListStepDark: Story = {
  args: {},
  parameters: { dark: true, msw: { handlers: handlers(PROPOSAL_CONV) } },
}

/**
 * ONE conversation on a viewport-tall surface — the real `Needs reply` state for
 * a quiet conference, and the shape that exposed the chrome problem: everything
 * below the single row is dead space. Shoot at 393px to confirm that space reads
 * as the list surface running to the screen edges, not as an empty floating card.
 */
export const ShortList: Story = {
  args: {},
  parameters: { msw: { handlers: handlers(PROPOSAL_CONV, 1) } },
}

export const ShortListDark: Story = {
  args: {},
  parameters: { dark: true, msw: { handlers: handlers(PROPOSAL_CONV, 1) } },
}

/**
 * `/admin/messages/conversation.proposal.talk-1` — the LOAD-BEARING URL a stored
 * notification link points at. All three panes at lg+; at 393px just the thread,
 * with "Messages" back and a "Proposal" step link.
 */
export const ProposalThread: Story = {
  args: { conversationId: PROPOSAL_CONV },
  parameters: { msw: { handlers: handlers(PROPOSAL_CONV) } },
}

export const ProposalThreadDark: Story = {
  args: { conversationId: PROPOSAL_CONV },
  parameters: { dark: true, msw: { handlers: handlers(PROPOSAL_CONV) } },
}

/**
 * `?pane=proposal` — the narrow-screen proposal step. At lg+ it is
 * indistinguishable from `ProposalThread` (all three panes are already up),
 * which is exactly the intent: the param only chooses which step is on screen
 * when there is room for one.
 */
export const ProposalStep: Story = {
  args: { conversationId: PROPOSAL_CONV },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/admin/messages/${PROPOSAL_CONV}`,
        query: { pane: 'proposal' },
      },
    },
    msw: { handlers: handlers(PROPOSAL_CONV) },
  },
}

export const ProposalStepDark: Story = {
  args: { conversationId: PROPOSAL_CONV },
  parameters: {
    dark: true,
    nextjs: {
      navigation: {
        pathname: `/admin/messages/${PROPOSAL_CONV}`,
        query: { pane: 'proposal' },
      },
    },
    msw: { handlers: handlers(PROPOSAL_CONV) },
  },
}

/**
 * A GENERAL thread — no proposal, so there is no third pane and the thread takes
 * that width. Guards against a rail that renders empty rather than not at all.
 */
export const GeneralThread: Story = {
  args: { conversationId: GENERAL_CONV },
  parameters: { msw: { handlers: handlers(GENERAL_CONV) } },
}

export const GeneralThreadDark: Story = {
  args: { conversationId: GENERAL_CONV },
  parameters: { dark: true, msw: { handlers: handlers(GENERAL_CONV) } },
}
