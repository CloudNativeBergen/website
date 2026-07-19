/**
 * @vitest-environment node
 *
 * Unit tests for the ticketing additions to the messaging data layer
 * (src/lib/messaging/sanity.ts):
 * - the inbox VIEW filters compile to the right GROQ predicate BEFORE pagination
 *   (organizer + speaker variants), including the correlated per-user-archive
 *   exclusion;
 * - derived per-row `needsReply` / `archived` (audience-appropriate);
 * - per-user vs global archive independence and resurface-on-new-message
 *   (timestamp comparison);
 * - the status / assignee / archive mutations and setPreference's `archived`.
 *
 * Both Sanity clients are mocked so we assert exactly what is written / queried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn(), patch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => [] as string[]),
}))

import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getOrganizerSpeakerIds } from '@/lib/notification/sanity'
import {
  listConversationsForSpeaker,
  setConversationStatus,
  setConversationAssignee,
  setConversationArchived,
  setConversationPreference,
} from '@/lib/messaging/sanity'

type LooseMock = ReturnType<typeof vi.fn>
const writeMock = clientWrite as unknown as {
  transaction: LooseMock
  create: LooseMock
  patch: LooseMock
}
const readMock = clientReadUncached as unknown as { fetch: LooseMock }

/** Chainable patch mock for `clientWrite.patch(id).set().unset().commit()`. */
function installPatch() {
  const patch = {
    set: vi.fn((_v?: Record<string, unknown>) => patch),
    unset: vi.fn((_v?: string[]) => patch),
    commit: vi.fn(async () => ({})),
  }
  writeMock.patch.mockReturnValue(patch)
  return patch
}

/** Transaction mock that INVOKES the `patch(id, fn)` callback so we can assert
 *  the set/unset ops the preference upsert builds. */
function installTransaction() {
  const patchBuilder = {
    set: vi.fn((_v?: Record<string, unknown>) => patchBuilder),
    unset: vi.fn((_v?: string[]) => patchBuilder),
  }
  const tx = {
    create: vi.fn(() => tx),
    createIfNotExists: vi.fn(() => tx),
    patch: vi.fn((_id: string, fn?: (p: typeof patchBuilder) => unknown) => {
      if (typeof fn === 'function') fn(patchBuilder)
      return tx
    }),
    commit: vi.fn(async () => ({})),
  }
  writeMock.transaction.mockReturnValue(tx)
  return { tx, patchBuilder }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ---------------------------------------------------------------------------
// View → GROQ predicate (applied BEFORE pagination)
// ---------------------------------------------------------------------------

/** Run the list query for a view and return the main query string + params. */
async function queryForView({
  isOrganizer,
  view,
  speakerId = 'org-1',
}: {
  isOrganizer: boolean
  view?: Parameters<typeof listConversationsForSpeaker>[0]['view']
  speakerId?: string
}): Promise<{ query: string; params: Record<string, unknown> }> {
  // Empty page → the function returns after the single main fetch.
  readMock.fetch.mockResolvedValueOnce([])
  await listConversationsForSpeaker({
    speakerId,
    isOrganizer,
    conferenceId: 'conf-1',
    view,
  })
  const [query, params] = readMock.fetch.mock.calls[0]
  return { query, params }
}

// The exact correlated per-user-archive exclusion (documented in the PR). The
// deterministic preference id keeps it a cheap point lookup.
const PREF_ARCHIVE_FILTER =
  "*[_id == 'convpref.' + ^._id + '.' + $speakerId && defined(archivedAt) && archivedAt >= ^.lastMessageAt]"

describe('inbox views — ORGANIZER GROQ predicates', () => {
  it('active (default): open AND not globally archived AND not per-user archived', async () => {
    const { query, params } = await queryForView({ isOrganizer: true })
    expect(query).toContain("coalesce(status, 'open') == 'open'")
    expect(query).toContain(
      '(!defined(archivedAt) || archivedAt < lastMessageAt)',
    )
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) == 0`)
    // No organizer-id param unless the needs-reply view needs it.
    expect(params.organizerIds).toBeUndefined()
    expect(params.speakerId).toBe('org-1')
  })

  it('needs-reply: active AND last author not an organizer (binds $organizerIds)', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValueOnce(['org-1', 'org-2'])
    const { query, params } = await queryForView({
      isOrganizer: true,
      view: 'needs-reply',
    })
    expect(query).toContain("coalesce(status, 'open') == 'open'")
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) == 0`)
    expect(query).toContain("coalesce(status, 'open') != 'resolved'")
    // The last-message author must not be in the organizer set.
    expect(query).toContain('in $organizerIds)')
    // R2 guard: with an empty organizer set `x in []` is false, so the negation
    // would vacuously match EVERY thread. The `count(...) > 0` gate prevents the
    // needs-reply view flooding on a misconfigured/transiently-empty org set.
    expect(query).toContain('count($organizerIds) > 0')
    expect(params.organizerIds).toEqual(['org-1', 'org-2'])
  })

  it('mine: active AND assigned to the caller', async () => {
    const { query } = await queryForView({ isOrganizer: true, view: 'mine' })
    expect(query).toContain('assignedTo._ref == $speakerId')
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) == 0`)
  })

  it('resolved: status resolved AND not archived (neither global nor per-user)', async () => {
    const { query } = await queryForView({
      isOrganizer: true,
      view: 'resolved',
    })
    expect(query).toContain("coalesce(status, 'open') == 'resolved'")
    expect(query).toContain(
      '(!defined(archivedAt) || archivedAt < lastMessageAt)',
    )
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) == 0`)
  })

  it('archived: globally OR per-user archived', async () => {
    const { query } = await queryForView({
      isOrganizer: true,
      view: 'archived',
    })
    expect(query).toContain(
      '(defined(archivedAt) && archivedAt >= lastMessageAt)',
    )
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) > 0`)
  })

  it('all: no status/archive predicate', async () => {
    const { query } = await queryForView({ isOrganizer: true, view: 'all' })
    expect(query).not.toContain("count(*[_id == 'convpref")
    expect(query).not.toContain("== 'resolved'")
    expect(query).not.toContain('assignedTo._ref == $speakerId')
  })
})

describe('inbox views — SPEAKER GROQ predicates (per-user archive only)', () => {
  it('active: excludes ONLY the caller per-user archive, ignores global/status', async () => {
    const { query } = await queryForView({
      isOrganizer: false,
      speakerId: 'sp-1',
    })
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) == 0`)
    // Speakers never filter on global archive or status.
    expect(query).not.toContain("== 'open'")
    expect(query).not.toContain('archivedAt < lastMessageAt')
    // Access scope is still applied.
    expect(query).toContain('createdBy._ref == $speakerId')
  })

  it('archived: the caller per-user archive only', async () => {
    const { query } = await queryForView({
      isOrganizer: false,
      speakerId: 'sp-1',
      view: 'archived',
    })
    expect(query).toContain(`count(${PREF_ARCHIVE_FILTER}) > 0`)
    expect(query).not.toContain(
      '(defined(archivedAt) && archivedAt >= lastMessageAt)',
    )
  })

  it('all: no archive predicate', async () => {
    const { query } = await queryForView({
      isOrganizer: false,
      speakerId: 'sp-1',
      view: 'all',
    })
    expect(query).not.toContain("count(*[_id == 'convpref")
  })
})

// ---------------------------------------------------------------------------
// Derived per-row needsReply / archived (timestamp semantics)
// ---------------------------------------------------------------------------

function orgRow(overrides: Record<string, unknown>) {
  return {
    _id: 'conversation.gen-1',
    conversationType: 'general' as const,
    subject: 'Q',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-02-01T00:00:00.000Z',
    status: 'open' as const,
    assignedTo: null,
    archivedAt: null,
    lastMessage: {
      authorId: 'sp-9',
      authorName: 'Kari',
      authorImage: null,
      body: 'hi',
    },
    speakerSideName: 'Kari',
    speakerSideImage: null,
    ...overrides,
  }
}

describe('derived needsReply (ORGANIZER audience)', () => {
  it('true when the last author is a non-organizer and status is open', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValueOnce(['org-1'])
    readMock.fetch.mockResolvedValueOnce([orgRow({})]).mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.needsReply).toBe(true)
  })

  it('false when the last author IS an organizer', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValueOnce(['org-1'])
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({
          lastMessage: {
            authorId: 'org-1',
            authorName: 'O',
            authorImage: null,
            body: 'x',
          },
        }),
      ])
      .mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.needsReply).toBe(false)
  })

  it('false when resolved, and false when there is no message yet', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValue(['org-1'])
    readMock.fetch
      .mockResolvedValueOnce([orgRow({ status: 'resolved' })])
      .mockResolvedValueOnce([])
    const [resolved] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(resolved.needsReply).toBe(false)

    readMock.fetch
      .mockResolvedValueOnce([orgRow({ lastMessage: null })])
      .mockResolvedValueOnce([])
    const [noMsg] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(noMsg.needsReply).toBe(false)
  })

  it('is FALSE for an ORGANIZER when the organizer set is empty (R2 guard)', async () => {
    // A misconfigured conference (or a transient organizer-fetch that resolves
    // empty) must NOT flag every thread as needing a reply — nobody can reply.
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValue([])
    readMock.fetch.mockResolvedValueOnce([orgRow({})]).mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.needsReply).toBe(false)
  })

  it('is always false for a SPEAKER caller', async () => {
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValueOnce([])
    readMock.fetch.mockResolvedValueOnce([orgRow({})]).mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'sp-9',
      isOrganizer: false,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.needsReply).toBe(false)
  })
})

describe('derived archived — global vs per-user, resurface-on-new-message', () => {
  it('globally archived when archivedAt >= lastMessageAt (organizer)', async () => {
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({
          lastMessageAt: '2026-02-01T00:00:00.000Z',
          archivedAt: '2026-02-01T00:00:00.000Z', // equal → archived
        }),
      ])
      .mockResolvedValueOnce([]) // unread
      .mockResolvedValueOnce([]) // pref
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.archived).toBe(true)
  })

  it('AUTO-RESURFACES when a newer message pushes lastMessageAt past archivedAt', async () => {
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({
          lastMessageAt: '2026-03-01T00:00:00.000Z', // newer than archive
          archivedAt: '2026-02-01T00:00:00.000Z',
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.archived).toBe(false)
  })

  it('per-user and global archive are INDEPENDENT: a speaker ignores global archive', async () => {
    // Globally archived, but the speaker has NO per-user archive → not archived
    // for the speaker (global archive is an organizer-side hide).
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({
          lastMessageAt: '2026-02-01T00:00:00.000Z',
          archivedAt: '2026-02-01T00:00:00.000Z',
        }),
      ])
      .mockResolvedValueOnce([]) // unread
      .mockResolvedValueOnce([]) // pref: none
    const [speakerRow] = await listConversationsForSpeaker({
      speakerId: 'sp-9',
      isOrganizer: false,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(speakerRow.archived).toBe(false)

    // Same conversation, this time the speaker DID per-user archive it (pref
    // archivedAt >= lastMessageAt) → archived for the speaker.
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({ lastMessageAt: '2026-02-01T00:00:00.000Z', archivedAt: null }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          conversationId: 'conversation.gen-1',
          archivedAt: '2026-02-02T00:00:00.000Z',
        },
      ])
    const [archivedForSpeaker] = await listConversationsForSpeaker({
      speakerId: 'sp-9',
      isOrganizer: false,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(archivedForSpeaker.archived).toBe(true)
  })

  it('projects status (coalesced) and assignedTo deref', async () => {
    readMock.fetch
      .mockResolvedValueOnce([
        orgRow({
          status: 'resolved',
          assignedTo: { _id: 'org-2', name: 'Ola' },
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const [row] = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'all',
    })
    expect(row.status).toBe('resolved')
    expect(row.assignedTo).toEqual({ _id: 'org-2', name: 'Ola' })
    // The projection coalesces an absent status to 'open'.
    const [query] = readMock.fetch.mock.calls[0]
    expect(query).toContain('"status": coalesce(status, \'open\')')
    expect(query).toContain('"assignedTo": assignedTo->{ _id, name }')
  })
})

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

describe('setConversationStatus', () => {
  it('patches the status field', async () => {
    const patch = installPatch()
    await setConversationStatus('conversation.gen-1', 'resolved')
    expect(writeMock.patch).toHaveBeenCalledWith('conversation.gen-1')
    expect(patch.set).toHaveBeenCalledWith({ status: 'resolved' })
    expect(patch.commit).toHaveBeenCalledTimes(1)
  })
})

describe('setConversationAssignee', () => {
  it('sets a WEAK assignee reference', async () => {
    const patch = installPatch()
    await setConversationAssignee('conversation.gen-1', 'org-2')
    expect(patch.set).toHaveBeenCalledWith({
      assignedTo: { _type: 'reference', _ref: 'org-2', _weak: true },
    })
  })

  it('unsets the assignee when passed null', async () => {
    const patch = installPatch()
    await setConversationAssignee('conversation.gen-1', null)
    expect(patch.unset).toHaveBeenCalledWith(['assignedTo'])
    expect(patch.set).not.toHaveBeenCalled()
  })
})

describe('setConversationArchived — global archive timestamp semantics', () => {
  it('stamps archivedAt = now when archiving', async () => {
    const patch = installPatch()
    await setConversationArchived('conversation.gen-1', true)
    const arg = patch.set.mock.calls[0][0] as { archivedAt: string }
    expect(typeof arg.archivedAt).toBe('string')
    expect(patch.unset).not.toHaveBeenCalled()
  })

  it('unsets archivedAt when un-archiving', async () => {
    const patch = installPatch()
    await setConversationArchived('conversation.gen-1', false)
    expect(patch.unset).toHaveBeenCalledWith(['archivedAt'])
    expect(patch.set).not.toHaveBeenCalled()
  })
})

describe('setConversationPreference — per-user archive', () => {
  it('stamps the preference archivedAt when archived=true', async () => {
    const { patchBuilder } = installTransaction()
    readMock.fetch.mockResolvedValue(null)
    await setConversationPreference({
      conversationId: 'conversation.gen-1',
      speakerId: 'sp-3',
      archived: true,
    })
    const arg = patchBuilder.set.mock.calls[0][0] as { archivedAt: string }
    expect(typeof arg.archivedAt).toBe('string')
    expect(patchBuilder.unset).not.toHaveBeenCalled()
  })

  it('unsets the preference archivedAt when archived=false', async () => {
    const { patchBuilder } = installTransaction()
    readMock.fetch.mockResolvedValue(null)
    await setConversationPreference({
      conversationId: 'conversation.gen-1',
      speakerId: 'sp-3',
      archived: false,
    })
    expect(patchBuilder.unset).toHaveBeenCalledWith(['archivedAt'])
  })
})
