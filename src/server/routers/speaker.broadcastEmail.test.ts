/**
 * @vitest-environment node
 *
 * `speaker.admin.broadcastEmail` guards:
 * 1. Rejects unmerged template placeholders (only Resend contact properties
 *    `{{{FIRST_NAME}}}`, `{{{LAST_NAME}}}`, `{{{EMAIL}}}` are expanded by
 *    Resend Broadcasts at delivery time).
 * 2. Automatically syncs the confirmed speaker audience before creating the
 *    broadcast, and refuses when no confirmed speakers with email addresses
 *    exist.
 */

const h = vi.hoisted(() => ({
  getSpeakersUncached: vi.fn(),
  syncConferenceAudience: vi.fn(),
  sendBroadcastEmail: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      title: 'Cloud Native Days 2026',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'a.test',
    error: null,
    status: 'resolved',
  }),
}))

vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-A',
}))

vi.mock('@/lib/speaker/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSpeakersUncached: h.getSpeakersUncached,
}))

vi.mock('@/lib/email/audience', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  syncConferenceAudience: h.syncConferenceAudience,
}))

vi.mock('@/lib/email/broadcast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendBroadcastEmail: h.sendBroadcastEmail,
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'

const validPortableText = JSON.stringify([
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 's1',
        text: 'Hi {{{FIRST_NAME|there}}}, see you soon!',
        marks: [],
      },
    ],
  },
])

function createAdminCaller() {
  const speaker = {
    _id: 'admin-1',
    name: 'Admin Organizer',
    email: 'admin@example.test',
    is_organizer: true,
    isOrganizer: true,
    organizerOrgIds: ['org-A'],
  }
  const ctx = {
    session: {
      user: { id: 'admin-1', email: 'admin@example.test', isOrganizer: true },
      speaker,
      expires: '2099-01-01T00:00:00.000Z',
    },
    speaker,
  } as unknown as Context

  return speakerRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('speaker.admin.broadcastEmail', () => {
  it('rejects unmerged template variables before syncing or sending', async () => {
    const caller = createAdminCaller()

    await expect(
      caller.admin.broadcastEmail({
        subject: 'Welcome to {{{CONFERENCE_TITLE}}}',
        message: validPortableText,
      }),
    ).rejects.toThrow(
      'Email contains unmerged template variables ({{{CONFERENCE_TITLE}}}). Fill in the missing values or remove the placeholders before sending.',
    )

    expect(h.getSpeakersUncached).not.toHaveBeenCalled()
    expect(h.syncConferenceAudience).not.toHaveBeenCalled()
    expect(h.sendBroadcastEmail).not.toHaveBeenCalled()
  })

  it('refuses when there are no confirmed speakers with email addresses', async () => {
    h.getSpeakersUncached.mockResolvedValue({
      speakers: [
        {
          _id: 'spk-1',
          name: 'Accepted Only',
          email: 'accepted@example.test',
          proposals: [{ _id: 'p1', status: 'accepted' }],
        },
      ],
      err: null,
    })

    const caller = createAdminCaller()

    await expect(
      caller.admin.broadcastEmail({
        subject: 'Practical speaker info',
        message: validPortableText,
      }),
    ).rejects.toThrow(
      'No confirmed speakers with email addresses found for this conference.',
    )

    expect(h.syncConferenceAudience).not.toHaveBeenCalled()
    expect(h.sendBroadcastEmail).not.toHaveBeenCalled()
  })

  it('auto-syncs the confirmed speaker audience before sending the broadcast', async () => {
    const confirmedSpeaker = {
      _id: 'spk-confirmed',
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      proposals: [{ _id: 'p-confirmed', status: 'confirmed' }],
    }
    h.getSpeakersUncached.mockResolvedValue({
      speakers: [confirmedSpeaker],
      err: null,
    })
    h.syncConferenceAudience.mockResolvedValue({
      audienceId: 'aud-speakers-1',
      syncedCount: 1,
    })
    h.sendBroadcastEmail.mockResolvedValue(
      new Response(JSON.stringify({ success: true, broadcastId: 'bc-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const caller = createAdminCaller()
    const result = await caller.admin.broadcastEmail({
      subject: 'Speaker dinner details',
      message: validPortableText,
    })

    expect(h.syncConferenceAudience).toHaveBeenCalledTimes(1)
    expect(h.syncConferenceAudience).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conf-A' }),
      [confirmedSpeaker],
    )
    expect(h.sendBroadcastEmail).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true, broadcastId: 'bc-1' })
  })
})
