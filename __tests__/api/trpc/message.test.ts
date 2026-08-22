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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'
import type { ConversationWithContext } from '@/lib/messaging/types'

// The domain conference carries the `organization` ref the org-scoped authz waist
// resolves the request org from; it must match the organizer fixture's
// `organizerOrgIds` (TEST_ORG_ID) or every organizer call is FORBIDDEN.
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: {
      _id: 'conf-1',
      domains: ['cndn.no'],
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'cndn.no',
    error: null,
  })),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(async () => {}),
}))

// The organizer-standing check (A5) probes the sanity read client directly.
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => null) },
}))

vi.mock('@/lib/messaging/sanity', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/messaging/sanity')>()
  return {
    ...actual, // keep the real canAccessConversation
    getConversationById: vi.fn(),
    // The READ procedures load the conversation and the caller's own preference
    // in one round trip; it is wired to `getConversationById` in `beforeEach` so
    // every `getById.mockResolvedValue(...)` below drives both.
    getConversationWithPreference: vi.fn(),
    getConversationParticipants: vi.fn(async () => []),
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
    getProposalForConversation: vi.fn(),
    setConversationPreference: vi.fn(async () => ({
      muted: true,
      emailOverride: 'default',
    })),
    // Claim-on-reply (B1b). Defaults to "I claimed it"; the no-claim tests
    // assert it was never CALLED, so a default of true cannot mask them.
    claimConversationIfUnassigned: vi.fn(async () => true),
  }
})

import {
  getConversationById,
  getConversationWithPreference,
  listConversationsForSpeaker,
  listMessages,
  ensureProposalConversation,
  createGeneralConversation,
  getProposalForConversation,
  addMessage,
  claimConversationIfUnassigned,
} from '@/lib/messaging/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { notifyNewMessage } from '@/lib/messaging/notify'

type LooseMock = ReturnType<typeof vi.fn>
const getById = getConversationById as unknown as LooseMock
const getWithPref = getConversationWithPreference as unknown as LooseMock
const listConvs = listConversationsForSpeaker as unknown as LooseMock
const listMsgs = listMessages as unknown as LooseMock
const ensureProposal = ensureProposalConversation as unknown as LooseMock
const createGeneral = createGeneralConversation as unknown as LooseMock
const getProposal = getProposalForConversation as unknown as LooseMock
const standingFetch = (clientReadUncached as unknown as { fetch: LooseMock })
  .fetch
const addMsg = addMessage as unknown as LooseMock
const claimMock = claimConversationIfUnassigned as unknown as LooseMock
const notifyMock = notifyNewMessage as unknown as LooseMock

const speaker1 = speakers[0]._id // John, not an organizer
const organizerId = speakers.find((s) => s.isOrganizer)!._id

const strangerProposalConv: ConversationWithContext = {
  _id: 'conversation.proposal.prop-1',
  conferenceId: 'conf-1',
  // `canAccessConversation` scopes organizer access to the conversation's OWN
  // org, so the thread must belong to the org the organizer fixture organizes.
  conferenceOrgId: 'org-test',
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
  getWithPref.mockImplementation(async (id: string) => ({
    conversation: await (getById as (id: string) => Promise<unknown>)(id),
    preference: { muted: false, emailOverride: 'default' },
  }))
})

describe('authorization', () => {
  // A3: a non-participant is denied with NOT_FOUND (not FORBIDDEN) so the
  // deterministic proposal-thread id can't be used as an existence oracle. The
  // denial itself is still asserted — addMessage never runs on the send path.
  it('denies a non-participant speaker on getConversation with NOT_FOUND (A3)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.getConversation({ id: 'conversation.proposal.prop-1' }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })

  it('denies a non-participant speaker on listMessages with NOT_FOUND (A3)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.listMessages({
        conversationId: 'conversation.proposal.prop-1',
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })

  it('denies a non-participant sending to an existing thread with NOT_FOUND (A3)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.send({
        conversationId: 'conversation.proposal.prop-1',
        body: 'hi',
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
    expect(addMsg).not.toHaveBeenCalled()
  })

  it('denies a cross-conference conversation with NOT_FOUND on a mismatched domain (A4)', async () => {
    // Organizer would otherwise pass the access check, so the conference guard
    // is what rejects: the conversation belongs to conf-2, the domain is conf-1.
    getById.mockResolvedValue({
      ...strangerProposalConv,
      conferenceId: 'conf-2',
    })
    const caller = createAdminCaller()
    await expect(
      caller.message.send({
        conversationId: 'conversation.proposal.prop-1',
        body: 'hi',
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
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

describe('keyset cursor threading (F3)', () => {
  const iso = '2026-05-01T12:00:00.000Z'

  it('splits a compound listMessages cursor into before + beforeId', async () => {
    getById.mockResolvedValue(ownProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.listMessages({
      conversationId: 'conversation.proposal.prop-1',
      cursor: `${iso}~message.42`,
    })
    expect(listMsgs.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation.proposal.prop-1',
      before: iso,
      beforeId: 'message.42',
    })
  })

  it('threads a legacy plain-datetime listMessages cursor as before only', async () => {
    getById.mockResolvedValue(ownProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.listMessages({
      conversationId: 'conversation.proposal.prop-1',
      cursor: iso,
    })
    expect(listMsgs.mock.calls[0][0]).toMatchObject({
      before: iso,
      beforeId: undefined,
    })
  })

  it('splits a compound listConversations cursor into before + beforeId', async () => {
    const caller = createAdminCaller()
    await caller.message.listConversations({ cursor: `${iso}~conversation.9` })
    expect(listConvs.mock.calls[0][0]).toMatchObject({
      before: iso,
      beforeId: 'conversation.9',
    })
  })
})

describe('send — reopen-on-reply (S3)', () => {
  const resolvedOwnConv: ConversationWithContext = {
    ...ownProposalConv,
    status: 'resolved',
  }

  it('a NON-organizer replying to a resolved thread reopens it (reopen=true)', async () => {
    getById.mockResolvedValue(resolvedOwnConv)
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.send({
      conversationId: resolvedOwnConv._id,
      body: 'follow up',
    })
    expect(addMsg).toHaveBeenCalledWith(
      expect.objectContaining({ reopen: true }),
    )
  })

  it('an ORGANIZER replying to a resolved thread does NOT reopen it (reopen=false)', async () => {
    getById.mockResolvedValue(resolvedOwnConv)
    const caller = createAdminCaller()
    await caller.message.send({
      conversationId: resolvedOwnConv._id,
      body: 'answer',
    })
    expect(addMsg).toHaveBeenCalledWith(
      expect.objectContaining({ reopen: false }),
    )
  })

  it('a NON-organizer replying to an OPEN thread does not reopen (reopen=false)', async () => {
    getById.mockResolvedValue(ownProposalConv) // status undefined → open
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.send({
      conversationId: ownProposalConv._id,
      body: 'hi again',
    })
    expect(addMsg).toHaveBeenCalledWith(
      expect.objectContaining({ reopen: false }),
    )
  })
})

/**
 * B1b — the claim/no-claim matrix. Every case asserts on the CALL (and on the
 * `claimed` flag the client renders a toast from), never on an absence of
 * effects, so a send that failed for an unrelated reason cannot read as
 * "correctly did not claim".
 */
describe('send — claim-on-reply (B1b)', () => {
  const unassignedConv: ConversationWithContext = {
    ...ownProposalConv,
    assignedTo: null,
  }
  const assignedConv: ConversationWithContext = {
    ...ownProposalConv,
    assignedTo: { _id: 'someone-else', name: 'Another Organizer' },
  }

  it('CLAIMS: an organizer replying to an unassigned thread becomes the assignee', async () => {
    getById.mockResolvedValue(unassignedConv)

    const result = await createAdminCaller().message.send({
      conversationId: unassignedConv._id,
      body: 'On it.',
    })

    expect(claimMock).toHaveBeenCalledWith(unassignedConv._id, organizerId)
    expect(result.claimed).toBe(true)
    // The message itself still went through — claiming is a side effect of
    // replying, never a substitute for it.
    expect(addMsg).toHaveBeenCalledTimes(1)
  })

  it('does NOT claim when a NON-organizer replies', async () => {
    getById.mockResolvedValue(unassignedConv)

    const result = await createAuthenticatedCaller(speaker1).message.send({
      conversationId: unassignedConv._id,
      body: 'Any news?',
    })

    // A speaker can never become an assignee — the write is not attempted at
    // all, so there is nothing for the atomic guard to have to refuse.
    expect(claimMock).not.toHaveBeenCalled()
    expect(result.claimed).toBe(false)
    expect(addMsg).toHaveBeenCalledTimes(1)
  })

  it('does NOT claim a thread that ALREADY has an assignee', async () => {
    getById.mockResolvedValue(assignedConv)

    const result = await createAdminCaller().message.send({
      conversationId: assignedConv._id,
      body: 'Adding a note.',
    })

    expect(claimMock).not.toHaveBeenCalled()
    expect(result.claimed).toBe(false)
    expect(addMsg).toHaveBeenCalledTimes(1)
  })

  it('reports claimed=false when the atomic claim loses the race', async () => {
    getById.mockResolvedValue(unassignedConv)
    // Two organizers replied at once; Sanity applied the other one's
    // setIfMissing. We tried, and we are told we did not get it.
    claimMock.mockResolvedValueOnce(false)

    const result = await createAdminCaller().message.send({
      conversationId: unassignedConv._id,
      body: 'On it.',
    })

    expect(claimMock).toHaveBeenCalledTimes(1)
    expect(result.claimed).toBe(false)
  })

  it('never fails the SEND when the claim write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getById.mockResolvedValue(unassignedConv)
    claimMock.mockRejectedValueOnce(new Error('write conflict'))

    // The message is already committed by the time the claim runs; a bookkeeping
    // failure must not turn a delivered message into a failed send.
    const result = await createAdminCaller().message.send({
      conversationId: unassignedConv._id,
      body: 'On it.',
    })

    expect(result.message).toBeDefined()
    expect(result.claimed).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('claims a thread the organizer STARTS (it has no owner either)', async () => {
    getProposal.mockResolvedValue({
      conferenceId: 'conf-1',
      title: 'My Talk',
      speakerIds: [speaker1],
    })
    getById.mockResolvedValue(unassignedConv)

    const result = await createAdminCaller().message.send({
      proposalId: 'prop-1',
      body: 'Opening this up.',
    })

    // Uniform rule: an organizer send onto an unowned thread claims it. Opening
    // a thread and answering one are the same commitment, and a special case
    // here would be an untested asymmetry.
    expect(result.claimed).toBe(true)
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

  it('404s when the organizer recipient has NO standing in this conference (A5)', async () => {
    // Speaker exists somewhere but has no proposal in the current conference.
    standingFetch.mockResolvedValue(null)
    const caller = createAdminCaller()
    await expect(
      caller.message.send({
        subject: 'Q',
        recipientSpeakerId: 'ghost',
        body: 'hi',
      }),
    ).rejects.toThrow(/NOT_FOUND|in this conference/)
    expect(createGeneral).not.toHaveBeenCalled()
  })

  it('creates an organizer general thread when the recipient HAS standing (A5)', async () => {
    // The standing helper now runs two reads: (1) resolve the conference's
    // owning org, (2) the standing predicate. First returns the org, second the
    // speaker id → proposal in this conference OR same-org organizer.
    standingFetch.mockReset()
    standingFetch
      .mockResolvedValueOnce('org-1') // conference.organization._ref
      .mockResolvedValueOnce('sp-target') // standing predicate
    getById.mockResolvedValue(organizerGeneralConv)
    const caller = createAdminCaller()

    const result = await caller.message.send({
      subject: 'About your talk',
      recipientSpeakerId: 'sp-target',
      body: 'hi',
    })

    // E9 (go-live gate): the organizer arm is ORG-SCOPED — same-org, cross-edition
    // organizers (which the picker offers) still qualify without a talk this
    // edition, but a cross-TENANT organizer no longer does. The predicate is the
    // SECOND read; the first resolves the conference's org.
    const standingQuery = standingFetch.mock.calls[1][0] as string
    expect(standingQuery).toContain(
      '*[_type == "conference" && organization._ref == $orgId].organizers[]._ref',
    )
    expect(standingQuery).toContain('conference._ref == $conferenceId')

    expect(standingFetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      { speakerId: 'sp-target', conferenceId: 'conf-1', orgId: 'org-1' },
      expect.anything(),
    )
    expect(createGeneral).toHaveBeenCalledWith(
      expect.objectContaining({ subjectSpeakerId: 'sp-target' }),
    )
    expect(result.conversationId).toBe('conversation.gen-1')
    expect(addMsg).toHaveBeenCalledTimes(1)
  })
})

describe('send — per-speaker rate limit (A2)', () => {
  // A dedicated speaker (Alice) so the module-level sliding window is not
  // polluted by — and does not pollute — the other send tests.
  const aliceId = 'c3a7f9e0-9e8d-4e4b-9e8f-2a4b6d8f9e8d'
  const aliceConv: ConversationWithContext = {
    _id: 'conversation.gen-alice',
    conferenceId: 'conf-1',
    conversationType: 'general',
    proposalSpeakerIds: [],
    createdById: aliceId,
    subject: 'Q',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'))
    createGeneral.mockResolvedValue('conversation.gen-alice')
    getById.mockResolvedValue(aliceConv)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows a burst of 10, rejects the 11th, then allows again after the window', async () => {
    const caller = createAuthenticatedCaller(aliceId)
    const send = () => caller.message.send({ subject: 'Q', body: 'hi' })

    for (let i = 0; i < 10; i++) {
      await expect(send()).resolves.toMatchObject({
        conversationId: 'conversation.gen-alice',
      })
    }
    await expect(send()).rejects.toThrow(/TOO_MANY_REQUESTS|too quickly/)

    // Advance past the 60s window → the burst budget refills.
    vi.setSystemTime(new Date('2026-05-01T00:01:01.000Z'))
    await expect(send()).resolves.toMatchObject({
      conversationId: 'conversation.gen-alice',
    })
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

  it('denies a non-participant setting a preference with NOT_FOUND (A3)', async () => {
    getById.mockResolvedValue(strangerProposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.setPreference({
        conversationId: 'conversation.proposal.prop-1',
        muted: true,
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })
})
