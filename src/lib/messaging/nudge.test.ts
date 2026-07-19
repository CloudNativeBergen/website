import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Boundary mocks --------------------------------------------------------

const createNotificationsMock = vi.fn().mockResolvedValue(undefined)
const getOrganizerSpeakerIdsMock = vi
  .fn()
  .mockResolvedValue(['org-1', 'org-2', 'org-3'])
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
  getOrganizerSpeakerIds: () => getOrganizerSpeakerIdsMock(),
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
  // 4. Unassigned, no team on its conference → ALL organizers.
  {
    _id: 'c-all',
    conversationType: 'general',
    subject: 'All orgs',
    conferenceId: 'conf-none',
    lastMessageAt: '2026-01-01T00:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue(ROWS)
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
