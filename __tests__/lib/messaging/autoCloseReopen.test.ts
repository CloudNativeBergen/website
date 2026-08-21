/**
 * @vitest-environment node
 *
 * The auto-close → auto-REOPEN round trip, end to end through production code.
 *
 * Auto-closing a thread is only defensible because it heals itself: a
 * non-organizer replying to a resolved thread reopens it (reopen-on-reply, S3).
 * That safety property spans three modules — the cron job writes `resolved`,
 * `message.send` decides `reopen`, and `addMessage` folds `status: 'open'` into
 * the message transaction — so testing them separately would leave the seam
 * between them untested, which is exactly where a wrongly-closed-and-never-
 * reopened thread would live.
 *
 * Only PERSISTENCE is faked here: one in-memory conversation document that the
 * real Sanity patch/transaction calls mutate. Every decision (which threads to
 * close, whether to reopen, what to write) is made by the real code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'

const CONVERSATION_ID = 'conversation.proposal.prop-1'
const nonOrganizer = speakers[0]._id!
const organizerId = speakers.find((s) => s.isOrganizer)!._id!

/** The single persisted conversation the whole round trip acts on. */
let doc: Record<string, unknown>

// The domain conference carries the `organization` ref the org-scoped authz
// waist resolves from; it must match the organizer fixture's organizerOrgIds.
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

// Fan-out is out of scope for the round trip (and never-fail by contract).
vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(async () => {}),
  notifySponsorMessage: vi.fn(async () => {}),
}))
vi.mock('@/lib/notification/sanity', () => ({
  getAllOrganizerSpeakerIdsAcrossOrgs: vi.fn(async () => ['organizer-id']),
  getOrganizerSpeakerIds: vi.fn(async () => ['organizer-id']),
  getOrganizerSpeakerIdsForOrg: vi.fn(async () => ['organizer-id']),
  createNotifications: vi.fn(async () => {}),
}))
// The message's denormalized tenant key is orthogonal to this round trip.
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(async () => null),
  organizationField: () => ({}),
}))

// The fake persistence layer: reads are served FROM `doc`, writes are applied TO
// it, so a status written by one module is genuinely observed by the next.
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: vi.fn(async (query: string, params: Record<string, unknown>) => {
      // The auto-close selection. Its real predicates (open + quiet + last
      // author is an organizer) are asserted against the GROQ string in
      // autoClose.test.ts; here the only one that has to be LIVE is
      // `status == 'open'`, because that is what makes the second run a no-op.
      if (query.includes("coalesce(status, 'open') == 'open'")) {
        const organizerIds = (params.organizerIds ?? []) as string[]
        return doc.status === 'open' && organizerIds.length > 0
          ? [{ _id: doc._id }]
          : []
      }
      // getConversationById
      if (query.includes('_id == $id')) {
        return params.id === doc._id ? { ...doc } : null
      }
      return null
    }),
  },
  clientWrite: {
    // Used by the auto-close job (`set`) and by claim-on-reply (`setIfMissing`,
    // whose whole point is that it does NOT overwrite an existing key — the
    // fake honours that, so a claim on an owned thread really is a no-op here).
    patch: vi.fn((id: string) => {
      const ops: {
        kind: 'set' | 'setIfMissing'
        payload: Record<string, unknown>
      }[] = []
      const chain = {
        set: (p: Record<string, unknown>) => {
          ops.push({ kind: 'set', payload: p })
          return chain
        },
        setIfMissing: (p: Record<string, unknown>) => {
          ops.push({ kind: 'setIfMissing', payload: p })
          return chain
        },
        commit: async () => {
          if (id === doc._id) {
            for (const op of ops) {
              for (const [key, value] of Object.entries(op.payload)) {
                if (op.kind === 'set' || doc[key] === undefined) {
                  doc[key] = value
                }
              }
            }
          }
          return { ...doc }
        },
      }
      return chain
    }),
    // Used by addMessage: create the message + patch the conversation.
    transaction: vi.fn(() => {
      const patches: { id: string; payload: Record<string, unknown> }[] = []
      const tx = {
        create: () => tx,
        patch: (
          id: string,
          fn: (p: {
            set: (payload: Record<string, unknown>) => unknown
          }) => unknown,
        ) => {
          fn({
            set: (payload: Record<string, unknown>) => {
              patches.push({ id, payload })
              return {}
            },
          })
          return tx
        },
        commit: async () => {
          for (const p of patches) {
            if (p.id === doc._id) Object.assign(doc, p.payload)
          }
          return {}
        },
      }
      return tx
    }),
  },
}))

import { autoCloseStaleConversations } from '@/lib/messaging/autoClose'

/** An ISO timestamp `n` days before now. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  doc = {
    _id: CONVERSATION_ID,
    _type: 'conversation',
    conferenceId: 'conf-1',
    conferenceOrgId: 'org-test',
    conversationType: 'proposal',
    proposalId: 'prop-1',
    proposalTitle: 'My Talk',
    // The non-organizer speaker is ON the proposal, so the real
    // `canAccessConversation` lets them post.
    proposalSpeakerIds: [nonOrganizer],
    createdById: nonOrganizer,
    subject: 'My Talk',
    createdAt: daysAgo(20),
    // Quiet for longer than AUTO_CLOSE_AFTER_DAYS, last word ours.
    lastMessageAt: daysAgo(10),
    status: 'open',
  }
})

describe('auto-close → auto-reopen round trip', () => {
  it('closes a thread we are waiting on, then a speaker reply reopens it', async () => {
    const closed = await autoCloseStaleConversations()
    expect(closed).toEqual({ scanned: 1, closed: 1, failed: 0 })
    expect(doc.status).toBe('resolved')

    // The speaker finally comes back. Nothing about the thread was hidden from
    // them, and their reply alone undoes the automated close — no organizer
    // action, no support request.
    await createAuthenticatedCaller(nonOrganizer).message.send({
      conversationId: CONVERSATION_ID,
      body: 'Sorry for the delay — here is the info you asked for.',
    })

    expect(doc.status).toBe('open')
    // The thread also re-enters the queue with fresh activity, so the nudge
    // ladder starts over rather than treating it as still-stale.
    expect((doc.lastMessageAt as string) > daysAgo(1)).toBe(true)
  })

  it('a second cron run is a no-op — the closed thread is gone from the query', async () => {
    await autoCloseStaleConversations()
    const second = await autoCloseStaleConversations()
    expect(second).toEqual({ scanned: 0, closed: 0, failed: 0 })
    expect(doc.status).toBe('resolved')
  })

  it('an ORGANIZER reply does NOT reopen an auto-closed thread', async () => {
    await autoCloseStaleConversations()
    expect(doc.status).toBe('resolved')

    // Reopen is the SPEAKER's lever only: an organizer adding a note to a closed
    // thread must not silently push it back into the needs-reply queue.
    await createAdminCaller().message.send({
      conversationId: CONVERSATION_ID,
      body: 'Closing note for the record.',
    })

    expect(doc.status).toBe('resolved')
  })

  it('claims the auto-closed thread for the organizer who writes that note', async () => {
    // The two features compose: closing does not take ownership off the table.
    await autoCloseStaleConversations()
    const result = await createAdminCaller().message.send({
      conversationId: CONVERSATION_ID,
      body: 'Closing note for the record.',
    })

    expect(result.claimed).toBe(true)
    expect((doc.assignedTo as { _ref: string })._ref).toBe(organizerId)
  })
})
