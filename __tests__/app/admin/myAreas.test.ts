import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock only the sources fetchMyAreasData touches. The heavier sibling actions in
// the same file aren't exercised here.
const getAuthSession = vi.fn()
vi.mock('@/lib/auth', () => ({ getAuthSession: () => getAuthSession() }))

const getConferenceTeams = vi.fn()
vi.mock('@/lib/teams', () => ({
  getConferenceTeams: (id: string) => getConferenceTeams(id),
}))

const getConversationViewCounts = vi.fn()
vi.mock('@/lib/messaging/sanity', () => ({
  getConversationViewCounts: (a: unknown) => getConversationViewCounts(a),
}))

const listSponsorsForConference = vi.fn()
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  listSponsorsForConference: (id: string, f: unknown) =>
    listSponsorsForConference(id, f),
}))

const getVolunteersByConference = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: (id: string) => getVolunteersByConference(id),
}))

import { fetchMyAreasData } from '@/app/(admin)/admin/actions'

beforeEach(() => {
  vi.clearAllMocks()
  getAuthSession.mockResolvedValue({
    speaker: { _id: 'org-1', isOrganizer: true },
  })
  getConversationViewCounts.mockResolvedValue({
    active: 0,
    archived: 0,
    needsReply: 4,
    unassigned: 2,
  })
  listSponsorsForConference.mockResolvedValue({ sponsors: [{}, {}, {}] })
  getVolunteersByConference.mockResolvedValue({
    volunteers: [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'approved' },
    ],
    error: null,
  })
})

describe('fetchMyAreasData (L4 My areas)', () => {
  it('returns empty areas when the viewer is on no team (widget inert)', async () => {
    getConferenceTeams.mockResolvedValue([
      { key: 'cfp', title: 'Programme', members: ['someone-else'] },
    ])
    const data = await fetchMyAreasData('conf-1')
    expect(data.areas).toEqual([])
    // No area sources read when the viewer is on no team.
    expect(getConversationViewCounts).not.toHaveBeenCalled()
    expect(listSponsorsForConference).not.toHaveBeenCalled()
  })

  it('wires cfp counts to inbox deep links', async () => {
    getConferenceTeams.mockResolvedValue([
      { key: 'cfp', title: 'Programme', members: ['org-1'] },
    ])
    const data = await fetchMyAreasData('conf-1')
    expect(data.areas).toHaveLength(1)
    const cfp = data.areas[0]
    expect(cfp.title).toBe('Programme')
    expect(cfp.metrics).toEqual([
      {
        label: 'Needs reply',
        count: 4,
        href: '/admin/messages?view=needs-reply',
      },
      {
        label: 'Unassigned',
        count: 2,
        href: '/admin/messages?view=unassigned',
      },
    ])
    // Sponsor / volunteer sources are NOT read for a cfp-only member.
    expect(listSponsorsForConference).not.toHaveBeenCalled()
    expect(getVolunteersByConference).not.toHaveBeenCalled()
  })

  it('counts unassigned sponsors and pending volunteers for those teams', async () => {
    getConferenceTeams.mockResolvedValue([
      { key: 'sponsors', title: 'Sales', members: ['org-1'] },
      { key: 'volunteers', title: 'Crew', members: ['org-1'] },
    ])
    const data = await fetchMyAreasData('conf-1')

    const sponsors = data.areas.find((a) => a.key === 'sponsors')
    expect(sponsors?.metrics[0]).toEqual({
      label: 'Unassigned sponsors',
      count: 3,
      href: '/admin/sponsors/crm?assignedTo=unassigned',
    })
    expect(listSponsorsForConference).toHaveBeenCalledWith('conf-1', {
      unassignedOnly: true,
    })

    const volunteers = data.areas.find((a) => a.key === 'volunteers')
    expect(volunteers?.metrics[0]).toEqual({
      label: 'Pending volunteers',
      count: 2,
      href: '/admin/volunteers',
    })
    // cfp source not read — the viewer is on neither cfp.
    expect(getConversationViewCounts).not.toHaveBeenCalled()
  })

  it('renders a titled but metric-less card for an unknown team key', async () => {
    getConferenceTeams.mockResolvedValue([
      { key: 'workshops', title: 'Workshops', members: ['org-1'] },
    ])
    const data = await fetchMyAreasData('conf-1')
    expect(data.areas).toEqual([
      { key: 'workshops', title: 'Workshops', metrics: [] },
    ])
  })
})
