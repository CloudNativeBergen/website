/**
 * @vitest-environment node
 *
 * Unit tests for messaging auto-close (src/lib/messaging/autoClose.ts):
 * - the selection GROQ encodes the policy and is the EXACT COMPLEMENT of the
 *   stale nudge (last author IS an organizer, i.e. we are waiting on THEM);
 * - the only write is `status: 'resolved'`, which is also what makes the job
 *   idempotent (a resolved thread can never be re-selected);
 * - the run is capped and never throws, isolating a per-thread failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  getAllOrganizerSpeakerIdsAcrossOrgs: vi.fn(async () => ['org-1', 'org-2']),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { patch: vi.fn() },
}))

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getAllOrganizerSpeakerIdsAcrossOrgs } from '@/lib/notification/sanity'
import {
  autoCloseStaleConversations,
  autoCloseConversationCutoff,
  AUTO_CLOSE_AFTER_DAYS,
} from '@/lib/messaging/autoClose'
// Auto-close must read "whose court is the ball in" from the SAME projections as
// the inbox needs-reply filter and the nudge (R1) — it is the other half of the
// same board, and a private copy could drift into overlapping with the nudge.
import { LAST_AUTHOR_REF, HAS_ANY_MESSAGE } from '@/lib/messaging/sanity'
import { STALE_AFTER_DAYS, ESCALATE_AFTER_DAYS } from '@/lib/messaging/nudge'

type LooseMock = ReturnType<typeof vi.fn>
const readMock = clientReadUncached as unknown as { fetch: LooseMock }
const patchMock = (clientWrite as unknown as { patch: LooseMock }).patch

/** Chainable patch mock; records `{id, payload}` per committed patch. */
function installPatch(commit: () => Promise<unknown> = async () => ({})) {
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
        return commit()
      }),
    }
    return chain
  })
  return sets
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getAllOrganizerSpeakerIdsAcrossOrgs).mockResolvedValue([
    'org-1',
    'org-2',
  ])
  readMock.fetch.mockResolvedValue([])
})

describe('autoCloseConversationCutoff', () => {
  it('is exactly AUTO_CLOSE_AFTER_DAYS before now', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    expect(autoCloseConversationCutoff(now)).toBe('2026-01-03T00:00:00.000Z')
    expect(AUTO_CLOSE_AFTER_DAYS).toBe(7)
  })

  it('is a LONGER horizon than anything we impose on ourselves', () => {
    // We chase our own side at 3 days and escalate at 6; we only close a
    // speaker's thread after 7. If this ever inverts, we would be closing
    // threads faster than we nudge ourselves to answer them.
    expect(AUTO_CLOSE_AFTER_DAYS).toBeGreaterThan(
      STALE_AFTER_DAYS + ESCALATE_AFTER_DAYS,
    )
  })
})

describe('selection GROQ — the complement of the nudge', () => {
  it('selects open, quiet, organizer-last-authored threads', async () => {
    await autoCloseStaleConversations()
    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain("coalesce(status, 'open') == 'open'")
    expect(query).toContain('lastMessageAt < $cutoff')
    expect(query).toContain(HAS_ANY_MESSAGE)
    expect(query).toContain(LAST_AUTHOR_REF)
    expect(params.organizerIds).toEqual(['org-1', 'org-2'])
    expect(typeof params.cutoff).toBe('string')
  })

  it('tests the last author POSITIVELY — the opposite of the nudge', async () => {
    await autoCloseStaleConversations()
    const [query] = readMock.fetch.mock.calls[0]
    // `LAST_AUTHOR_REF in $organizerIds` (we spoke last) — NOT the nudge's
    // negated `!(... in $organizerIds)` (they spoke last). This is what makes
    // the two jobs mutually exclusive: no thread can be nudged AND closed.
    expect(query).toContain(`${LAST_AUTHOR_REF} in $organizerIds`)
    expect(query).not.toContain(`!(${LAST_AUTHOR_REF} in $organizerIds)`)
  })

  it('is capped and ordered oldest-first, so a backlog drains deterministically', async () => {
    await autoCloseStaleConversations()
    const [query] = readMock.fetch.mock.calls[0]
    expect(query).toContain('order(lastMessageAt asc) [0...200]')
  })

  it('closes NOTHING when there are no organizers (positive `in []` is empty)', async () => {
    vi.mocked(getAllOrganizerSpeakerIdsAcrossOrgs).mockResolvedValue([])
    installPatch()
    // The query is still issued; with an empty id list the positive membership
    // test matches no row, so the real GROQ returns nothing. The mock returns []
    // for the same reason a live dataset would.
    const summary = await autoCloseStaleConversations()
    const [, params] = readMock.fetch.mock.calls[0]
    expect(params.organizerIds).toEqual([])
    expect(summary.closed).toBe(0)
    expect(patchMock).not.toHaveBeenCalled()
  })
})

describe('closing', () => {
  it('sets status resolved — and only that — on each selected thread', async () => {
    const sets = installPatch()
    readMock.fetch.mockResolvedValueOnce([
      { _id: 'conversation.gen-1' },
      { _id: 'conversation.gen-2' },
    ])

    const summary = await autoCloseStaleConversations()

    expect(summary).toEqual({ scanned: 2, closed: 2, failed: 0 })
    expect(sets.map((s) => s.id)).toEqual([
      'conversation.gen-1',
      'conversation.gen-2',
    ])
    // Exactly the value an organizer's own Resolve button writes, and nothing
    // else: no archive, no deletion, no field a speaker could notice.
    for (const s of sets) {
      expect(s.payload).toEqual({ status: 'resolved' })
    }
  })

  it('is idempotent: a re-run selects nothing, because the write leaves the query', async () => {
    // The selection requires status == 'open' and the write sets 'resolved', so
    // the second run of the SAME dataset returns no rows and writes nothing.
    const sets = installPatch()
    readMock.fetch.mockResolvedValueOnce([{ _id: 'conversation.gen-1' }])
    await autoCloseStaleConversations()
    expect(sets).toHaveLength(1)

    readMock.fetch.mockResolvedValue([])
    const second = await autoCloseStaleConversations()
    expect(second).toEqual({ scanned: 0, closed: 0, failed: 0 })
    expect(sets).toHaveLength(1)
  })

  it('no-ops entirely when nothing is stale', async () => {
    installPatch()
    const summary = await autoCloseStaleConversations()
    expect(summary).toEqual({ scanned: 0, closed: 0, failed: 0 })
    expect(patchMock).not.toHaveBeenCalled()
  })
})

describe('resilience', () => {
  it('never throws: a read failure returns a zeroed summary', async () => {
    readMock.fetch.mockRejectedValueOnce(new Error('sanity down'))
    const summary = await autoCloseStaleConversations()
    expect(summary).toEqual({ scanned: 0, closed: 0, failed: 0 })
  })

  it('isolates a per-conversation write failure and continues', async () => {
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
      { _id: 'conversation.gen-1' },
      { _id: 'conversation.gen-2' },
    ])

    const summary = await autoCloseStaleConversations()

    expect(summary).toEqual({ scanned: 2, closed: 1, failed: 1 })
  })
})
