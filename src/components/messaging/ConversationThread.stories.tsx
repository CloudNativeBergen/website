import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { mockDateBeforeEach } from '@/lib/storybook'
import {
  ConversationThreadView,
  type DisplayMessage,
} from '@/components/messaging'
import type { ConversationPreference } from '@/lib/messaging/types'

// createdAt values are computed relative to RENDER time so the compact
// relative-time labels are deterministic under the pinned Date below.
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const makeMessages = (): DisplayMessage[] => [
  {
    id: 'm1',
    authorName: 'Program Committee',
    isOrganizer: true,
    isOwn: false,
    body: 'Hi! Thanks for submitting "Scaling Kubernetes to 10,000 nodes". We loved the topic and have a couple of small questions before the review.',
    createdAt: minutesAgo(180),
  },
  {
    id: 'm2',
    authorName: 'Åsa Berg',
    isOrganizer: false,
    isOwn: true,
    body: 'Thanks so much! Happy to help — ask away.',
    createdAt: minutesAgo(120),
  },
  {
    id: 'm3',
    authorName: 'Program Committee',
    isOrganizer: true,
    isOwn: false,
    body: 'Could you shorten the abstract to about three sentences so it fits the printed programme?',
    createdAt: minutesAgo(28),
  },
]

// A long back-and-forth history, oldest-first, for verifying that the thread
// opens scrolled to the NEWEST message rather than the top.
const makeLongHistory = (): DisplayMessage[] =>
  Array.from({ length: 24 }, (_, i) => {
    const organizer = i % 2 === 0
    return {
      id: `h${i}`,
      authorName: organizer ? 'Program Committee' : 'Åsa Berg',
      isOrganizer: organizer,
      isOwn: !organizer,
      body: organizer
        ? `Follow-up point ${i + 1}: could you clarify the section on autoscaling and node pools?`
        : `Reply ${i + 1}: sure — I have updated the abstract and outline accordingly.`,
      createdAt: minutesAgo((24 - i) * 15),
    }
  })

const defaultPreference: ConversationPreference = {
  muted: false,
  emailOverride: 'default',
}

const meta = {
  title: 'Components/Messaging/ConversationThread',
  component: ConversationThreadView,
  // AGENTS.md deterministic-dates rule: pin Date so relative-time labels are
  // fixed for visual snapshots.
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'padded' },
  args: {
    onSend: fn(),
    onComposingChange: fn(),
    onSetMuted: fn(),
    onSetEmailOverride: fn(),
    emptyText: 'Start the conversation with the organizers.',
  },
  decorators: [
    // `.dark` is applied at the OUTERMOST node (via `parameters.dark`) so every
    // `dark:` variant inside the card activates for the dark capture.
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : ''}>
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ConversationThreadView>

export default meta
type Story = StoryObj<typeof meta>

/** A proposal thread with organizer and own messages, plus the prefs bar. */
export const WithMessages: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
  },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/** The proposal-mount empty state before anyone has posted (composer shows). */
export const Empty: Story = {
  args: {
    messages: [],
    emptyText: 'Start the conversation with the organizers.',
    // Mirrors the real proposal mount: no prefs/header until the thread exists.
    onSetMuted: undefined,
  },
}

/** Muted conversation with email delivery forced on. */
export const MutedWithEmailOn: Story = {
  args: {
    messages: [],
    subject: 'Travel reimbursement question',
    preference: { muted: true, emailOverride: 'on' },
  },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/** Loading skeletons while the first page fetches. */
export const Loading: Story = {
  args: { messages: [], isLoading: true },
}

/** Older messages remain — a "Show earlier messages" control is offered. */
export const HasMore: Story = {
  args: { messages: [], hasMore: true, preference: defaultPreference },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/** Dark theme, with messages. */
export const WithMessagesDark: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
  },
  parameters: { dark: true },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/** Dark theme, empty state. */
export const EmptyDark: Story = {
  args: {
    messages: [],
    emptyText: 'Start the conversation with the organizers.',
    onSetMuted: undefined,
  },
  parameters: { dark: true },
}

/**
 * The last send failed: an inline error sits above the composer, the drafted
 * text is preserved in the textarea, and a Retry affordance re-submits it.
 */
export const SendError: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
    sendError: true,
  },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/** Dark theme, send-error state. */
export const SendErrorDark: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
    sendError: true,
  },
  parameters: { dark: true },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/**
 * A long history: the scroll container should open pinned to the NEWEST message
 * (bottom), not the oldest (top).
 */
export const LongHistory: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
  },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeLongHistory()} />
  ),
}

/** Dark theme, long history (scroll-to-newest verification). */
export const LongHistoryDark: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
  },
  parameters: { dark: true },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeLongHistory()} />
  ),
}

/**
 * Impersonation read-only mode: the composer is replaced by a subtle notice and
 * the preferences bar is disabled — an admin viewing as a speaker cannot post
 * or mutate preferences as them.
 */
export const ReadOnlyImpersonation: Story = {
  args: {
    messages: [],
    subject: 'Travel reimbursement question',
    preference: defaultPreference,
    readOnly: true,
  },
  render: (args) => (
    <ConversationThreadView {...args} messages={makeMessages()} />
  ),
}

/**
 * The standalone thread page layout (fillHeight) with a SHORT thread: the card
 * must size to its content — composer directly under the last message — and
 * NOT stretch to fill the viewport-height container (the maintainer-reported
 * "unnecessarily high" regression). The wrapper mimics the message pages'
 * h-[100dvh] column at a fixed capture height.
 */
export const FillHeightShortThread: Story = {
  args: {
    messages: [],
    subject: 'Test',
    preference: defaultPreference,
    fillHeight: true,
  },
  render: (args) => (
    <div className="flex h-[760px] flex-col">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <ConversationThreadView
          {...args}
          messages={makeMessages().slice(0, 2)}
        />
      </div>
    </div>
  ),
}

/**
 * fillHeight with a LONG thread: the card shrinks to the container, the list
 * scrolls (opens pinned to newest) and the composer stays pinned at the bottom.
 */
export const FillHeightLongThread: Story = {
  args: {
    messages: [],
    subject: 'Scaling Kubernetes to 10,000 nodes',
    preference: defaultPreference,
    fillHeight: true,
  },
  render: (args) => (
    <div className="flex h-[760px] flex-col">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <ConversationThreadView {...args} messages={makeLongHistory()} />
      </div>
    </div>
  ),
}
