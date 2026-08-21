/**
 * @vitest-environment node
 *
 * Unit tests for the stale-thread nudge (src/lib/messaging/nudge.ts):
 * - the selection GROQ encodes the stale policy (open, quiet 3+ days, not
 *   globally archived, not already nudged for this trailing message, last author
 *   a non-organizer);
 * - routing: the assignee when set, otherwise every organizer;
 * - ESCALATION (B1b): an assigned thread still unanswered a further
 *   ESCALATE_AFTER_DAYS later widens to the assignee PLUS the routed set, once;
 * - `lastStaleNudgeAt` is stamped after a successful nudge;
 * - never-fail envelope + per-conversation isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIdsForOrg: vi.fn(async () => ['org-1', 'org-2']),
  // The candidacy superset is now an explicitly named cross-org read (#723).
  getAllOrganizerSpeakerIdsAcrossOrgs: vi.fn(async () => ['org-1', 'org-2']),
  createNotifications: vi.fn(async () => {}),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { patch: vi.fn() },
}))

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  getOrganizerSpeakerIdsForOrg,
  createNotifications,
} from '@/lib/notification/sanity'
import {
  nudgeStaleConversations,
  staleConversationCutoff,
  escalationConversationCutoff,
  STALE_AFTER_DAYS,
  ESCALATE_AFTER_DAYS,
} from '@/lib/messaging/nudge'
// The nudge selection MUST use the SAME last-author projection as the inbox
// needs-reply filter (single home — R1).
import { LAST_AUTHOR_REF, HAS_ANY_MESSAGE } from '@/lib/messaging/sanity'
import type { NotificationInput } from '@/lib/notification/types'

type LooseMock = ReturnType<typeof vi.fn>
const readMock = clientReadUncached as unknown as { fetch: LooseMock }
const patchMock = (clientWrite as unknown as { patch: LooseMock }).patch
const createNotificationsMock = createNotifications as unknown as LooseMock

/** Chainable patch mock; records committed ids and returns a set/commit chain. */
function installPatch(commit: () => Promise<unknown> = async () => ({})) {
  const committed: string[] = []
  patchMock.mockImplementation((id: string) => {
    const chain = {
      set: vi.fn(() => chain),
      commit: vi.fn(async () => {
        committed.push(id)
        return commit()
      }),
    }
    return chain
  })
  return committed
}

/** An ISO timestamp `n` days before now — the nudge's phase is age-dependent. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Stale (>{@link STALE_AFTER_DAYS}) but inside the escalation window
 * (<STALE + {@link ESCALATE_AFTER_DAYS}), so an ASSIGNED fixture takes the
 * first-nudge branch. Fixtures are relative rather than fixed because the phase
 * a row lands in is a function of how long it has been quiet.
 */
const STALE_NOT_ESCALATED = daysAgo(STALE_AFTER_DAYS + 1)
/** Past the combined window, so an ASSIGNED fixture escalates. */
const PAST_ESCALATION = daysAgo(STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS + 1)

const assignedConv = {
  _id: 'conversation.gen-1',
  conversationType: 'general' as const,
  subject: 'Need info',
  conferenceId: 'conf-1',
  proposalId: null,
  assignedToId: 'org-2',
  lastMessageAt: STALE_NOT_ESCALATED,
}

const unassignedProposalConv = {
  _id: 'conversation.proposal.prop-1',
  conversationType: 'proposal' as const,
  subject: 'My Talk',
  conferenceId: 'conf-1',
  proposalId: 'prop-1',
  assignedToId: null,
  lastMessageAt: STALE_NOT_ESCALATED,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(getOrganizerSpeakerIdsForOrg).mockResolvedValue(['org-1', 'org-2'])
  // B4: the loop now batch-resolves each conversation's conference → owning org
  // before scoping recipients. That extra read is the ONLY fetch carrying
  // `organization._ref`; route it to a stable mapping so conf-1 owns org-1 (the
  // per-test `mockResolvedValueOnce` still supplies the selection rows first).
  // Everything else (the selection query, the teams read) falls through to [].
  readMock.fetch.mockImplementation(async (query: unknown) => {
    if (typeof query === 'string' && query.includes('organization._ref')) {
      return [{ _id: 'conf-1', orgId: 'org-1' }]
    }
    return []
  })
})

describe('staleConversationCutoff', () => {
  it('is exactly STALE_AFTER_DAYS before now', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    expect(staleConversationCutoff(now)).toBe('2026-01-07T00:00:00.000Z')
    expect(STALE_AFTER_DAYS).toBe(3)
  })

  it('escalationConversationCutoff adds ESCALATE_AFTER_DAYS on top', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    expect(escalationConversationCutoff(now)).toBe('2026-01-04T00:00:00.000Z')
    expect(ESCALATE_AFTER_DAYS).toBe(3)
    // The escalation cutoff is strictly OLDER than the stale one, so a thread
    // can never escalate before it has been nudged at all.
    expect(
      escalationConversationCutoff(now) < staleConversationCutoff(now),
    ).toBe(true)
  })
})

describe('selection GROQ encodes the stale policy', () => {
  it('filters on status, cutoff, global archive, prior nudge, and non-organizer last author', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    await nudgeStaleConversations()
    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain("coalesce(status, 'open') == 'open'")
    expect(query).toContain('lastMessageAt < $cutoff')
    expect(query).toContain(
      '(!defined(archivedAt) || archivedAt < lastMessageAt)',
    )
    expect(query).toContain(
      '(!defined(lastStaleNudgeAt) || lastStaleNudgeAt < lastMessageAt)',
    )
    expect(query).toContain('in $organizerIds)')
    expect(params.organizerIds).toEqual(['org-1', 'org-2'])
    expect(typeof params.cutoff).toBe('string')
  })

  it('re-offers an ASSIGNED thread for escalation, and only until it escalates', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    await nudgeStaleConversations()
    const [query, params] = readMock.fetch.mock.calls[0]
    // The escalation disjunct: assigned, quiet past the combined window, and its
    // existing stamp still BEFORE lastMessageAt + that window (which is what an
    // escalated nudge's own stamp is guaranteed to be at or past — so an
    // escalated thread drops out instead of holding a slot of the 200 cap
    // forever).
    expect(query).toContain('defined(assignedTo)')
    expect(query).toContain('lastMessageAt < $escalationCutoff')
    expect(query).toContain(
      'dateTime(lastStaleNudgeAt) < dateTime(lastMessageAt) + $escalationWindowSeconds',
    )
    // BOTH sides are wrapped in dateTime(): a Sanity datetime field is a STRING
    // in GROQ and `string < datetime` evaluates to NULL, not false — an unwrapped
    // comparison would make the clause silently never match. Verified against
    // production GROQ, not assumed.
    expect(query).not.toMatch(/[^(]lastStaleNudgeAt < dateTime\(/)
    expect(params.escalationWindowSeconds).toBe(
      (STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS) * 24 * 60 * 60,
    )
    expect(params.escalationCutoff < params.cutoff).toBe(true)
  })

  it('uses the SHARED LAST_AUTHOR_REF + HAS_ANY_MESSAGE projections (single home, R1/M3)', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    await nudgeStaleConversations()
    const [query] = readMock.fetch.mock.calls[0]
    // Existence is gated by the shared HAS_ANY_MESSAGE (so a SPONSOR-authored
    // last message, which has no author ref, still qualifies — M3), and the
    // author-is-organizer check reuses the exact LAST_AUTHOR_REF once, proving the
    // nudge never re-declares a divergent copy of either projection.
    expect(query).toContain(HAS_ANY_MESSAGE)
    expect(query).toContain(LAST_AUTHOR_REF)
    expect(query.split(LAST_AUTHOR_REF).length - 1).toBe(1)
  })

  it('no-ops (no notifications, no writes) when nothing is stale', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const summary = await nudgeStaleConversations()
    expect(summary).toEqual({
      scanned: 0,
      nudged: 0,
      notifications: 0,
      escalated: 0,
      failed: 0,
    })
    expect(createNotificationsMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
  })
})

describe('routing + stamping', () => {
  it('notifies ONLY the assignee when set, and stamps lastStaleNudgeAt', async () => {
    const committed = installPatch()
    readMock.fetch.mockResolvedValueOnce([assignedConv])

    const summary = await nudgeStaleConversations()

    expect(summary.scanned).toBe(1)
    expect(summary.nudged).toBe(1)
    expect(summary.notifications).toBe(1)
    const inputs = createNotificationsMock.mock
      .calls[0][0] as NotificationInput[]
    expect(inputs).toHaveLength(1)
    expect(inputs[0].recipientId).toBe('org-2')
    expect(inputs[0].notificationType).toBe('message_stale')
    // General thread → admin messages deep link, no relatedProposal.
    expect(inputs[0].link).toBe('/admin/messages/conversation.gen-1')
    expect(inputs[0].relatedProposalId).toBeUndefined()
    // Stamped after notifying.
    expect(committed).toEqual(['conversation.gen-1'])
  })

  it('notifies EVERY organizer when unassigned, links to the admin proposal thread', async () => {
    installPatch()
    readMock.fetch.mockResolvedValueOnce([unassignedProposalConv])

    const summary = await nudgeStaleConversations()

    expect(summary.notifications).toBe(2)
    const inputs = createNotificationsMock.mock
      .calls[0][0] as NotificationInput[]
    expect(inputs.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    // Proposal thread → admin proposal deep link + weak relatedProposal.
    expect(inputs[0].link).toBe('/admin/proposals/prop-1#messages')
    expect(inputs[0].relatedProposalId).toBe('prop-1')
  })

  it('skips (does not stamp) an unassigned thread when there are no organizers', async () => {
    vi.mocked(getOrganizerSpeakerIdsForOrg).mockResolvedValue([])
    installPatch()
    readMock.fetch.mockResolvedValueOnce([{ ...unassignedProposalConv }])

    const summary = await nudgeStaleConversations()

    expect(summary.scanned).toBe(1)
    expect(summary.nudged).toBe(0)
    expect(createNotificationsMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
  })
})

describe('escalation (B1b)', () => {
  /** Records every `.set()` payload committed, keyed by conversation id. */
  function installRecordingPatch() {
    const sets: { id: string; payload: Record<string, unknown> }[] = []
    patchMock.mockImplementation((id: string) => {
      let payload: Record<string, unknown> = {}
      const chain = {
        set: vi.fn((p: Record<string, unknown>) => {
          payload = p
          return chain
        }),
        commit: vi.fn(async () => {
          sets.push({ id, payload })
          return {}
        }),
      }
      return chain
    })
    return sets
  }

  it('widens an assigned thread to assignee + all organizers past the window', async () => {
    installPatch()
    readMock.fetch.mockResolvedValueOnce([
      { ...assignedConv, lastMessageAt: PAST_ESCALATION },
    ])

    const summary = await nudgeStaleConversations()

    const inputs = createNotificationsMock.mock
      .calls[0][0] as NotificationInput[]
    // org-2 IS the assignee and is also in the org's organizer set: the union is
    // deduped, so the owner is never notified twice about one thread.
    expect(inputs.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
    expect(summary.escalated).toBe(1)
    expect(summary.notifications).toBe(2)
  })

  it('stamps past lastMessageAt + the window, which is what makes it fire ONCE', async () => {
    const sets = installRecordingPatch()
    readMock.fetch.mockResolvedValueOnce([
      { ...assignedConv, lastMessageAt: PAST_ESCALATION },
    ])

    await nudgeStaleConversations()

    // The idempotence argument in the module doc, asserted as a VALUE: the stamp
    // an escalated nudge writes is at/past `lastMessageAt + 6 days`, which is
    // precisely the bound the selection GROQ's escalation clause requires the
    // stamp to be BELOW. One escalation per trailing message, no extra field.
    expect(sets).toHaveLength(1)
    const stamp = sets[0].payload.lastStaleNudgeAt as string
    const windowEnd = new Date(
      new Date(PAST_ESCALATION).getTime() +
        (STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS) * 24 * 60 * 60 * 1000,
    ).toISOString()
    expect(stamp > windowEnd).toBe(true)
  })

  it('an UNASSIGNED thread never escalates, however old', async () => {
    installPatch()
    readMock.fetch.mockResolvedValueOnce([
      { ...unassignedProposalConv, lastMessageAt: daysAgo(90) },
    ])

    const summary = await nudgeStaleConversations()

    // Same team fan-out as always, and not counted as an escalation — the
    // escalation ladder exists only to undo the narrowing that assignment does.
    expect(summary.nudged).toBe(1)
    expect(summary.escalated).toBe(0)
    expect(summary.notifications).toBe(2)
  })
})

describe('resilience', () => {
  it('never throws: a read failure returns a zeroed summary', async () => {
    readMock.fetch.mockRejectedValueOnce(new Error('sanity down'))
    const summary = await nudgeStaleConversations()
    expect(summary).toEqual({
      scanned: 0,
      nudged: 0,
      notifications: 0,
      escalated: 0,
      failed: 0,
    })
  })

  it('isolates a per-conversation failure and continues with the rest', async () => {
    // First conversation's stamp throws; the second still gets nudged.
    let call = 0
    patchMock.mockImplementation(() => {
      const chain = {
        set: vi.fn(() => chain),
        commit: vi.fn(async () => {
          call += 1
          if (call === 1) throw new Error('write conflict')
          return {}
        }),
      }
      return chain
    })
    readMock.fetch.mockResolvedValueOnce([
      assignedConv,
      { ...assignedConv, _id: 'conversation.gen-2', assignedToId: 'org-1' },
    ])

    const summary = await nudgeStaleConversations()

    expect(summary.scanned).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.nudged).toBe(1)
  })
})
