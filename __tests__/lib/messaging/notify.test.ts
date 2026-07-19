/**
 * @vitest-environment node
 *
 * Unit tests for the messaging fan-out (src/lib/messaging/notify.ts):
 * - HUB items are per-recipient (organizer → /admin link, speaker → /cfp link);
 * - muted recipients are excluded from every channel;
 * - EMAIL fires for recipients whose effective email pref is ON (M4: the
 *   speaker-level default is ENABLED unless explicitly false);
 * - SLACK fires only when the author is NOT an organizer;
 * - the fan-out NEVER throws (never-fail contract).
 *
 * The pure helpers (resolveRecipients / conversationLinkPath) run for real; only
 * the IO boundaries (hub write, preference read, email, slack) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(async () => {}),
  getOrganizerSpeakerIds: vi.fn(async () => ['org-1']),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { transaction: vi.fn(), create: vi.fn() },
}))

vi.mock('@/lib/messaging/email', () => ({
  sendMessageEmails: vi.fn(async () => 1),
}))

vi.mock('@/lib/slack/notify', () => ({
  notifyNewSpeakerMessage: vi.fn(async () => {}),
}))

vi.mock('@/lib/messaging/sanity', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/messaging/sanity')>()
  return {
    ...actual,
    getConversationPreferencesFor: vi.fn(async () => new Map()),
  }
})

import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { getConversationPreferencesFor } from '@/lib/messaging/sanity'
import { sendMessageEmails } from '@/lib/messaging/email'
import { notifyNewSpeakerMessage } from '@/lib/slack/notify'
import { notifyNewMessage } from '@/lib/messaging/notify'
import type { NotificationInput } from '@/lib/notification/types'
import type { ConversationWithContext, Message } from '@/lib/messaging/types'
import type { Conference } from '@/lib/conference/types'

type LooseMock = ReturnType<typeof vi.fn>
const createMock = createNotifications as unknown as LooseMock
const organizersMock = getOrganizerSpeakerIds as unknown as LooseMock
const fetchMock = (clientReadUncached as unknown as { fetch: LooseMock }).fetch
const prefsMock = getConversationPreferencesFor as unknown as LooseMock
const emailMock = sendMessageEmails as unknown as LooseMock
const slackMock = notifyNewSpeakerMessage as unknown as LooseMock

const proposalConv: ConversationWithContext = {
  _id: 'conversation.proposal.prop-1',
  conferenceId: 'conf-1',
  conversationType: 'proposal',
  proposalId: 'prop-1',
  proposalTitle: 'My Talk',
  proposalSpeakerIds: ['sp-1', 'sp-2'],
  createdById: 'sp-1',
  subject: 'My Talk',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

const message: Message = {
  _id: 'message.1',
  conversationId: proposalConv._id,
  authorId: 'sp-1',
  body: 'Hello there, this is the body',
  createdAt: '2026-01-02T00:00:00.000Z',
}

const conference = {
  _id: 'conf-1',
  title: 'CNDN',
  organizer: 'CNDN',
  cfpEmail: 'cfp@cndn.no',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-01',
  domains: ['cndn.no'],
  socialLinks: [],
} as unknown as Conference

const speakerRows = [
  {
    _id: 'sp-1',
    name: 'Alice',
    email: 'alice@x.no',
    messagingEmailDefault: false,
  },
  { _id: 'sp-2', name: 'Bob', email: 'bob@x.no', messagingEmailDefault: true },
  {
    _id: 'org-1',
    name: 'Olga',
    email: 'olga@x.no',
    messagingEmailDefault: false,
  },
]

const lastItems = (): NotificationInput[] =>
  createMock.mock.calls[
    createMock.mock.calls.length - 1
  ][0] as NotificationInput[]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  organizersMock.mockResolvedValue(['org-1'])
  fetchMock.mockResolvedValue(speakerRows)
  prefsMock.mockResolvedValue(new Map())
  emailMock.mockResolvedValue(1)
})

describe('HUB fan-out — per-recipient links, actor excluded', () => {
  it('emits message_received to each recipient with an audience-specific link', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    // Author (sp-1) excluded; recipients are org-1 and sp-2.
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'sp-2'])

    const byId = Object.fromEntries(items.map((i) => [i.recipientId, i]))
    expect(byId['org-1'].link).toBe('/admin/proposals/prop-1#messages')
    expect(byId['sp-2'].link).toBe('/cfp/proposal/prop-1#messages')

    for (const item of items) {
      expect(item.notificationType).toBe('message_received')
      expect(item.title).toBe('New message from Alice')
      expect(item.actorId).toBe('sp-1')
      expect(item.relatedProposalId).toBe('prop-1')
      expect(item.message).toContain('Hello there')
    }
  })
})

describe('muting — excluded from every channel', () => {
  it('drops a muted recipient from the hub items', async () => {
    prefsMock.mockResolvedValue(
      new Map([['org-1', { muted: true, emailOverride: 'default' }]]),
    )

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    const items = lastItems()
    expect(items.map((i) => i.recipientId)).toEqual(['sp-2'])
  })
})

describe('EMAIL — on by default, explicit opt-out wins', () => {
  it('emails only recipients whose effective pref is ON', async () => {
    // sp-2 has messagingEmailDefault true; org-1 is EXPLICITLY false (opt-out).
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(emailMock).toHaveBeenCalledTimes(1)
    const [recipients] = emailMock.mock.calls[0]
    expect(recipients.map((r: { email: string }) => r.email)).toEqual([
      'bob@x.no',
    ])
    // Speaker recipient → absolute cfp link.
    expect(recipients[0].replyUrl).toBe(
      'https://cndn.no/cfp/proposal/prop-1#messages',
    )
  })

  it("respects a per-conversation 'on' override even when the speaker default is off", async () => {
    prefsMock.mockResolvedValue(
      new Map([['org-1', { muted: false, emailOverride: 'on' }]]),
    )

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    const [recipients] = emailMock.mock.calls[0]
    // org-1 forced on, plus sp-2 default-on.
    expect(recipients.map((r: { email: string }) => r.email).sort()).toEqual([
      'bob@x.no',
      'olga@x.no',
    ])
  })

  it('emails a recipient whose speaker doc has NO messagingEmailDefault field (absent = enabled)', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'sp-1', name: 'Alice', email: 'alice@x.no' },
      // No messagingEmailDefault on sp-2: M4 absent-means-enabled.
      { _id: 'sp-2', name: 'Bob', email: 'bob@x.no' },
      {
        _id: 'org-1',
        name: 'Olga',
        email: 'olga@x.no',
        messagingEmailDefault: false,
      },
    ])

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(emailMock).toHaveBeenCalledTimes(1)
    const [recipients] = emailMock.mock.calls[0]
    expect(recipients.map((r: { email: string }) => r.email)).toEqual([
      'bob@x.no',
    ])
  })

  it("respects a per-conversation 'off' override even when the speaker default is on", async () => {
    prefsMock.mockResolvedValue(
      new Map([['sp-2', { muted: false, emailOverride: 'off' }]]),
    )

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    // sp-2 default-on is overridden off; org-1 remains explicitly opted out.
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('sends no email when every recipient has explicitly opted out', async () => {
    fetchMock.mockResolvedValue([
      {
        _id: 'sp-1',
        name: 'Alice',
        email: 'alice@x.no',
        messagingEmailDefault: false,
      },
      {
        _id: 'sp-2',
        name: 'Bob',
        email: 'bob@x.no',
        messagingEmailDefault: false,
      },
      {
        _id: 'org-1',
        name: 'Olga',
        email: 'olga@x.no',
        messagingEmailDefault: false,
      },
    ])

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(emailMock).not.toHaveBeenCalled()
  })
})

describe('SLACK — speaker-authored only', () => {
  it('posts to Slack when the author is NOT an organizer', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })
    expect(slackMock).toHaveBeenCalledTimes(1)
    const [payload] = slackMock.mock.calls[0]
    expect(payload.authorName).toBe('Alice')
    expect(payload.adminPath).toBe('/admin/proposals/prop-1#messages')
  })

  it('does NOT post to Slack when an organizer authored the message', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message: { ...message, authorId: 'org-1' },
      authorId: 'org-1',
      conference,
    })
    expect(slackMock).not.toHaveBeenCalled()
  })
})

describe('never-fail contract', () => {
  it('resolves (and logs) when a dependency throws', async () => {
    organizersMock.mockRejectedValue(new Error('sanity down'))

    await expect(
      notifyNewMessage({
        conversation: proposalConv,
        message,
        authorId: 'sp-1',
        conference,
      }),
    ).resolves.toBeUndefined()

    expect(createMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
