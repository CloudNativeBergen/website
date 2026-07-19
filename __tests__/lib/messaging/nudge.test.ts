/**
 * @vitest-environment node
 *
 * Unit tests for the stale-thread nudge (src/lib/messaging/nudge.ts):
 * - the selection GROQ encodes the stale policy (open, quiet 3+ days, not
 *   globally archived, not already nudged for this trailing message, last author
 *   a non-organizer);
 * - routing: the assignee when set, otherwise every organizer;
 * - `lastStaleNudgeAt` is stamped after a successful nudge;
 * - never-fail envelope + per-conversation isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => ['org-1', 'org-2']),
  createNotifications: vi.fn(async () => {}),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { patch: vi.fn() },
}))

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  getOrganizerSpeakerIds,
  createNotifications,
} from '@/lib/notification/sanity'
import {
  nudgeStaleConversations,
  staleConversationCutoff,
  STALE_AFTER_DAYS,
} from '@/lib/messaging/nudge'
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

const assignedConv = {
  _id: 'conversation.gen-1',
  conversationType: 'general' as const,
  subject: 'Need info',
  conferenceId: 'conf-1',
  proposalId: null,
  assignedToId: 'org-2',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

const unassignedProposalConv = {
  _id: 'conversation.proposal.prop-1',
  conversationType: 'proposal' as const,
  subject: 'My Talk',
  conferenceId: 'conf-1',
  proposalId: 'prop-1',
  assignedToId: null,
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(getOrganizerSpeakerIds).mockResolvedValue(['org-1', 'org-2'])
})

describe('staleConversationCutoff', () => {
  it('is exactly STALE_AFTER_DAYS before now', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    expect(staleConversationCutoff(now)).toBe('2026-01-07T00:00:00.000Z')
    expect(STALE_AFTER_DAYS).toBe(3)
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

  it('no-ops (no notifications, no writes) when nothing is stale', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const summary = await nudgeStaleConversations()
    expect(summary).toEqual({
      scanned: 0,
      nudged: 0,
      notifications: 0,
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
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValue([])
    installPatch()
    readMock.fetch.mockResolvedValueOnce([{ ...unassignedProposalConv }])

    const summary = await nudgeStaleConversations()

    expect(summary.scanned).toBe(1)
    expect(summary.nudged).toBe(0)
    expect(createNotificationsMock).not.toHaveBeenCalled()
    expect(patchMock).not.toHaveBeenCalled()
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
