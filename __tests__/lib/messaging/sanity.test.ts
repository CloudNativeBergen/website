/**
 * @vitest-environment node
 *
 * Unit tests for the messaging data layer (src/lib/messaging/sanity.ts):
 * - deterministic ids (proposal conversation + preference doc-per-pair);
 * - the single-transaction addMessage (create + lastMessageAt bump);
 * - createIfNotExists race-safety for proposal threads and preferences;
 * - the pure authz / recipient / link helpers.
 *
 * Both Sanity clients are mocked so we assert exactly what is written / queried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => [] as string[]),
}))

// Deterministic ids so we can assert the message/general-conversation shapes.
vi.mock('nanoid', () => ({ nanoid: () => 'FIXED' }))

import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  proposalConversationId,
  conversationPreferenceId,
  resolveParticipantIds,
  resolveRecipients,
  canAccessConversation,
  conversationLinkPath,
  addMessage,
  ensureProposalConversation,
  createGeneralConversation,
  setConversationPreference,
  getConversationPreferencesFor,
  listConversationsForSpeaker,
  speakerExists,
} from '@/lib/messaging/sanity'
import type { ConversationWithContext } from '@/lib/messaging/types'

type LooseMock = ReturnType<typeof vi.fn>
const writeMock = clientWrite as unknown as {
  transaction: LooseMock
  create: LooseMock
}
const readMock = clientReadUncached as unknown as { fetch: LooseMock }

function installTransaction(commit: () => Promise<unknown> = async () => ({})) {
  const tx = {
    create: vi.fn((_doc?: unknown) => tx),
    createIfNotExists: vi.fn((_doc?: unknown) => tx),
    patch: vi.fn((_id?: string, _ops?: unknown) => tx),
    commit: vi.fn(commit),
  }
  writeMock.transaction.mockReturnValue(tx)
  return tx
}

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

const generalConv: ConversationWithContext = {
  _id: 'conversation.gen-1',
  conferenceId: 'conf-1',
  conversationType: 'general',
  proposalSpeakerIds: [],
  createdById: 'sp-9',
  subject: 'A question',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

// An ORGANIZER-initiated general thread: created by an organizer, ABOUT sp-7.
const organizerGeneralConv: ConversationWithContext = {
  _id: 'conversation.gen-2',
  conferenceId: 'conf-1',
  conversationType: 'general',
  proposalSpeakerIds: [],
  createdById: 'org-1',
  subjectSpeakerId: 'sp-7',
  subject: 'About your talk',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('deterministic ids', () => {
  it('derives a stable proposal conversation id', () => {
    expect(proposalConversationId('prop-1')).toBe(
      'conversation.proposal.prop-1',
    )
  })
  it('derives a stable per-pair preference id', () => {
    expect(conversationPreferenceId('conversation.gen-1', 'sp-3')).toBe(
      'convpref.conversation.gen-1.sp-3',
    )
  })
})

describe('resolveParticipantIds', () => {
  it('proposal thread → proposal speakers ∪ organizers, de-duplicated', () => {
    const ids = resolveParticipantIds(proposalConv, ['org-1', 'sp-1']).sort()
    // sp-1 is both a speaker and an organizer → appears once.
    expect(ids).toEqual(['org-1', 'sp-1', 'sp-2'])
  })
  it('general thread → creator ∪ organizers', () => {
    expect(resolveParticipantIds(generalConv, ['org-1']).sort()).toEqual([
      'org-1',
      'sp-9',
    ])
  })
  it('organizer-initiated general thread → creator ∪ subjectSpeaker ∪ organizers, de-duplicated', () => {
    // org-1 is both creator and organizer → appears once; sp-7 is the subject.
    expect(
      resolveParticipantIds(organizerGeneralConv, ['org-1', 'org-2']).sort(),
    ).toEqual(['org-1', 'org-2', 'sp-7'])
  })
})

describe('resolveRecipients — excludes the actor', () => {
  it('drops the author from a proposal thread fan-out', () => {
    expect(resolveRecipients(proposalConv, 'sp-1', ['org-1']).sort()).toEqual([
      'org-1',
      'sp-2',
    ])
  })
  it('drops an organizer author from a general thread fan-out', () => {
    expect(resolveRecipients(generalConv, 'org-1', ['org-1', 'org-2'])).toEqual(
      ['sp-9', 'org-2'].sort((a, b) => a.localeCompare(b)),
    )
  })
  it('organizer-initiated general thread → subjectSpeaker ∪ other organizers (author excluded, de-duplicated)', () => {
    // org-1 authored → excluded; the subject sp-7 and the other organizer remain.
    expect(
      resolveRecipients(organizerGeneralConv, 'org-1', [
        'org-1',
        'org-2',
      ]).sort(),
    ).toEqual(['org-2', 'sp-7'])
  })
})

describe('canAccessConversation — authz matrix', () => {
  it('any organizer can access any conversation', () => {
    expect(
      canAccessConversation(proposalConv, { _id: 'x', isOrganizer: true }),
    ).toBe(true)
    expect(
      canAccessConversation(generalConv, { _id: 'x', isOrganizer: true }),
    ).toBe(true)
  })
  it('a proposal-speaker can access their proposal thread; a stranger cannot', () => {
    expect(canAccessConversation(proposalConv, { _id: 'sp-2' })).toBe(true)
    expect(canAccessConversation(proposalConv, { _id: 'sp-99' })).toBe(false)
  })
  it('only the creator can access a general thread', () => {
    expect(canAccessConversation(generalConv, { _id: 'sp-9' })).toBe(true)
    expect(canAccessConversation(generalConv, { _id: 'sp-1' })).toBe(false)
  })
  it('the subjectSpeaker of an organizer-initiated general thread can access it; a stranger cannot', () => {
    // Neither creator nor a proposal-speaker, but the subject → allowed.
    expect(canAccessConversation(organizerGeneralConv, { _id: 'sp-7' })).toBe(
      true,
    )
    // Some other speaker who is neither creator nor subject → denied.
    expect(canAccessConversation(organizerGeneralConv, { _id: 'sp-8' })).toBe(
      false,
    )
  })
})

describe('conversationLinkPath — M2 link contract', () => {
  it('proposal thread links to /admin or /cfp proposal #messages', () => {
    expect(conversationLinkPath(proposalConv, true)).toBe(
      '/admin/proposals/prop-1#messages',
    )
    expect(conversationLinkPath(proposalConv, false)).toBe(
      '/cfp/proposal/prop-1#messages',
    )
  })
  it('general thread links to /admin or /cfp messages/<conversationId>', () => {
    expect(conversationLinkPath(generalConv, true)).toBe(
      '/admin/messages/conversation.gen-1',
    )
    expect(conversationLinkPath(generalConv, false)).toBe(
      '/cfp/messages/conversation.gen-1',
    )
  })
})

describe('addMessage — single transaction (create + lastMessageAt bump)', () => {
  it('creates the message and patches the conversation in ONE transaction', async () => {
    const tx = installTransaction()

    const message = await addMessage({
      conversationId: 'conversation.gen-1',
      authorId: 'sp-9',
      body: 'hello',
    })

    expect(writeMock.transaction).toHaveBeenCalledTimes(1)
    expect(tx.create).toHaveBeenCalledTimes(1)
    expect(tx.patch).toHaveBeenCalledTimes(1)
    expect(tx.commit).toHaveBeenCalledTimes(1)

    const doc = tx.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc._type).toBe('message')
    expect(doc.conversation).toEqual({
      _type: 'reference',
      _ref: 'conversation.gen-1',
    })
    expect(doc.author).toEqual({ _type: 'reference', _ref: 'sp-9' })
    expect(doc.body).toBe('hello')

    // The returned message mirrors what was written (same createdAt used for the bump).
    expect(message.body).toBe('hello')
    expect(message.conversationId).toBe('conversation.gen-1')
    expect(typeof message.createdAt).toBe('string')
    expect(message._id).toBe('message.FIXED')
  })
})

describe('ensureProposalConversation — race-safe createIfNotExists', () => {
  it('creates the deterministic-id doc and returns that id', async () => {
    const tx = installTransaction()

    const id = await ensureProposalConversation({
      conferenceId: 'conf-1',
      proposalId: 'prop-1',
      proposalTitle: 'My Talk',
      createdById: 'sp-1',
    })

    expect(id).toBe('conversation.proposal.prop-1')
    expect(tx.createIfNotExists).toHaveBeenCalledTimes(1)
    const doc = tx.createIfNotExists.mock.calls[0][0] as Record<string, unknown>
    expect(doc._id).toBe('conversation.proposal.prop-1')
    expect(doc.conversationType).toBe('proposal')
    expect(doc.subject).toBe('My Talk')
    expect(doc.proposal).toEqual({
      _type: 'reference',
      _ref: 'prop-1',
      _weak: true,
    })
  })
})

describe('createGeneralConversation', () => {
  it('creates a random-id general conversation with an explicit subject', async () => {
    const id = await createGeneralConversation({
      conferenceId: 'conf-1',
      createdById: 'sp-9',
      subject: 'A question',
    })
    expect(id).toBe('conversation.FIXED')
    const doc = writeMock.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc.conversationType).toBe('general')
    expect(doc.subject).toBe('A question')
    expect('proposal' in doc).toBe(false)
    // A speaker-created general thread carries NO subjectSpeaker.
    expect('subjectSpeaker' in doc).toBe(false)
  })

  it('sets subjectSpeaker when an organizer targets a recipient speaker', async () => {
    await createGeneralConversation({
      conferenceId: 'conf-1',
      createdById: 'org-1',
      subject: 'About your talk',
      subjectSpeakerId: 'sp-7',
    })
    const doc = writeMock.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc.subjectSpeaker).toEqual({ _type: 'reference', _ref: 'sp-7' })
  })
})

describe('speakerExists — server-side recipient validation', () => {
  it('returns true when a speaker doc with the id exists', async () => {
    readMock.fetch.mockResolvedValue('sp-7')
    expect(await speakerExists('sp-7')).toBe(true)
    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('_type == "speaker"')
    expect(params).toEqual({ speakerId: 'sp-7' })
  })
  it('returns false when no such speaker exists', async () => {
    readMock.fetch.mockResolvedValue(null)
    expect(await speakerExists('ghost')).toBe(false)
  })
})

describe('listConversationsForSpeaker — unread counts per conversation', () => {
  const rows = [
    {
      _id: 'conversation.proposal.prop-1',
      conversationType: 'proposal' as const,
      subject: 'T',
      proposalId: 'prop-1',
      proposalTitle: 'T',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-02T00:00:00.000Z',
    },
    {
      _id: 'conversation.gen-1',
      conversationType: 'general' as const,
      subject: 'Q',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  it('SUMS a speaker unread message counts matching the /cfp link variant (collapsed doc)', async () => {
    readMock.fetch
      .mockResolvedValueOnce(rows) // conversations page
      // ONE collapsed notification representing 2 unread messages (M5).
      .mockResolvedValueOnce([
        { link: '/cfp/proposal/prop-1#messages', count: 2 },
      ])

    const result = await listConversationsForSpeaker({
      speakerId: 'sp-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
    })

    expect(
      result.find((r) => r._id === 'conversation.proposal.prop-1')!.unreadCount,
    ).toBe(2)
    expect(
      result.find((r) => r._id === 'conversation.gen-1')!.unreadCount,
    ).toBe(0)

    // The unread query is scoped to the caller, the conference, message_received,
    // unread only, and projects coalesce(count, 1) so a pre-collapse
    // per-message document still counts as 1.
    const [query, params] = readMock.fetch.mock.calls[1]
    expect(query).toContain('recipient._ref == $speakerId')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('notificationType == "message_received"')
    expect(query).toContain('!defined(readAt)')
    expect(query).toContain('coalesce(count, 1)')
    expect(params).toEqual({ speakerId: 'sp-1', conferenceId: 'conf-1' })
  })

  it('sums MIXED collapsed and legacy per-message docs for the same conversation', async () => {
    readMock.fetch
      .mockResolvedValueOnce(rows)
      // A collapsed doc (count 3) plus two legacy per-message docs (GROQ
      // coalesce projects their absent count as 1 each) → 5 total.
      .mockResolvedValueOnce([
        { link: '/cfp/proposal/prop-1#messages', count: 3 },
        { link: '/cfp/proposal/prop-1#messages', count: 1 },
        { link: '/cfp/proposal/prop-1#messages', count: 1 },
      ])

    const result = await listConversationsForSpeaker({
      speakerId: 'sp-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
    })

    expect(
      result.find((r) => r._id === 'conversation.proposal.prop-1')!.unreadCount,
    ).toBe(5)
  })

  it('sums an organizer unread counts matching the /admin link variant', async () => {
    readMock.fetch
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([
        { link: '/admin/messages/conversation.gen-1', count: 1 },
      ])

    const result = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
    })

    // The general thread's /admin variant matched → 1; the proposal thread → 0.
    expect(
      result.find((r) => r._id === 'conversation.gen-1')!.unreadCount,
    ).toBe(1)
    expect(
      result.find((r) => r._id === 'conversation.proposal.prop-1')!.unreadCount,
    ).toBe(0)
  })

  it('returns [] and runs NO unread query when the page is empty', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const result = await listConversationsForSpeaker({
      speakerId: 'sp-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
    })
    expect(result).toEqual([])
    expect(readMock.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('setConversationPreference — doc-per-pair upsert (no array RMW)', () => {
  it('createIfNotExists seeds defaults then patches only provided fields', async () => {
    const tx = installTransaction()
    readMock.fetch.mockResolvedValue({ muted: true, emailOverride: 'off' })

    const pref = await setConversationPreference({
      conversationId: 'conversation.gen-1',
      speakerId: 'sp-3',
      muted: true,
    })

    const seed = tx.createIfNotExists.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(seed._id).toBe('convpref.conversation.gen-1.sp-3')
    expect(seed.muted).toBe(false)
    expect(seed.emailOverride).toBe('default')

    // Only `muted` was provided → the patch sets just that.
    expect(tx.patch).toHaveBeenCalledTimes(1)
    expect(tx.patch.mock.calls[0][0]).toBe('convpref.conversation.gen-1.sp-3')
    expect(pref).toEqual({ muted: true, emailOverride: 'off' })
  })

  it('skips the patch entirely when no fields are provided', async () => {
    const tx = installTransaction()
    readMock.fetch.mockResolvedValue(null)

    await setConversationPreference({
      conversationId: 'conversation.gen-1',
      speakerId: 'sp-3',
    })

    expect(tx.createIfNotExists).toHaveBeenCalledTimes(1)
    expect(tx.patch).not.toHaveBeenCalled()
  })
})

describe('getConversationPreferencesFor — batched, normalized', () => {
  it('is a no-op for an empty recipient set', async () => {
    const map = await getConversationPreferencesFor('conversation.gen-1', [])
    expect(map.size).toBe(0)
    expect(readMock.fetch).not.toHaveBeenCalled()
  })

  it('maps rows by speaker id and normalizes a bad emailOverride to default', async () => {
    readMock.fetch.mockResolvedValue([
      { speakerId: 'sp-1', muted: true, emailOverride: 'on' },
      { speakerId: 'sp-2', muted: false, emailOverride: 'weird' },
    ])
    const map = await getConversationPreferencesFor('conversation.gen-1', [
      'sp-1',
      'sp-2',
    ])
    expect(map.get('sp-1')).toEqual({ muted: true, emailOverride: 'on' })
    expect(map.get('sp-2')).toEqual({ muted: false, emailOverride: 'default' })
  })
})
