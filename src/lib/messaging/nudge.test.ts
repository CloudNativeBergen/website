import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Boundary mocks --------------------------------------------------------

const createNotificationsMock = vi.fn().mockResolvedValue(undefined)
// Per-org organizer sets: the nudge now passes the resolved org id and must get
// back ONLY that tenant's organizers (B4). The default returns the legacy trio
// for every org so the routing-chain test below is unaffected.
const getOrganizerSpeakerIdsMock = vi
  .fn()
  .mockResolvedValue(['org-1', 'org-2', 'org-3'])
const getAllOrganizersMock = vi
  .fn()
  .mockResolvedValue(['org-1', 'org-2', 'org-3', 'org-9'])
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
  getOrganizerSpeakerIdsForOrg: (orgId: string | null) =>
    getOrganizerSpeakerIdsMock(orgId),
  // The candidacy filter's cross-org superset is now an EXPLICITLY named read
  // (#723) — it can no longer be reached by omitting an argument.
  getAllOrganizerSpeakerIdsAcrossOrgs: () => getAllOrganizersMock(),
}))

// TEAMS-2 teams SOURCE keyed by conference id, so the REAL
// `resolveRoutedOrganizerIds` runs the assignee → team → all chain.
const getConferenceTeamsMock = vi.fn((conferenceId: string) => {
  if (conferenceId === 'conf-cfp')
    return Promise.resolve([{ key: 'cfp', title: 'CFP', members: ['org-2'] }])
  if (conferenceId === 'conf-spon')
    return Promise.resolve([
      { key: 'sponsors', title: 'Sponsors', members: ['org-3'] },
    ])
  return Promise.resolve([])
})
vi.mock('@/lib/teams/sanity', () => ({
  getConferenceTeams: (id: string) => getConferenceTeamsMock(id),
}))

const commitMock = vi.fn().mockResolvedValue({})
const patchApi = { set: () => patchApi, commit: () => commitMock() }
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { patch: () => patchApi },
}))

import { nudgeStaleConversations } from './nudge'

interface Row {
  _id: string
  conversationType: 'proposal' | 'general' | 'sponsor'
  subject: string
  conferenceId: string
  proposalId?: string
  assignedToId?: string
  lastMessageAt: string
}

const ROWS: Row[] = [
  // 1. ASSIGNEE wins over everything (its conference even has a cfp team).
  {
    _id: 'c-assigned',
    conversationType: 'proposal',
    subject: 'Assigned',
    conferenceId: 'conf-cfp',
    assignedToId: 'org-9',
    lastMessageAt: '2026-01-01T00:00:00Z',
  },
  // 2. Unassigned, cfp team configured → the cfp TEAM.
  {
    _id: 'c-cfp',
    conversationType: 'proposal',
    subject: 'Cfp team',
    conferenceId: 'conf-cfp',
    lastMessageAt: '2026-01-01T00:00:00Z',
  },
  // 3. Unassigned sponsor thread, sponsors team configured → the sponsors TEAM.
  {
    _id: 'c-spon',
    conversationType: 'sponsor',
    subject: 'Sponsor team',
    conferenceId: 'conf-spon',
    lastMessageAt: '2026-01-01T00:00:00Z',
  },
  // 4. Unassigned, no team on its conference → ALL organizers (of its org).
  {
    _id: 'c-all',
    conversationType: 'general',
    subject: 'All orgs',
    conferenceId: 'conf-none',
    lastMessageAt: '2026-01-01T00:00:00Z',
  },
]

// The conversation-selection rows and the conference→org rows come through the
// SAME `clientReadUncached.fetch` mock; route by the GROQ so the batched
// conference→org lookup (B4) can be controlled independently.
let conversationRows: Row[] = ROWS
let conferenceOrgRows: { _id: string; orgId: string | null }[] = []
function routeFetch(query: unknown) {
  if (typeof query === 'string' && query.includes('_type == "conference"')) {
    return Promise.resolve(conferenceOrgRows)
  }
  return Promise.resolve(conversationRows)
}

beforeEach(() => {
  vi.clearAllMocks()
  getOrganizerSpeakerIdsMock.mockResolvedValue(['org-1', 'org-2', 'org-3'])
  conversationRows = ROWS
  // Every conference resolves to a tenant so the routing-chain test proceeds.
  conferenceOrgRows = [
    { _id: 'conf-cfp', orgId: 'org-A' },
    { _id: 'conf-spon', orgId: 'org-A' },
    { _id: 'conf-none', orgId: 'org-A' },
  ]
  fetchMock.mockImplementation((query: unknown) => routeFetch(query))
})

/** The recipient ids of the createNotifications call whose inputs target `id`. */
function recipientsFor(convId: string): string[] {
  for (const call of createNotificationsMock.mock.calls) {
    const inputs = call[0] as { recipientId: string; link: string }[]
    if (inputs.length && inputs[0].link.includes(convId)) {
      return inputs.map((i) => i.recipientId).sort()
    }
  }
  return []
}

describe('nudgeStaleConversations — assignee → team → all chain', () => {
  it('routes each stale thread down the chain', async () => {
    const summary = await nudgeStaleConversations()

    expect(recipientsFor('c-assigned')).toEqual(['org-9'])
    expect(recipientsFor('c-cfp')).toEqual(['org-2'])
    expect(recipientsFor('c-spon')).toEqual(['org-3'])
    expect(recipientsFor('c-all')).toEqual(['org-1', 'org-2', 'org-3'])

    expect(summary.nudged).toBe(4)
    // 1 (assignee) + 1 (cfp team) + 1 (sponsors team) + 3 (all orgs) = 6.
    expect(summary.notifications).toBe(6)
  })
})

describe('nudgeStaleConversations — per-org recipient isolation (B4)', () => {
  it('nudges only the owning org’s organizers for each conversation', async () => {
    // Two unassigned, team-less threads in DIFFERENT tenants. Each must reach
    // only its own org's organizers via the team-else-all fallback.
    conversationRows = [
      {
        _id: 'c-a',
        conversationType: 'general',
        subject: 'Org A thread',
        conferenceId: 'conf-a',
        lastMessageAt: '2026-01-01T00:00:00Z',
      },
      {
        _id: 'c-b',
        conversationType: 'general',
        subject: 'Org B thread',
        conferenceId: 'conf-b',
        lastMessageAt: '2026-01-01T00:00:00Z',
      },
    ]
    conferenceOrgRows = [
      { _id: 'conf-a', orgId: 'org-A' },
      { _id: 'conf-b', orgId: 'org-B' },
    ]
    getOrganizerSpeakerIdsMock.mockImplementation((orgId?: string | null) => {
      if (orgId === 'org-A') return Promise.resolve(['a1', 'a2'])
      if (orgId === 'org-B') return Promise.resolve(['b1', 'b2'])
      return Promise.resolve([])
    })

    const summary = await nudgeStaleConversations()

    expect(recipientsFor('c-a')).toEqual(['a1', 'a2'])
    expect(recipientsFor('c-b')).toEqual(['b1', 'b2'])
    // No cross-tenant bleed: org B's organizers are never told about org A's
    // thread and vice versa.
    expect(recipientsFor('c-a')).not.toContain('b1')
    expect(recipientsFor('c-b')).not.toContain('a1')
    expect(summary.nudged).toBe(2)
    expect(summary.notifications).toBe(4)
    // The GLOBAL organizer set is never requested for recipient resolution:
    // recipients only ever come from the per-org read, and the cross-org read is
    // used solely for the candidacy filter (#723).
    expect(getOrganizerSpeakerIdsMock).not.toHaveBeenCalledWith(undefined)
    expect(getOrganizerSpeakerIdsMock).not.toHaveBeenCalledWith(null)
  })

  it('skips a conversation whose org is unresolvable — never broadcasts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    conversationRows = [
      {
        _id: 'c-orphan',
        conversationType: 'general',
        subject: 'No org',
        conferenceId: 'conf-orphan',
        lastMessageAt: '2026-01-01T00:00:00Z',
      },
    ]
    // Conference exists but carries no organization ref (pre-backfill / null).
    conferenceOrgRows = [{ _id: 'conf-orphan', orgId: null }]

    const summary = await nudgeStaleConversations()

    expect(createNotificationsMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
    expect(summary.nudged).toBe(0)
    expect(summary.notifications).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
