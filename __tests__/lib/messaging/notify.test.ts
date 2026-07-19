/**
 * @vitest-environment node
 *
 * Unit tests for the messaging fan-out (src/lib/messaging/notify.ts):
 * - HUB items are per-recipient COLLAPSE-UPSERT inputs (M5): one per
 *   (recipient, conversation) with an audience link (organizer → /admin,
 *   speaker → /cfp) and the raw title ingredients (authorName + subject);
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
  upsertMessageNotifications: vi.fn(async () => {}),
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
  upsertMessageNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { getConversationPreferencesFor } from '@/lib/messaging/sanity'
import { sendMessageEmails } from '@/lib/messaging/email'
import { notifyNewSpeakerMessage } from '@/lib/slack/notify'
import { notifyNewMessage } from '@/lib/messaging/notify'
import type { MessageNotificationInput } from '@/lib/notification/types'
import type { ConversationWithContext, Message } from '@/lib/messaging/types'
import type { Conference } from '@/lib/conference/types'

type LooseMock = ReturnType<typeof vi.fn>
const upsertMock = upsertMessageNotifications as unknown as LooseMock
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

const lastItems = (): MessageNotificationInput[] =>
  upsertMock.mock.calls[
    upsertMock.mock.calls.length - 1
  ][0] as MessageNotificationInput[]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  organizersMock.mockResolvedValue(['org-1'])
  fetchMock.mockResolvedValue(speakerRows)
  prefsMock.mockResolvedValue(new Map())
  emailMock.mockResolvedValue(1)
})

describe('HUB fan-out — per-recipient collapse-upsert inputs, actor excluded', () => {
  it('upserts one collapsed item per recipient with an audience-specific link', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    // Author (sp-1) excluded; recipients are org-1 and sp-2.
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'sp-2'])

    const byId = Object.fromEntries(items.map((i) => [i.recipientId, i]))
    expect(byId['org-1'].link).toBe('/admin/proposals/prop-1#messages')
    expect(byId['sp-2'].link).toBe('/cfp/proposal/prop-1#messages')

    for (const item of items) {
      // The collapse writer derives the title from the accumulated count, so
      // the fan-out passes the raw ingredients + the conversation identity.
      expect(item.conversationId).toBe('conversation.proposal.prop-1')
      expect(item.authorName).toBe('Alice')
      expect(item.subject).toBe('My Talk')
      expect(item.actorId).toBe('sp-1')
      expect(item.relatedProposalId).toBe('prop-1')
      expect(item.message).toContain('Hello there')
    }
  })

  it('threads the conversation subjectSpeakerId into hub items (S10c direct title)', async () => {
    const orgInitiated: ConversationWithContext = {
      ...proposalConv,
      _id: 'conversation.gen-1',
      conversationType: 'general',
      proposalId: undefined,
      proposalSpeakerIds: [],
      createdById: 'org-1',
      subjectSpeakerId: 'sp-2',
    }
    await notifyNewMessage({
      conversation: orgInitiated,
      message: { ...message, authorId: 'org-1' },
      authorId: 'org-1',
      conference,
    })
    const items = lastItems()
    const bob = items.find((i) => i.recipientId === 'sp-2')
    expect(bob?.subjectSpeakerId).toBe('sp-2')
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

// The org-contact copy (name === 'Organizers') and the individual-recipients
// call are two SEPARATE sendMessageEmails calls for a speaker-authored message.
type EmailRecip = {
  email: string
  name: string
  isOrganizer: boolean
  replyUrl: string
  firstContact?: boolean
}
const isOrgContactCall = (c: [EmailRecip[], unknown]) =>
  c[0].length === 1 && c[0][0].name === 'Organizers'
const individualRecipients = (): EmailRecip[] => {
  const call = emailMock.mock.calls.find(
    (c) => !isOrgContactCall(c as [EmailRecip[], unknown]),
  )
  return (call?.[0] ?? []) as EmailRecip[]
}
const orgContactRecipient = (): EmailRecip | undefined => {
  const call = emailMock.mock.calls.find((c) =>
    isOrgContactCall(c as [EmailRecip[], unknown]),
  )
  return call?.[0]?.[0] as EmailRecip | undefined
}

describe('EMAIL — audience-dependent default (S1b), thread-page links (S8)', () => {
  it('speaker recipient on by default; organizer recipient OFF by default', async () => {
    // sp-2 (speaker) messagingEmailDefault true → on; org-1 (organizer) false →
    // off (and would be off even if absent — organizers must opt IN).
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    const emails = individualRecipients().map((r) => r.email)
    expect(emails).toEqual(['bob@x.no'])
    // S8: email links point at the dedicated thread page, not the proposal
    // `#messages` fragment.
    expect(individualRecipients()[0].replyUrl).toBe(
      'https://cndn.no/cfp/messages/conversation.proposal.prop-1',
    )
  })

  it('an organizer recipient stays OFF even when messagingEmailDefault is absent (S1b opt-in)', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'sp-1', name: 'Alice', email: 'alice@x.no' },
      { _id: 'sp-2', name: 'Bob', email: 'bob@x.no' }, // speaker absent → on
      { _id: 'org-1', name: 'Olga', email: 'olga@x.no' }, // organizer absent → OFF
    ])

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    expect(individualRecipients().map((r) => r.email)).toEqual(['bob@x.no'])
  })

  it('an organizer recipient opts IN with messagingEmailDefault === true', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'sp-1', name: 'Alice', email: 'alice@x.no' },
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
        messagingEmailDefault: true, // organizer opted in
      },
    ])

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    // org opted in; sp-2 opted out. Organizer email links go to /admin thread page.
    const recips = individualRecipients()
    expect(recips.map((r) => r.email)).toEqual(['olga@x.no'])
    expect(recips[0].replyUrl).toBe(
      'https://cndn.no/admin/messages/conversation.proposal.prop-1',
    )
  })

  it("a per-conversation 'on' override pierces the organizer opt-out default", async () => {
    prefsMock.mockResolvedValue(
      new Map([['org-1', { muted: false, emailOverride: 'on' }]]),
    )

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    // org-1 forced on despite its default-off; sp-2 default-on.
    expect(
      individualRecipients()
        .map((r) => r.email)
        .sort(),
    ).toEqual(['bob@x.no', 'olga@x.no'])
  })

  it("a per-conversation 'off' override still beats a speaker's default-on", async () => {
    prefsMock.mockResolvedValue(
      new Map([['sp-2', { muted: false, emailOverride: 'off' }]]),
    )

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })

    // sp-2 off; org-1 default-off. No INDIVIDUAL recipients (org-contact still fires).
    expect(individualRecipients()).toEqual([])
  })
})

describe('EMAIL — org-contact shared copy (S1a)', () => {
  it('sends ONE organizer-variant copy to the org contact for a speaker-authored message', async () => {
    // Prefer contactEmail over cfpEmail.
    const withContact = {
      ...conference,
      contactEmail: 'hei@cndn.no',
    } as unknown as Conference

    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference: withContact,
    })

    const org = orgContactRecipient()
    expect(org).toBeDefined()
    expect(org!.email).toBe('hei@cndn.no')
    expect(org!.isOrganizer).toBe(true)
    expect(org!.firstContact).toBe(false)
    // Admin thread-page reply link (S8).
    expect(org!.replyUrl).toBe(
      'https://cndn.no/admin/messages/conversation.proposal.prop-1',
    )
  })

  it('falls back to cfpEmail when contactEmail is unset', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference, // only cfpEmail
    })
    expect(orgContactRecipient()?.email).toBe('cfp@cndn.no')
  })

  it('is MUTE-INDEPENDENT: still sent when every individual recipient is muted', async () => {
    prefsMock.mockResolvedValue(
      new Map([
        ['org-1', { muted: true, emailOverride: 'default' }],
        ['sp-2', { muted: true, emailOverride: 'default' }],
      ]),
    )
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference,
    })
    expect(individualRecipients()).toEqual([])
    expect(orgContactRecipient()?.email).toBe('cfp@cndn.no')
  })

  it('is NOT sent for an organizer-authored message', async () => {
    await notifyNewMessage({
      conversation: proposalConv,
      message: { ...message, authorId: 'org-1' },
      authorId: 'org-1',
      conference,
    })
    expect(orgContactRecipient()).toBeUndefined()
  })

  it('is skipped when neither contactEmail nor cfpEmail is set', async () => {
    const noEmails = {
      ...conference,
      cfpEmail: undefined,
      contactEmail: undefined,
    } as unknown as Conference
    await notifyNewMessage({
      conversation: proposalConv,
      message,
      authorId: 'sp-1',
      conference: noEmails,
    })
    expect(orgContactRecipient()).toBeUndefined()
  })
})

describe('EMAIL — first-contact warmer variant (S9c)', () => {
  const orgInitiatedConv: ConversationWithContext = {
    _id: 'conversation.gen-1',
    conferenceId: 'conf-1',
    conversationType: 'general',
    proposalSpeakerIds: [],
    createdById: 'org-1',
    subjectSpeakerId: 'sp-2',
    subject: 'Quick question',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-01-01T00:00:00.000Z',
  }

  it('flags firstContact for a SPEAKER recipient on an organizer-authored first message', async () => {
    // speaker rows + the message-count fetch (=== 1 → first message).
    fetchMock
      .mockResolvedValueOnce([
        {
          _id: 'org-1',
          name: 'Olga',
          email: 'olga@x.no',
          messagingEmailDefault: true,
        },
        { _id: 'sp-2', name: 'Bob', email: 'bob@x.no' },
      ])
      .mockResolvedValueOnce(1) // count() === 1

    await notifyNewMessage({
      conversation: orgInitiatedConv,
      message: {
        ...message,
        authorId: 'org-1',
        conversationId: 'conversation.gen-1',
      },
      authorId: 'org-1',
      conference,
    })

    const bob = individualRecipients().find((r) => r.email === 'bob@x.no')
    expect(bob?.firstContact).toBe(true)
  })

  it('does NOT flag firstContact once the thread already has messages', async () => {
    fetchMock
      .mockResolvedValueOnce([
        {
          _id: 'org-1',
          name: 'Olga',
          email: 'olga@x.no',
          messagingEmailDefault: true,
        },
        { _id: 'sp-2', name: 'Bob', email: 'bob@x.no' },
      ])
      .mockResolvedValueOnce(3) // count() > 1 → not first

    await notifyNewMessage({
      conversation: orgInitiatedConv,
      message: {
        ...message,
        authorId: 'org-1',
        conversationId: 'conversation.gen-1',
      },
      authorId: 'org-1',
      conference,
    })

    const bob = individualRecipients().find((r) => r.email === 'bob@x.no')
    expect(bob?.firstContact).toBe(false)
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

    expect(upsertMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
