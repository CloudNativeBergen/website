/**
 * @vitest-environment node
 *
 * Router-level tests for `message.*` (src/server/routers/message.ts):
 * - authorization: a non-participant speaker is blocked from get/list/send/pref;
 * - conversation auto-create: a proposalId converges on the deterministic id
 *   (idempotent), a subject starts a general thread, neither is a BAD_REQUEST;
 * - the actor and conference are always server-derived.
 *
 * The data layer is mocked (IO functions only); the pure authz helper runs for
 * real so the FORBIDDEN paths exercise the true rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'
import type { ConversationWithContext } from '@/lib/messaging/types'

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: { _id: 'conf-1', domains: ['cndn.no'] },
    domain: 'cndn.no',
    error: null,
  })),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(async () => {}),
}))

vi.mock('@/lib/messaging/sanity', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/messaging/sanity')>()
  return {
    ...actual, // keep the real canAccessConversation
    getConversationById: vi.fn(),
    getConversationParticipants: vi.fn(async () => []),
    getConversationPreference: vi.fn(async () => ({
      muted: false,
      emailOverride: 'default',
    })),
    listConversationsForSpeaker: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
    addMessage: vi.fn(async () => ({
      _id: 'message.1',
      conversationId: 'conversation.proposal.prop-1',
      authorId: 'a',
      body: 'hi',
      createdAt: '2026-01-02T00:00:00.000Z',
    })),
    ensureProposalConversation: vi.fn(
      async () => 'conversation.proposal.prop-1',
    ),
    createGeneralConversation: vi.fn(async () => 'conversation.gen-1'),
    speakerExists: vi.fn(async () => true),
    getProposalForConversation: vi.fn(),
    setConversationPreference: vi.fn(async () => ({
      muted: true,
      emailOverride: 'default',
    })),
  }
})

import {
  getConversationById,
  listConversationsForSpeaker,
  ensureProposalConversation,
  createGeneralConversation,
  getProposalForConversation,
  speakerExists,
  addMessage,
} from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'

type LooseMock = ReturnType<typeof vi.fn>
const getById = getConversationById as unknown as LooseMock
const listConvs = listConversationsForSpeaker as unknown as LooseMock
const ensureProposal = ensureProposalConversation as unknown as LooseMock
const createGeneral = createGeneralConversation as unknown as LooseMock
const getProposal = getProposalForConversation as unknown as LooseMock
const speakerExistsMock = speakerExists as unknown as LooseMock
const addMsg = addMessage as unknown as LooseMock
const notifyMock = notifyNewMessage as unknown as LooseMock

const speaker1 = speakers[0]._id // John, not an organizer
const organizerId = speakers.find((s) => s.isOrganizer)!._id

const strangerProposalConv: ConversationWithContext = {
  _id: 'conversation.proposal.prop-1',
  conferenceId: 'conf-1',
  conversationType: 'proposal',
  proposalId: 'prop-1',
  proposalTitle: 'T',
  proposalSpeakerIds: ['someone-else'],
  createdById: 'someone-else',
  subject: 'T',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

const ownProposalConv: ConversationWithContext = {
  ...strangerProposalConv,
  proposalSpeakerIds: [speaker1],
  createdById: speaker1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authorization', () => {
  it('blocks a non-participant speaker from getConversation (FORBIDDEN)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.getConversation({ id: 'conversation.proposal.prop-1' }),
    ).rejects.toThrow(/FORBIDDEN|Access denied/)
  })

  it('blocks a non-participant speaker from listMessages (FORBIDDEN)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.listMessages({
        conversationId: 'conversation.proposal.prop-1',
      }),
    ).rejects.toThrow(/FORBIDDEN|Access denied/)
  })

  it('blocks a non-participant speaker from sending to an existing thread', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.send({
        conversationId: 'conversation.proposal.prop-1',
        body: 'hi',
      }),
    ).rejects.toThrow(/FORBIDDEN|Access denied/)
    expect(addMsg).not.toHaveBeenCalled()
  })

  it('404s when the conversation does not exist', async () => {
    getById.mockResolvedValue(null)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.getConversation({ id: 'nope' }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })

  it('an organizer can access any conversation', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAdminCaller()
    const result = await caller.message.getConversation({
      id: 'conversation.proposal.prop-1',
    })
    expect(result.conversation._id).toBe('conversation.proposal.prop-1')
  })

  it('rejects an unauthenticated caller', async () => {
    const { createAnonymousCaller } = await import('../../helpers/trpc')
    const caller = createAnonymousCaller()
    await expect(caller.message.listConversations({})).rejects.toThrow(
      /UNAUTHORIZED|Authentication required/,
    )
  })
})

describe('listConversations — scope by role', () => {
  it('passes isOrganizer=false for a speaker', async () => {
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.listConversations({})
    expect(listConvs.mock.calls[0][0]).toMatchObject({
      speakerId: speaker1,
      isOrganizer: false,
      conferenceId: 'conf-1',
    })
  })

  it('passes isOrganizer=true for an organizer', async () => {
    const caller = createAdminCaller()
    await caller.message.listConversations({})
    expect(listConvs.mock.calls[0][0]).toMatchObject({ isOrganizer: true })
  })
})

describe('send — conversation creation', () => {
  it('auto-creates the proposal thread (deterministic id) and is idempotent', async () => {
    getProposal.mockResolvedValue({
      conferenceId: 'conf-1',
      title: 'My Talk',
      speakerIds: [speaker1],
    })
    getById.mockResolvedValue(ownProposalConv)
    const caller = createAuthenticatedCaller(speaker1)

    const first = await caller.message.send({
      proposalId: 'prop-1',
      body: 'one',
    })
    const second = await caller.message.send({
      proposalId: 'prop-1',
      body: 'two',
    })

    expect(first.conversationId).toBe('conversation.proposal.prop-1')
    expect(second.conversationId).toBe('conversation.proposal.prop-1')
    expect(ensureProposal).toHaveBeenCalledTimes(2)
    expect(addMsg).toHaveBeenCalledTimes(2)
    expect(notifyMock).toHaveBeenCalledTimes(2)
  })

  it('blocks starting a proposal thread for a proposal the speaker is not on', async () => {
    getProposal.mockResolvedValue({
      conferenceId: 'conf-1',
      title: 'My Talk',
      speakerIds: ['other'],
    })
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.send({ proposalId: 'prop-1', body: 'hi' }),
    ).rejects.toThrow(/FORBIDDEN|Access denied/)
    expect(ensureProposal).not.toHaveBeenCalled()
  })

  it('404s a proposal that belongs to another conference', async () => {
    getProposal.mockResolvedValue({
      conferenceId: 'other-conf',
      title: 'X',
      speakerIds: [speaker1],
    })
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.send({ proposalId: 'prop-1', body: 'hi' }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })

  it('starts a general thread from a subject', async () => {
    getById.mockResolvedValue({
      _id: 'conversation.gen-1',
      conferenceId: 'conf-1',
      conversationType: 'general',
      proposalSpeakerIds: [],
      createdById: speaker1,
      subject: 'Question',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
    })
    const caller = createAuthenticatedCaller(speaker1)
    const result = await caller.message.send({
      subject: 'Question',
      body: 'hi',
    })
    expect(createGeneral).toHaveBeenCalledTimes(1)
    expect(result.conversationId).toBe('conversation.gen-1')
  })

  it('rejects a send with neither conversationId, proposalId, nor subject', async () => {
    const caller = createAuthenticatedCaller(speaker1)
    await expect(caller.message.send({ body: 'hi' })).rejects.toThrow(
      /BAD_REQUEST|Provide a/,
    )
  })
})

describe('send — organizer-initiated general threads (subjectSpeaker)', () => {
  const organizerGeneralConv: ConversationWithContext = {
    _id: 'conversation.gen-1',
    conferenceId: 'conf-1',
    conversationType: 'general',
    proposalSpeakerIds: [],
    createdById: organizerId,
    subjectSpeakerId: 'sp-target',
    subject: 'About your talk',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-01-01T00:00:00.000Z',
  }

  it('FORBIDS a non-organizer who supplies recipientSpeakerId (never honored)', async () => {
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.send({
        subject: 'Q',
        recipientSpeakerId: 'sp-target',
        body: 'hi',
      }),
    ).rejects.toThrow(/FORBIDDEN|organizer/)
    expect(createGeneral).not.toHaveBeenCalled()
    expect(addMsg).not.toHaveBeenCalled()
  })

  it('rejects an organizer starting a general thread WITHOUT recipientSpeakerId', async () => {
    const caller = createAdminCaller()
    await expect(
      caller.message.send({ subject: 'Q', body: 'hi' }),
    ).rejects.toThrow(/BAD_REQUEST|required/)
    expect(createGeneral).not.toHaveBeenCalled()
  })

  it('404s when the organizer recipientSpeakerId does not resolve to a speaker', async () => {
    speakerExistsMock.mockResolvedValue(false)
    const caller = createAdminCaller()
    await expect(
      caller.message.send({
        subject: 'Q',
        recipientSpeakerId: 'ghost',
        body: 'hi',
      }),
    ).rejects.toThrow(/NOT_FOUND|does not resolve/)
    expect(createGeneral).not.toHaveBeenCalled()
  })

  it('creates an organizer general thread that persists the subjectSpeaker', async () => {
    speakerExistsMock.mockResolvedValue(true)
    getById.mockResolvedValue(organizerGeneralConv)
    const caller = createAdminCaller()

    const result = await caller.message.send({
      subject: 'About your talk',
      recipientSpeakerId: 'sp-target',
      body: 'hi',
    })

    expect(speakerExistsMock).toHaveBeenCalledWith('sp-target')
    expect(createGeneral).toHaveBeenCalledWith(
      expect.objectContaining({ subjectSpeakerId: 'sp-target' }),
    )
    expect(result.conversationId).toBe('conversation.gen-1')
    expect(addMsg).toHaveBeenCalledTimes(1)
  })
})

describe('setPreference', () => {
  it('is authz-checked and binds to the caller', async () => {
    getById.mockResolvedValue(ownProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    const result = await caller.message.setPreference({
      conversationId: 'conversation.proposal.prop-1',
      muted: true,
    })
    expect(result).toEqual({ muted: true, emailOverride: 'default' })
  })

  it('blocks a non-participant from setting a preference', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.setPreference({
        conversationId: 'conversation.proposal.prop-1',
        muted: true,
      }),
    ).rejects.toThrow(/FORBIDDEN|Access denied/)
  })
})
