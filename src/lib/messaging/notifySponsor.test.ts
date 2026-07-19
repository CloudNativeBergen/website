import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (channel boundaries) --------------------------------------------

const upsertMock = vi.fn().mockResolvedValue(undefined)
const getOrganizerSpeakerIdsMock = vi.fn().mockResolvedValue(['org-1', 'org-2'])
vi.mock('@/lib/notification/sanity', () => ({
  upsertMessageNotifications: (...a: unknown[]) => upsertMock(...a),
  getOrganizerSpeakerIds: () => getOrganizerSpeakerIdsMock(),
}))

const slackMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/slack/notify', () => ({
  notifyNewSpeakerMessage: vi.fn(),
  notifySponsorMessage: (...a: unknown[]) => slackMock(...a),
}))

const activityMock = vi.fn().mockResolvedValue({ activityId: 'act-1' })
vi.mock('@/lib/sponsor-crm/activity', () => ({
  createSponsorActivity: (...a: unknown[]) => activityMock(...a),
}))

const sponsorEmailMock = vi.fn().mockResolvedValue(2)
vi.mock('./sponsorEmail', () => ({
  sendSponsorMessageEmails: (...a: unknown[]) => sponsorEmailMock(...a),
}))

// Fetch routing: author-name lookup + (empty) preference lookup.
const fetchMock = vi.fn((query: string) => {
  if (query.includes('conversationPreference')) return Promise.resolve([])
  if (query.includes('_type == "speaker"')) {
    return Promise.resolve({ name: 'Olga Organizer' })
  }
  return Promise.resolve(null)
})
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(a[0] as string) },
  clientWrite: {},
}))

import { notifySponsorMessage } from './notify'
import { sponsorConversationId } from './links'
import type { ConversationWithContext, Message } from './types'
import type { SponsorFanoutContext } from './sponsor'
import type { Conference } from '@/lib/conference/types'

const SFC = 'sfc-42'

const conference = {
  _id: 'conf-1',
  title: 'CloudNativeDay',
  organizer: 'CNB',
  sponsorEmail: 'sponsors@example.com',
  cfpEmail: 'cfp@example.com',
  city: 'Bergen',
  country: 'Norway',
  domains: ['cnd.example'],
  socialLinks: [],
} as unknown as Conference

const sfc: SponsorFanoutContext = {
  sfcId: SFC,
  sponsorName: 'Acme Corp',
  registrationToken: 'tok-123',
  contactPersons: [
    { name: 'Dana Diaz', email: 'dana@acme.test' },
    { name: 'Sam Stone', email: 'sam@acme.test' },
  ],
  conference,
}

const conversation: ConversationWithContext = {
  _id: sponsorConversationId(SFC),
  conferenceId: 'conf-1',
  conversationType: 'sponsor',
  proposalSpeakerIds: [],
  createdById: '',
  subject: 'Acme Corp',
  createdAt: '2026-07-01T00:00:00Z',
  lastMessageAt: '2026-07-01T00:00:00Z',
  participants: [
    { partyType: 'sponsor', sponsorForConferenceId: SFC },
    { partyType: 'group', group: 'organizers' },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('notifySponsorMessage — SPONSOR-authored', () => {
  const message: Message = {
    _id: 'message.1',
    conversationId: conversation._id,
    authorId: '',
    body: 'Hi organizers, a question about our booth.',
    createdAt: '2026-07-01T10:00:00Z',
    authorName: 'Dana Diaz',
    authorSponsorId: SFC,
  }

  it('hubs ALL organizers with a "(Sponsor)" title, Slacks sales, logs activity, sends NO emails', async () => {
    await notifySponsorMessage({ conversation, message, sfc })

    // HUB to both organizers, with the "(Sponsor)" author suffix + admin link.
    expect(upsertMock).toHaveBeenCalledOnce()
    const items = upsertMock.mock.calls[0][0] as {
      recipientId: string
      authorName: string
      link: string
    }[]
    expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    expect(items[0].authorName).toBe('Dana Diaz (Sponsor)')
    expect(items[0].link).toBe(`/admin/messages/${conversation._id}`)

    // SLACK on the sales channel.
    expect(slackMock).toHaveBeenCalledOnce()

    // ACTIVITY: a system-authored `message` row.
    expect(activityMock).toHaveBeenCalledOnce()
    expect(activityMock.mock.calls[0][0]).toBe(SFC)
    expect(activityMock.mock.calls[0][1]).toBe('message')
    expect(activityMock.mock.calls[0][3]).toBe('system')

    // NO sponsor emails on a sponsor-authored message.
    expect(sponsorEmailMock).not.toHaveBeenCalled()
  })
})

describe('notifySponsorMessage — ORGANIZER-authored', () => {
  const message: Message = {
    _id: 'message.2',
    conversationId: conversation._id,
    authorId: 'org-1',
    body: 'Thanks Dana, here are the details.',
    createdAt: '2026-07-01T11:00:00Z',
  }

  it('emails ALL contacts, hubs the OTHER organizers, logs activity, does NOT Slack', async () => {
    await notifySponsorMessage({
      conversation,
      message,
      sfc,
      authorOrganizerId: 'org-1',
    })

    // EMAIL every contact person from the sponsor from-address.
    expect(sponsorEmailMock).toHaveBeenCalledOnce()
    const recipients = sponsorEmailMock.mock.calls[0][0] as { email: string }[]
    expect(recipients.map((r) => r.email).sort()).toEqual([
      'dana@acme.test',
      'sam@acme.test',
    ])
    const ctx = sponsorEmailMock.mock.calls[0][1] as { portalUrl: string }
    expect(ctx.portalUrl).toContain('/sponsor/portal/tok-123')
    expect(ctx.portalUrl).toContain('#messages')

    // HUB only the OTHER organizer (author excluded).
    expect(upsertMock).toHaveBeenCalledOnce()
    const items = upsertMock.mock.calls[0][0] as { recipientId: string }[]
    expect(items.map((i) => i.recipientId)).toEqual(['org-2'])

    // ACTIVITY attributed to the acting organizer.
    expect(activityMock).toHaveBeenCalledOnce()
    expect(activityMock.mock.calls[0][3]).toBe('org-1')

    // NO Slack on an organizer reply.
    expect(slackMock).not.toHaveBeenCalled()
  })
})
