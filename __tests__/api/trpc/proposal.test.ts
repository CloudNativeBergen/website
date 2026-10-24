vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/events/registry', () => ({}))

vi.mock('@/lib/events/bus', () => ({
  eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    create: vi.fn(),
    getDocument: vi.fn().mockResolvedValue({ _id: 'p1', _type: 'talk' }),
    patch: vi
      .fn()
      .mockReturnValue({ set: vi.fn().mockReturnValue({ commit: vi.fn() }) }),
    delete: vi.fn(),
  },
  // OWNERSHIP PROBE (#730): the admin proposal mutations now resolve the
  // target's tenant first. Report it as a `talk` of this org; the cross-tenant
  // REFUSALS live in `src/server/routers/tenancy.writes.test.ts`.
  clientReadUncached: {
    fetch: vi.fn(
      async (query: string, params: Record<string, unknown> = {}) => {
        if (query.includes('"memberOrgIds"')) {
          return {
            _type: 'talk',
            orgId: null,
            conferenceId: 'test-conference-id',
            conferenceOrgId: 'org-test',
            memberOrgIds: [],
          }
        }
        // REFERENCE-INJECTION PROBE (#731): `topics[]` is client-supplied
        // references, so every newly added id is counted against this org.
        // Report them all as ours; the cross-tenant REFUSALS are asserted in
        // `src/server/routers/tenancy.writes.test.ts`.
        if (query.includes('_id in $ids && _type == $expectedType')) {
          return ((params.ids as string[] | undefined) ?? []).length
        }
        return null
      },
    ),
  },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
  // A foreign talk's own conference: unloadable unless a test says otherwise.
  getConferenceById: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/proposal/data/sanity', () => {
  class ProposalDeletionBlockedError extends Error {}
  return {
    getProposal: vi.fn(),
    getProposals: vi.fn(),
    createProposal: vi.fn(),
    updateProposal: vi.fn(),
    deleteProposal: vi.fn(),
    updateProposalStatus: vi.fn(),
    ProposalDeletionBlockedError,
  }
})

vi.mock('@/lib/proposal/server', () => ({
  updateProposalStatus: vi.fn(),
  getProposalSanity: vi.fn(),
}))

vi.mock('@/lib/conference/state', () => ({
  isCfpOpen: vi.fn(),
  isConferenceOver: vi.fn(),
  isWithdrawalCutoffActive: vi.fn(),
  // Defaults to "the conference offers formats" so the existing cases keep
  // exercising the CFP-window gate alone; the case below flips it.
  hasSubmittableFormats: vi.fn(() => true),
}))

// Messaging M4/S2: the action procedure mirrors organizer decision comments into
// the proposal thread (addMessage only — the decision status rail is the single
// delivery, so notifyNewMessage is deliberately NOT called). Mock the messaging
// boundary.
vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn(),
  addMessage: vi.fn(),
  getConversationById: vi.fn(),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(),
}))

// The status-change event is handed to `runAfterResponse` (Next `after()` /
// Vercel `waitUntil`) instead of being left as a floating promise. Stand in for
// the runtime by running the task, so the existing publish assertions still
// exercise the real handoff.
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: vi.fn((task: () => Promise<void>) => {
    void task()
  }),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidateTag } from 'next/cache'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'
import { TRPCError } from '@trpc/server'
import {
  createAnonymousCaller,
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
  TEST_ORG_ID,
} from '../../helpers/trpc'
import {
  getConferenceById,
  getConferenceForCurrentDomain,
} from '@/lib/conference/sanity'
import {
  getProposal,
  getProposals,
  createProposal,
  deleteProposal,
  ProposalDeletionBlockedError,
} from '@/lib/proposal/data/sanity'
import { getProposalSanity, updateProposalStatus } from '@/lib/proposal/server'
import { eventBus } from '@/lib/events/bus'
import { runAfterResponse } from '@/server/runAfterResponse'
import {
  hasSubmittableFormats,
  isCfpOpen,
  isWithdrawalCutoffActive,
} from '@/lib/conference/state'
import {
  ensureProposalConversation,
  addMessage,
  getConversationById,
} from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'
import {
  Status,
  Action,
  Language,
  Format,
  Level,
  Audience,
} from '@/lib/proposal/types'

const regularSpeaker = speakers.find((s) => !s.isOrganizer)!
const adminSpeaker = speakers.find((s) => s.isOrganizer)!

const mockConference = {
  _id: 'conf-1',
  title: 'Cloud Native Day 2026',
  startDate: '2026-06-15',
  endDate: '2026-06-15',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-05-01',
  domains: ['localhost'],
  // Org-scoped authz derives the REQUEST's org from this conference and grants
  // only when the caller's `organizerOrgIds` contains it, so the domain
  // conference must belong to the fixture organizer's org.
  organization: { _type: 'reference', _ref: TEST_ORG_ID },
}

const validProposalData = {
  title: 'My Talk',
  description: [
    { _type: 'block', children: [{ _type: 'span', text: 'A description' }] },
  ],
  language: Language.english,
  format: Format.presentation_25,
  level: Level.intermediate,
  audiences: [Audience.developer],
  topics: [{ _type: 'reference' as const, _ref: 'topic-1' }],
  tos: true,
}

const mockProposal = {
  _id: 'proposal-1',
  _rev: 'rev-1',
  _type: 'talk',
  _createdAt: '2026-01-15T00:00:00Z',
  _updatedAt: '2026-01-15T00:00:00Z',
  status: Status.submitted,
  speakers: [
    {
      _id: regularSpeaker._id,
      name: regularSpeaker.name,
      email: 'speaker@example.com',
    },
  ],
  conference: { _id: mockConference._id },
  // The real getProposal read projects the talk's org so the router can prove
  // the document belongs to the REQUEST org before granting organizer
  // transitions over it (owner-arm matches carry no such privilege).
  _organizationId: TEST_ORG_ID,
  ...validProposalData,
}

describe('proposal router', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'localhost',
      error: null,
      status: 'resolved' as const,
    })
  })

  describe('list', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(caller.proposal.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should return proposals for authenticated user', async () => {
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [mockProposal] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.list()
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('proposal-1')
      expect(getProposals).toHaveBeenCalledWith(
        expect.objectContaining({ speakerId: regularSpeaker._id }),
      )
    })
  })

  describe('getById', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.getById({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should return proposal for its speaker', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.getById({ id: 'proposal-1' })
      expect(result._id).toBe('proposal-1')
    })

    it('should reject access by non-speaker non-organizer', async () => {
      const otherSpeaker = speakers.find(
        (s) => s._id !== regularSpeaker._id && !s.isOrganizer,
      )!
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(otherSpeaker._id)
      await expect(
        caller.proposal.getById({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should allow organizer to view any proposal', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.getById({ id: 'proposal-1' })
      expect(result._id).toBe('proposal-1')
    })

    it('should throw NOT_FOUND when proposal does not exist', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.getById({ id: 'nonexistent' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('create', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should reject when CFP is closed', async () => {
      // PAIR: the `action` route has the same case ("should refuse submitting a
      // draft after the CFP has closed"). Both refusals come from the single
      // window condition in `assertMayBecomeSubmitted`, so removing it must
      // fail both.
      vi.mocked(isCfpOpen).mockReturnValue(false)

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Call for Papers is currently closed'),
      })
    })

    it('still allows a DRAFT when the CFP is closed', async () => {
      // The window gates the transition to `submitted`, not the incomplete-work
      // path. An API/CLI caller must be able to prepare a draft before the
      // window opens (or after it closes) — nothing is submitted by doing so.
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: { title: 'Draft outside the window' },
        status: Status.draft,
      })
      expect(result.status).toBe(Status.draft)
    })

    it('should enforce max 3 proposals per conference', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.submitted },
          { ...mockProposal, _id: 'p3', status: Status.accepted },
        ] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('maximum of 3 proposals'),
      })
    })

    it('should allow new proposal when one of 3 is withdrawn', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.accepted },
          { ...mockProposal, _id: 'p3', status: Status.withdrawn },
        ] as any,
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalled()
    })

    it('should allow new proposal when one of 3 is rejected', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.accepted },
          { ...mockProposal, _id: 'p3', status: Status.rejected },
        ] as any,
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalled()
    })

    it('should create a draft without strict validation', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: { title: 'Draft talk' },
        status: Status.draft,
      })
      expect(result.status).toBe(Status.draft)
    })

    it('should create a submitted proposal with valid data', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Talk' }),
        regularSpeaker._id,
        mockConference._id,
        Status.submitted,
      )
    })

    it('should reject submitted proposal with missing required fields', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: { title: 'Incomplete' },
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should refuse a new proposal when the conference offers no formats', async () => {
      // An OPEN CFP window on a conference that configured no session formats
      // cannot accept anything — a proposal must carry a format. A fresh tenant
      // is provisioned in exactly that state, so this closes the loop behind
      // the page and form, which already refuse.
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(false)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(createProposal).not.toHaveBeenCalled()
    })

    it('refuses a submission whose payload carries an unreadable topic entry', async () => {
      // The fold that lets the gate read stored topics (`topicIdsOf`) DROPS
      // entries it cannot read, so without this a payload with one good topic
      // and one empty `_ref` would pass "strict validation" on the survivor and
      // create a proposal with fewer topics than the caller asked for, silently.
      // `_ref` is `z.string()` with no `.min(1)`, so an empty one gets past the
      // input schema and reaches the gate.
      //
      // THE CAP IS DELIBERATELY ALREADY REACHED. `requireTopicsReferenceable`
      // refuses this same shape with this same message further down `create`,
      // so a test on an ordinary payload passes even with the gate's own check
      // deleted — it proves the neighbour, not the predicate. The cap sits
      // BETWEEN them and refuses with a different code, so reaching
      // `Invalid topic reference` here can only be the gate: unreadable content
      // is refused before the fairness rule is even considered.
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.submitted },
          { ...mockProposal, _id: 'p3', status: Status.accepted },
        ] as any,
        proposalsError: null,
      })
      vi.mocked(createProposal).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: {
            ...validProposalData,
            topics: [
              { _type: 'reference' as const, _ref: 'topic-1' },
              { _type: 'reference' as const, _ref: '' },
            ],
          },
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Invalid topic reference'),
      })
      expect(createProposal).not.toHaveBeenCalled()
    })

    it('still allows a DRAFT when the conference offers no formats', async () => {
      // Drafts are the incomplete-work path (they skip strict validation too),
      // so preparing one before the organizers announce formats is legitimate.
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(false)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: { title: 'Draft ahead of the formats' },
        status: Status.draft,
      })
      expect(result.status).toBe(Status.draft)
    })
  })

  describe('action', () => {
    describe('organizer cancel / withdraw', () => {
      const confirmed = { ...mockProposal, status: Status.confirmed }
      const published = () =>
        vi.mocked(eventBus.publish).mock.calls.at(-1)![0] as any

      beforeEach(() => {
        vi.mocked(eventBus.publish).mockClear()
        vi.mocked(addMessage).mockClear()
        vi.mocked(notifyNewMessage).mockClear()
        vi.mocked(ensureProposalConversation).mockResolvedValue('conv-1')
        vi.mocked(addMessage).mockResolvedValue({ _id: 'msg-1' } as any)
        vi.mocked(getConversationById).mockResolvedValue({
          _id: 'conv-1',
        } as any)
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: confirmed as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.canceled } as any,
          err: null,
        })
      })

      it('posts the comment to the thread and fans it out, no formal email by default', async () => {
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          comment: 'Program cut',
        })
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'Program cut' }),
        )
        expect(notifyNewMessage).toHaveBeenCalledTimes(1)
        expect(published().metadata.shouldNotify).toBe(false)
        expect(published().metadata.triggeredBy.isOrganizer).toBe(true)
      })

      it('posts a stock line when the cancel has no comment', async () => {
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
        })
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            body: 'Your talk "My Talk" has been canceled by the organizers.',
          }),
        )
      })

      it('Force email sends the formal email and skips the message fan-out', async () => {
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          comment: 'Program cut',
          forceEmail: true,
        })
        expect(published().metadata.shouldNotify).toBe(true)
        expect(addMessage).toHaveBeenCalledTimes(1)
        expect(notifyNewMessage).not.toHaveBeenCalled()
      })

      it('relays an organizer withdrawal reason', async () => {
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.withdrawn } as any,
          err: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'No-show risk',
          comment: 'No-show risk',
        })
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'No-show risk' }),
        )
        expect(published().metadata.reason).toBe('No-show risk')
      })

      it('falls back to the reason when an organizer withdraw has no comment', async () => {
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.withdrawn } as any,
          err: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'No-show risk',
        })
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'No-show risk' }),
        )
        expect(published().metadata.postedToThread).toBe(true)
      })

      it('does not post or publish under this conference for a talk of another conference', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: {
            ...confirmed,
            status: Status.canceled,
            conference: { _id: 'conf-other' },
          } as any,
          err: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          comment: 'Program cut',
          forceEmail: true,
        })
        expect(addMessage).not.toHaveBeenCalled()
        expect(eventBus.publish).not.toHaveBeenCalled()
      })

      it('treats an organizer withdrawing their own talk as a self-withdraw', async () => {
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: {
            ...confirmed,
            speakers: [{ _id: adminSpeaker._id, name: adminSpeaker.name }],
          } as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.withdrawn } as any,
          err: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Ill',
          comment: 'Ill',
          forceEmail: true,
        })
        const { metadata } = published()
        expect(metadata.shouldNotify).toBe(false)
        expect(metadata.triggeredBy.isOrganizer).toBe(false)
        // No "the organizers withdrew your talk" note to themselves.
        expect(addMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.stringContaining('by the organizers'),
          }),
        )
      })
    })

    describe('ticket cancellation request', () => {
      const confirmed = { ...mockProposal, status: Status.confirmed }
      const published = () =>
        vi.mocked(eventBus.publish).mock.calls.at(-1)![0] as any

      beforeEach(() => {
        vi.mocked(eventBus.publish).mockClear()
        vi.mocked(getProposals).mockClear()
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: confirmed as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.canceled } as any,
          err: null,
        })
        vi.mocked(getProposals).mockResolvedValue({
          proposals: [],
          proposalsError: null,
        })
      })

      it('asks for no ticket cancellation by default', async () => {
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
        })
        expect(published().metadata.ticketCancellation).toBeUndefined()
        expect(getProposals).not.toHaveBeenCalled()
      })

      it('lists every speaker for manual ticket cancellation when asked', async () => {
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation).toEqual({
          speakers: [
            { name: regularSpeaker.name, email: 'speaker@example.com' },
          ],
          unfiltered: false,
        })
      })

      it('skips a speaker who has another confirmed talk', async () => {
        vi.mocked(getProposals).mockResolvedValue({
          proposals: [
            { _id: 'other-talk', speakers: [{ _id: regularSpeaker._id }] },
          ] as any,
          proposalsError: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation).toEqual({
          speakers: [],
          unfiltered: false,
        })
      })

      it('marks the list unfiltered when the lookup fails', async () => {
        vi.mocked(getProposals).mockResolvedValue({
          proposals: [],
          proposalsError: new Error('boom'),
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation.unfiltered).toBe(true)
      })

      it('ignores revokeTicket for a talk that was only accepted (no ticket yet)', async () => {
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: { ...mockProposal, status: Status.accepted } as any,
          proposalError: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.cancel,
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation).toBeUndefined()
      })

      it('ignores revokeTicket for reject', async () => {
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: mockProposal as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...mockProposal, status: Status.rejected } as any,
          err: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.reject,
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation).toBeUndefined()
      })

      it('ignores revokeTicket for a speaker withdrawing', async () => {
        vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.withdrawn } as any,
          err: null,
        })
        await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Ill',
          revokeTicket: true,
        })
        expect(published().metadata.ticketCancellation).toBeUndefined()
      })
    })

    describe('speaker self-withdraw', () => {
      const confirmed = { ...mockProposal, status: Status.confirmed }
      const published = () =>
        vi.mocked(eventBus.publish).mock.calls.at(-1)![0] as any

      beforeEach(() => {
        vi.mocked(eventBus.publish).mockClear()
        vi.mocked(addMessage).mockClear()
        vi.mocked(notifyNewMessage).mockClear()
        vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
        vi.mocked(ensureProposalConversation).mockResolvedValue('conv-1')
        vi.mocked(addMessage).mockResolvedValue({ _id: 'msg-1' } as any)
        vi.mocked(getConversationById).mockResolvedValue({
          _id: 'conv-1',
        } as any)
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: confirmed as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...confirmed, status: Status.withdrawn } as any,
          err: null,
        })
      })

      it('posts the reason as a speaker-authored thread message and fans it out', async () => {
        await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Ill',
        })
        expect(addMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          authorId: regularSpeaker._id,
          body: 'Withdrawn: Ill',
        })
        expect(notifyNewMessage).toHaveBeenCalledTimes(1)
        expect(published().metadata.postedToThread).toBe(true)
        expect(published().metadata.shouldNotify).toBe(false)
      })

      it('keeps the organizer alerts when an organizer withdraws their own talk', async () => {
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: {
            ...confirmed,
            speakers: [{ _id: adminSpeaker._id, name: adminSpeaker.name }],
          } as any,
          proposalError: null,
        })
        await createAdminCaller().proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Ill',
        })
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'Withdrawn: Ill' }),
        )
        // The message is organizer-authored, so it skips Slack and the
        // org-contact copy; the status alerts must still fire.
        expect(published().metadata.postedToThread).toBe(false)
      })

      it('reports postedToThread false when the thread write fails', async () => {
        vi.mocked(addMessage).mockRejectedValue(new Error('down'))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Ill',
        })
        expect(published().metadata.postedToThread).toBe(false)
      })
    })

    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should reject invalid state transition', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      // submitted → submit is not a valid transition
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should allow speaker to unsubmit their proposal when CFP is open', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.unsubmit,
      })
      expect(result.proposalStatus).toBe(Status.draft)
    })

    it('should block speaker from unsubmitting after CFP closes', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.unsubmit,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Call for Papers has closed'),
      })
    })

    it('should allow organizer to unsubmit even after CFP closes', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.unsubmit,
      })
      expect(result.proposalStatus).toBe(Status.draft)
    })

    it('should allow speaker to withdraw a submitted proposal with a reason', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.withdrawn } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'I can no longer attend the conference.',
      })
      expect(result.proposalStatus).toBe(Status.withdrawn)
      // The reason is persisted alongside the status change.
      expect(vi.mocked(updateProposalStatus)).toHaveBeenCalledWith(
        'proposal-1',
        Status.withdrawn,
        'I can no longer attend the conference.',
        undefined,
      )
    })

    it('should reject a withdrawal with no reason (server-side)', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should reject a withdrawal whose reason is only whitespace', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should block speaker self-withdrawal within the cutoff window', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(true)
      vi.mocked(updateProposalStatus).mockClear()
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Something came up.',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('within 14 days'),
      })
      // Status must remain unchanged when blocked by the cutoff.
      expect(vi.mocked(updateProposalStatus)).not.toHaveBeenCalled()
    })

    it('should allow organizer to withdraw within the cutoff window', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.withdrawn } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'Withdrawn on behalf of the speaker.',
      })
      expect(result.proposalStatus).toBe(Status.withdrawn)
    })

    it('should allow organizer to accept a submitted proposal', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.accepted } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
      })
      expect(result.proposalStatus).toBe(Status.accepted)
    })

    it('should reject non-organizer performing admin actions', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      // accept is admin-only
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.accept }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should refuse submitting a draft after the CFP has closed', async () => {
      // PAIR of `create`'s "should reject when CFP is closed". A draft prepared
      // while the window was open must not be promotable a month after it shut:
      // the deadline means nothing if the second submit route ignores it.
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(hasSubmittableFormats).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(updateProposalStatus).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Call for Papers is currently closed'),
      })
      expect(updateProposalStatus).not.toHaveBeenCalled()
    })

    it('should refuse an ORGANIZER submitting a draft after the CFP closes', async () => {
      // No organizer carve-out on the window, matching the formats and content
      // conditions: an out-of-window submission is wrong whoever promotes it.
      // Organizers who want to accept late work have `unsubmit` (which they
      // keep after the close) and the CFP end date itself.
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(hasSubmittableFormats).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockClear()

      const caller = createAdminCaller()
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(updateProposalStatus).not.toHaveBeenCalled()
    })

    it('should still allow withdrawing after the CFP has closed', async () => {
      // The window gate is scoped to draft → submitted. Withdrawal is how a
      // speaker exits a proposal once the CFP is over, so it must stay open.
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.withdrawn } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'The CFP closed and my plans changed.',
      })
      expect(result.proposalStatus).toBe(Status.withdrawn)
    })

    it('should refuse submitting a draft when the conference offers no formats', async () => {
      // `action` is the OTHER route to `submitted` — it is what ProposalForm
      // uses for an existing draft. Gating only `proposal.create` would leave
      // the trap open: prepare a draft (still allowed), then submit it here
      // onto a conference offering no formats, carrying the schema's default
      // format that the conference never offered.
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(updateProposalStatus).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('session formats'),
      })
      expect(updateProposalStatus).not.toHaveBeenCalled()
    })

    it('should refuse an ORGANIZER submitting a draft with no formats either', async () => {
      // No organizer carve-out: a submitted proposal on a formats-less
      // conference is wrong whoever creates it (unlike the 3-proposal cap,
      // which is a per-speaker fairness rule organizers may override).
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })

      const caller = createAdminCaller()
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('should allow submitting a draft once formats are configured', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(hasSubmittableFormats).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.submitted } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.submit,
      })
      expect(result.proposalStatus).toBe(Status.submitted)
    })

    describe('strict content validation on draft \u2192 submitted', () => {
      // `create` strict-parses the payload before letting a proposal reach
      // `submitted`; `action` \u2014 the OTHER route to `submitted` \u2014 did not parse
      // anything. Since `ProposalDraftSchema` is `.partial()`, the two-step path
      // `create({ status: draft })` \u2192 `action(submit)` promoted content that
      // `create({ status: submitted })` would have refused outright. The UI
      // cannot reach it (`ProposalForm` saves via `update` first), a direct
      // API/tRPC caller can.
      function draft(overrides: Record<string, unknown> = {}) {
        vi.mocked(isCfpOpen).mockReturnValue(true)
        vi.mocked(hasSubmittableFormats).mockReturnValue(true)
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: {
            ...mockProposal,
            status: Status.draft,
            ...overrides,
          } as any,
          proposalError: null,
        })
        vi.mocked(getProposals).mockResolvedValue({
          proposals: [],
          proposalsError: null,
        })
        vi.mocked(updateProposalStatus).mockClear()
      }

      it('refuses a draft carrying no topics', async () => {
        draft({ topics: [] })

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        await expect(
          caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('At least one topic is required'),
        })
        expect(updateProposalStatus).not.toHaveBeenCalled()
      })

      it('refuses a draft with the terms unaccepted', async () => {
        draft({ tos: false })

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        await expect(
          caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
        expect(updateProposalStatus).not.toHaveBeenCalled()
      })

      it('refuses a draft with an empty description', async () => {
        draft({ description: [] })

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        await expect(
          caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('gives ORGANIZERS no carve-out either', async () => {
        // Same reasoning as the format gate: an invalid submitted proposal is
        // wrong whoever promotes it. (Unlike the 3-proposal cap, which is a
        // per-speaker fairness rule organizers may override.)
        draft({ topics: [] })

        const caller = createAdminCaller()
        await expect(
          caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('accepts DEREFERENCED topics \u2014 the shape the projection returns', async () => {
        // REGRESSION GUARD. `getProposal` projects `topics[]-> { _id, title }`,
        // not `{ _type: 'reference', _ref }`. Parsing the stored document
        // naively against `ProposalInputSchema` would reject every legitimate
        // submission on the topic field, so the gate folds them back first.
        draft({
          topics: [
            { _id: 'topic-1', title: 'Platform engineering', color: '#fff' },
          ],
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...mockProposal, status: Status.submitted } as any,
          err: null,
        })

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        const result = await caller.proposal.action({
          id: 'proposal-1',
          action: Action.submit,
        })
        expect(result.proposalStatus).toBe(Status.submitted)
      })

      it('TOLERATES an unreadable stored topic entry, validating the survivors', async () => {
        // The opposite call to the payload path, deliberately. A `topics[]->`
        // projection yields `null` for a topic that was since deleted, so these
        // entries are pre-existing data the speaker did not cause and cannot
        // fix — refusing would strand them. The gate logs and submits on the
        // readable ones. This pins that as a decision, not an accident.
        draft({
          topics: [
            { _id: 'topic-1', title: 'Platform engineering', color: '#fff' },
            null,
          ],
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...mockProposal, status: Status.submitted } as any,
          err: null,
        })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        const result = await caller.proposal.action({
          id: 'proposal-1',
          action: Action.submit,
        })
        expect(result.proposalStatus).toBe(Status.submitted)
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('unreadable topic'),
        )
        warn.mockRestore()
      })

      it('still refuses a stored draft whose topics are ALL unreadable', async () => {
        // Tolerance is not blindness: what the speaker CAN fix — having at
        // least one usable topic — is still enforced, because the fold leaves
        // the survivors (here, none) to strict validation.
        draft({ topics: [null, { _id: '' }] })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        await expect(
          caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('At least one topic is required'),
        })
        expect(updateProposalStatus).not.toHaveBeenCalled()
        warn.mockRestore()
      })

      it('does NOT validate content on other transitions', async () => {
        // Withdrawing or unsubmitting an already-imperfect proposal must stay
        // possible \u2014 the gate is scoped to the draft \u2192 submitted promotion.
        vi.mocked(isCfpOpen).mockReturnValue(true)
        vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
        vi.mocked(getProposalSanity).mockResolvedValue({
          proposal: {
            ...mockProposal,
            status: Status.submitted,
            topics: [],
            tos: false,
          } as any,
          proposalError: null,
        })
        vi.mocked(updateProposalStatus).mockResolvedValue({
          proposal: { ...mockProposal, status: Status.withdrawn } as any,
          err: null,
        })

        const caller = createAuthenticatedCaller(regularSpeaker._id)
        const result = await caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Schedule clash',
        })
        expect(result.proposalStatus).toBe(Status.withdrawn)
      })
    })

    it('should enforce proposal cap when submitting a draft', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      const draftProposal = { ...mockProposal, status: Status.draft }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: draftProposal as any,
        proposalError: null,
      })
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.submitted },
          { ...mockProposal, _id: 'p3', status: Status.accepted },
        ] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('maximum of 3 proposals'),
      })
    })

    it('should confirm an accepted proposal and publish the status-change event with a revision guard', async () => {
      const acceptedProposal = {
        ...mockProposal,
        _rev: 'rev-accepted',
        status: Status.accepted,
      }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: acceptedProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...acceptedProposal, status: Status.confirmed } as any,
        err: null,
      })
      vi.mocked(eventBus.publish).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.confirm,
      })

      expect(result.proposalStatus).toBe(Status.confirmed)
      // Confirm must carry the read revision so a concurrent confirm can't
      // double-write.
      expect(updateProposalStatus).toHaveBeenCalledWith(
        'proposal-1',
        Status.confirmed,
        undefined,
        'rev-accepted',
      )
      expect(eventBus.publish).toHaveBeenCalledTimes(1)
    })

    it('hands the status-change event to the deferral seam and returns without awaiting it', async () => {
      // Regression for dropped speaker-ticket issuance: the event used to be a
      // floating promise, so subscriber work raced the serverless instance
      // being frozen once the response flushed. It must be REGISTERED with the
      // runtime (`runAfterResponse` -> `after()` -> `waitUntil`) while the
      // mutation still returns immediately.
      const acceptedProposal = {
        ...mockProposal,
        _rev: 'rev-accepted',
        status: Status.accepted,
      }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: acceptedProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...acceptedProposal, status: Status.confirmed } as any,
        err: null,
      })
      vi.mocked(runAfterResponse).mockClear()
      vi.mocked(eventBus.publish).mockClear()

      // A subscriber that never settles: awaiting it would hang this test.
      // Restored in `finally` — if an assertion below throws, a leaked
      // pending-forever mock would time out every later `action` test in this
      // file and make the next sabotage run's failure count unreadable.
      let released: (() => void) | undefined
      vi.mocked(eventBus.publish).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            released = resolve
          }),
      )

      try {
        const caller = createAuthenticatedCaller(regularSpeaker._id)
        const result = await caller.proposal.action({
          id: 'proposal-1',
          action: Action.confirm,
        })

        expect(result.proposalStatus).toBe(Status.confirmed)
        // The deferral was registered, not dropped.
        expect(runAfterResponse).toHaveBeenCalledTimes(1)
        expect(typeof vi.mocked(runAfterResponse).mock.calls[0][0]).toBe(
          'function',
        )
        // And that registered task is the one that publishes.
        expect(eventBus.publish).toHaveBeenCalledTimes(1)
      } finally {
        released?.()
        vi.mocked(eventBus.publish).mockReset()
        vi.mocked(eventBus.publish).mockResolvedValue(undefined)
      }
    })

    it('serializes two concurrent confirms so exactly one coupon/email handler runs', async () => {
      const acceptedProposal = {
        ...mockProposal,
        _rev: 'rev-accepted',
        status: Status.accepted,
      }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: acceptedProposal as any,
        proposalError: null,
      })

      // Simulate Sanity optimistic concurrency: the first patch for a given
      // revision wins; any later patch pinned to the same (now stale) revision
      // is rejected with a 409-style error.
      const consumedRevs = new Set<string>()
      vi.mocked(updateProposalStatus).mockImplementation(
        async (_id, status, _withdrawnReason, ifRevisionId) => {
          if (ifRevisionId && consumedRevs.has(ifRevisionId)) {
            return {
              proposal: {} as any,
              err: new Error(
                'The document was modified since read (revision mismatch, 409)',
              ),
            }
          }
          if (ifRevisionId) consumedRevs.add(ifRevisionId)
          return {
            proposal: { ...acceptedProposal, status } as any,
            err: null,
          }
        },
      )
      vi.mocked(eventBus.publish).mockClear()

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const results = await Promise.allSettled([
        caller.proposal.action({ id: 'proposal-1', action: Action.confirm }),
        caller.proposal.action({ id: 'proposal-1', action: Action.confirm }),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      )

      // One confirm succeeds, the other loses the revision race.
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT' })

      // The handler that issues the coupon and emails the speaker is driven by
      // this event, so publishing exactly once => exactly one coupon + email.
      expect(eventBus.publish).toHaveBeenCalledTimes(1)
    })

    it('should return NOT_FOUND for nonexistent proposal', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'nonexistent',
          action: Action.withdraw,
          reason: 'No longer available.',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should surface PRECONDITION_FAILED when deleting a draft is blocked by references', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new ProposalDeletionBlockedError(
          'Cannot delete proposal: it is referenced by a published schedule. Remove those references first.',
        ),
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.delete }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringContaining('referenced by a published schedule'),
      })
    })

    it('should keep INTERNAL_SERVER_ERROR for unexpected deletion failures', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new Error('network exploded'),
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.delete }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete proposal',
      })
    })
  })

  describe('action — decision comment mirrored to proposal thread (M4)', () => {
    beforeEach(() => {
      vi.mocked(ensureProposalConversation).mockClear()
      vi.mocked(addMessage).mockClear()
      vi.mocked(notifyNewMessage).mockClear()
    })

    const conversationId = 'conversation.proposal.proposal-1'
    const createdMessage = {
      _id: 'message.1',
      conversationId,
      authorId: adminSpeaker._id,
      body: 'Congrats — see you in Bergen!',
      createdAt: '2026-01-02T00:00:00.000Z',
    }

    function mockAcceptFlow() {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.accepted } as any,
        err: null,
      })
      vi.mocked(ensureProposalConversation).mockResolvedValue(conversationId)
      vi.mocked(addMessage).mockResolvedValue(createdMessage as any)
      vi.mocked(notifyNewMessage).mockResolvedValue(undefined)
    }

    it('posts an organizer accept comment as a message but does NOT fan out (S2 decision rail)', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: 'Congrats — see you in Bergen!',
      })

      expect(result.proposalStatus).toBe(Status.accepted)
      expect(ensureProposalConversation).toHaveBeenCalledWith({
        conferenceId: 'conf-1',
        proposalId: 'proposal-1',
        proposalTitle: 'My Talk',
        createdById: adminSpeaker._id,
        // Party model (G1): the decision-comment mirror now also seeds the
        // dual-written participants[] from the proposal's current speakers.
        proposalSpeakerIds: [regularSpeaker._id],
      })
      expect(addMessage).toHaveBeenCalledWith({
        conversationId,
        authorId: adminSpeaker._id,
        body: 'Congrats — see you in Bergen!',
      })
      // S2: the decision status rail (proposal_status_changed notification +
      // decision email, both carrying this comment) is the single delivery — the
      // message-thread fan-out must NOT fire, or the speaker would be
      // double-notified for one organizer action.
      expect(notifyNewMessage).not.toHaveBeenCalled()
    })

    it('never fails the action when the messaging write throws', async () => {
      mockAcceptFlow()
      vi.mocked(ensureProposalConversation).mockRejectedValue(
        new Error('sanity down'),
      )
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: 'Congrats!',
      })

      // The (already committed) status change wins; messaging failure is logged.
      expect(result.proposalStatus).toBe(Status.accepted)
      expect(addMessage).not.toHaveBeenCalled()
      expect(notifyNewMessage).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to mirror decision comment into the proposal thread:',
        expect.any(Error),
      )
    })

    it('does not post to the thread when the comment is absent', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
      })

      expect(result.proposalStatus).toBe(Status.accepted)
      expect(ensureProposalConversation).not.toHaveBeenCalled()
      expect(addMessage).not.toHaveBeenCalled()
      expect(notifyNewMessage).not.toHaveBeenCalled()
    })

    it('does not post to the thread when the comment is only whitespace', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: '   ',
      })

      expect(ensureProposalConversation).not.toHaveBeenCalled()
      expect(addMessage).not.toHaveBeenCalled()
    })
  })

  describe('the Feedback Code index follows the talk (speaker feedback §5.1)', () => {
    // A withdrawn or deleted talk must stop resolving its code at once, and a
    // newly confirmed one must start. The TALK's conference, never the host's:
    // a speaker can act on their own proposal from another tenant's host.
    const expired = () =>
      vi
        .mocked(revalidateTag)
        .mock.calls.filter(([tag]) => tag.startsWith('sanity:feedback-code'))
    beforeEach(() => vi.mocked(revalidateTag).mockClear())

    it('withdrawing a confirmed talk expires the index of the talk’s conference with expire 0', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.confirmed } as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {
          ...mockProposal,
          status: Status.withdrawn,
          conference: { _type: 'reference', _ref: 'conf-of-the-talk' },
        } as any,
        err: null,
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'I can no longer attend the conference.',
      })

      expect(expired()).toEqual([
        [feedbackCodeIndexTag('conf-of-the-talk'), { expire: 0 }],
      ])
    })

    it('a talk of another conference publishes with the talk’s own conference', async () => {
      // A speaker confirming via another tenant's host must still get their
      // ticket, routed and branded by their own conference.
      vi.mocked(eventBus.publish).mockClear()
      const own = { _id: 'conf-of-the-talk', title: 'Other Conf' }
      vi.mocked(getConferenceById).mockResolvedValueOnce({
        conference: own as any,
        domain: 'other.example',
      })
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.accepted } as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {
          ...mockProposal,
          status: Status.confirmed,
          conference: { _type: 'reference', _ref: 'conf-of-the-talk' },
        } as any,
        err: null,
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.confirm,
      })

      expect(getConferenceById).toHaveBeenCalledWith('conf-of-the-talk', {
        includeSpeakerRegistrationLink: true,
      })
      expect(eventBus.publish).toHaveBeenCalledTimes(1)
      const event = vi.mocked(eventBus.publish).mock.calls[0][0] as any
      expect(event.conference).toBe(own)
      expect(event.metadata.domain).toBe('other.example')
    })

    it('a talk of another conference whose conference cannot be loaded publishes nothing', async () => {
      // The event routes Slack, organizer alerts and email branding by the
      // host conference; a foreign talk must not alert the host's organizers.
      vi.mocked(eventBus.publish).mockClear()
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {
          ...mockProposal,
          status: Status.withdrawn,
          conference: { _type: 'reference', _ref: 'conf-of-the-talk' },
        } as any,
        err: null,
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'I can no longer attend the conference.',
      })

      expect(updateProposalStatus).toHaveBeenCalled()
      expect(eventBus.publish).not.toHaveBeenCalled()
    })

    it('a change that never touches "confirmed" leaves it alone', async () => {
      // Only confirmed talks are in the index; CFP-time transitions
      // (submit, unsubmit, accept, reject) must not flush it.
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any, // submitted
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {
          ...mockProposal,
          status: Status.withdrawn,
          conference: { _type: 'reference', _ref: 'conf-of-the-talk' },
        } as any,
        err: null,
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'I can no longer attend the conference.',
      })

      expect(updateProposalStatus).toHaveBeenCalled()
      expect(expired()).toEqual([])
    })

    it('a newly confirmed talk expires it too, so its code starts resolving', async () => {
      const accepted = {
        ...mockProposal,
        _rev: 'rev-accepted',
        status: Status.accepted,
      }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: accepted as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {
          ...accepted,
          status: Status.confirmed,
          conference: { _type: 'reference', _ref: 'conf-of-the-talk' },
        } as any,
        err: null,
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.confirm,
      })

      expect(expired()).toEqual([
        [feedbackCodeIndexTag('conf-of-the-talk'), { expire: 0 }],
      ])
    })

    it('a failed status change expires nothing', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: {} as any,
        err: new Error('patch failed'),
      })

      await expect(
        createAuthenticatedCaller(regularSpeaker._id).proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'I can no longer attend the conference.',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update proposal status',
      })
      // The write was attempted and failed: the refusal is that failure.
      expect(updateProposalStatus).toHaveBeenCalledWith(
        'proposal-1',
        Status.withdrawn,
        'I can no longer attend the conference.',
        undefined,
      )
      expect(expired()).toEqual([])
    })

    it('a speaker’s delete expires the index of the deleted talk’s conference', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(deleteProposal).mockResolvedValue({
        err: null,
        conferenceId: 'conf-of-the-talk',
      })

      await createAuthenticatedCaller(regularSpeaker._id).proposal.action({
        id: 'proposal-1',
        action: Action.delete,
      })

      expect(expired()).toEqual([
        [feedbackCodeIndexTag('conf-of-the-talk'), { expire: 0 }],
      ])
    })

    it('an organizer’s delete expires it too', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: null,
        conferenceId: 'conf-of-the-talk',
      })

      await createAdminCaller().proposal.admin.delete({ id: 'proposal-1' })

      expect(expired()).toEqual([
        [feedbackCodeIndexTag('conf-of-the-talk'), { expire: 0 }],
      ])
    })

    it('a refused delete expires nothing', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new Error('network exploded'),
        conferenceId: null,
      })

      await expect(
        createAdminCaller().proposal.admin.delete({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete proposal',
      })
      expect(deleteProposal).toHaveBeenCalledWith('proposal-1')
      expect(expired()).toEqual([])
    })
  })

  describe('admin.delete', () => {
    it('should delete the proposal for an organizer', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({ err: null })

      const caller = createAdminCaller()
      const result = await caller.proposal.admin.delete({ id: 'proposal-1' })
      expect(result).toEqual({ success: true })
      expect(deleteProposal).toHaveBeenCalledWith('proposal-1')
    })

    it('should surface PRECONDITION_FAILED with the descriptive message when blocked', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new ProposalDeletionBlockedError(
          'Cannot delete proposal: it is referenced by workshop signups. Remove those references first.',
        ),
      })

      const caller = createAdminCaller()
      await expect(
        caller.proposal.admin.delete({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message:
          'Cannot delete proposal: it is referenced by workshop signups. Remove those references first.',
      })
    })

    it('should keep INTERNAL_SERVER_ERROR for unexpected deletion failures', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new Error('network exploded'),
      })

      const caller = createAdminCaller()
      await expect(
        caller.proposal.admin.delete({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete proposal',
      })
    })
  })
})
