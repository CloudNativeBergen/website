import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// Mock only what the "My areas" widget touches. The heavier sibling widgets in
// the same batch aren't exercised here.
const getAuthSession = vi.fn()
vi.mock('@/lib/auth', () => ({ getAuthSession: () => getAuthSession() }))

// `requireOrganizer` is ORG-SCOPED: it derives the REQUEST's org from the domain
// conference and requires the viewer's `organizerOrgIds` to contain it.
vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-test',
}))

const getConversationViewCounts = vi.fn()
vi.mock('@/lib/messaging/sanity', () => ({
  getConversationViewCounts: (a: unknown) => getConversationViewCounts(a),
}))

// The conference is resolved from the request domain — never from client
// input — and the viewer's TEAMS ride on that same document, so team
// membership costs no read of its own.
const teams: { key: string; title: string; members: string[] }[] = []
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-1',
      title: 'Test Conference',
      organization: { _ref: 'org-test' },
      teams,
    },
    domain: 'test.example.com',
    error: null,
    status: 'resolved',
  }),
}))

import { clientReadUncached } from '@/lib/sanity/client'
import { fetchDashboardData } from '@/app/(admin)/admin/actions'
import type { MyAreasData } from '@/lib/dashboard/data-types'

const readFetch = clientReadUncached.fetch as Mock

/** The one composed query the batch issues, as `[query, params]`. */
const composedCall = () =>
  readFetch.mock.calls[0] as [string, Record<string, unknown>] | undefined

async function myAreas(): Promise<MyAreasData> {
  const batch = await fetchDashboardData(['my-areas'])
  const slice = batch['my-areas']
  if (!slice) throw new Error('no my-areas slice')
  if (!slice.ok) throw new Error(slice.error)
  return slice.value
}

beforeEach(() => {
  vi.clearAllMocks()
  teams.length = 0
  readFetch.mockReset()
  readFetch.mockResolvedValue({
    unassignedSponsorCount: 3,
    pendingVolunteerCount: 2,
  })
  getAuthSession.mockResolvedValue({
    speaker: { _id: 'org-1', isOrganizer: true, organizerOrgIds: ['org-test'] },
  })
  getConversationViewCounts.mockResolvedValue({
    active: 0,
    archived: 0,
    needsReply: 4,
    unassigned: 2,
  })
})

describe('My areas (TEAMS-3 L4)', () => {
  it('returns empty areas when the viewer is on no team (widget inert)', async () => {
    teams.push({ key: 'cfp', title: 'Programme', members: ['someone-else'] })

    const data = await myAreas()

    expect(data.areas).toEqual([])
    // No area sources read when the viewer is on no team — and with no count
    // root to emit, the composed query is not issued at all.
    expect(getConversationViewCounts).not.toHaveBeenCalled()
    expect(readFetch).not.toHaveBeenCalled()
  })

  it('wires cfp counts to inbox deep links', async () => {
    teams.push({ key: 'cfp', title: 'Programme', members: ['org-1'] })

    const data = await myAreas()

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
    expect(getConversationViewCounts).toHaveBeenCalledWith({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
    })
    // Sponsor / volunteer count roots are NOT emitted for a cfp-only member.
    const call = composedCall()
    expect(call?.[0] ?? '').not.toContain('unassignedSponsorCount')
    expect(call?.[0] ?? '').not.toContain('pendingVolunteerCount')
  })

  it('counts unassigned sponsors and pending volunteers for those teams', async () => {
    teams.push(
      { key: 'sponsors', title: 'Sales', members: ['org-1'] },
      { key: 'volunteers', title: 'Crew', members: ['org-1'] },
    )

    const data = await myAreas()

    const sponsors = data.areas.find((a) => a.key === 'sponsors')
    expect(sponsors?.metrics[0]).toEqual({
      label: 'Unassigned sponsors',
      count: 3,
      href: '/admin/sponsors/crm?assignedTo=unassigned',
    })

    const volunteers = data.areas.find((a) => a.key === 'volunteers')
    expect(volunteers?.metrics[0]).toEqual({
      label: 'Pending volunteers',
      count: 2,
      href: '/admin/volunteers',
    })

    // Both counts come from ONE query, tenant-scoped by parameter.
    expect(readFetch).toHaveBeenCalledTimes(1)
    const [query, params] = composedCall()!
    expect(query).toContain('"unassignedSponsorCount"')
    expect(query).toContain('"pendingVolunteerCount"')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params.conferenceId).toBe('conf-1')

    // cfp source not read — the viewer is on neither cfp.
    expect(getConversationViewCounts).not.toHaveBeenCalled()
  })

  it('renders a titled but metric-less card for an unknown team key', async () => {
    teams.push({ key: 'workshops', title: 'Workshops', members: ['org-1'] })

    const data = await myAreas()

    expect(data.areas).toEqual([
      { key: 'workshops', title: 'Workshops', metrics: [] },
    ])
  })

  it('refuses a viewer who is not an organizer of this org', async () => {
    teams.push({ key: 'sponsors', title: 'Sales', members: ['org-1'] })
    getAuthSession.mockResolvedValue({
      speaker: { _id: 'org-1', isOrganizer: true, organizerOrgIds: ['other'] },
    })

    await expect(fetchDashboardData(['my-areas'])).rejects.toThrow(
      'Unauthorized: organizer access required',
    )
    expect(readFetch).not.toHaveBeenCalled()
    expect(getConversationViewCounts).not.toHaveBeenCalled()
  })
})
