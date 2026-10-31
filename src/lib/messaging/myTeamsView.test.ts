import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn(), patch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => ['org-1', 'org-2']),
}))

// The `my-teams` predicate binds `$myTeamKeys` from the caller's team
// membership; mock the teams SOURCE so we can assert what gets bound.
const getConferenceTeamsMock = vi.fn()
vi.mock('@/lib/teams', () => ({
  getViewerTeamKeys: async (conferenceId: string, speakerId: string) => {
    const teams = await getConferenceTeamsMock(conferenceId)
    return teams
      .filter((t: { members: string[] }) => t.members.includes(speakerId))
      .map((t: { key: string }) => t.key)
  },
}))

import { clientReadUncached } from '@/lib/sanity/client'
import {
  inboxPredicate,
  rawViewPredicate,
  getConversationViewCounts,
} from '@/lib/messaging/sanity'

describe('inboxPredicate — combinable filter chips (#916)', () => {
  it('a single chip on `active` equals the legacy chip view', () => {
    for (const chip of [
      'needs-reply',
      'unassigned',
      'mine',
      'my-teams',
    ] as const) {
      expect(inboxPredicate('active', [chip], true).predicate).toBe(
        rawViewPredicate(chip, true).predicate,
      )
    }
  })

  it('ANDs several chips and unions their bindings', () => {
    const { predicate, needsOrganizerIds, needsMyTeamKeys } = inboxPredicate(
      'active',
      ['unassigned', 'needs-reply', 'my-teams'],
      true,
    )
    expect(predicate).toContain('!defined(assignedTo)')
    expect(predicate).toContain('$organizerIds')
    expect(predicate).toContain('$myTeamKeys')
    expect(needsOrganizerIds).toBe(true)
    expect(needsMyTeamKeys).toBe(true)
  })

  it('ignores chips for a speaker', () => {
    expect(inboxPredicate('active', ['mine'], false)).toEqual(
      rawViewPredicate('active', false),
    )
  })

  it('narrows chip counts by the OTHER chips, never the status counts', async () => {
    getConferenceTeamsMock.mockResolvedValue([])
    readMock.fetch.mockResolvedValue({})
    await getConversationViewCounts({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      filters: ['mine'],
    })
    const query: string = readMock.fetch.mock.calls[0][0]
    const field = (key: string) =>
      query.split(`"${key}": `)[1].split(/, "\w+": /)[0]
    const mine = 'assignedTo._ref == $speakerId'
    expect(field('unassigned')).toContain(mine)
    expect(field('active')).not.toContain(mine)
    expect(field('resolved')).not.toContain(mine)
  })
})

type LooseMock = ReturnType<typeof vi.fn>
const readMock = clientReadUncached as unknown as { fetch: LooseMock }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rawViewPredicate("my-teams") (L1)', () => {
  it('is organizer-only, needs myTeamKeys, and maps routing teams', () => {
    const { predicate, needsOrganizerIds, needsMyTeamKeys } = rawViewPredicate(
      'my-teams',
      true,
    )
    expect(needsMyTeamKeys).toBe(true)
    expect(needsOrganizerIds).toBe(false)
    // Sponsor threads route to `sponsors`, everything else to `cfp`.
    expect(predicate).toContain('conversationType == "sponsor"')
    expect(predicate).toContain('"sponsors" in $myTeamKeys')
    expect(predicate).toContain('conversationType != "sponsor"')
    expect(predicate).toContain('"cfp" in $myTeamKeys')
  })

  it('is INERT when the caller is on no team (matches every active thread)', () => {
    const { predicate } = rawViewPredicate('my-teams', true)
    // The empty-set escape hatch: count == 0 short-circuits to "all active".
    expect(predicate).toContain('count($myTeamKeys) == 0')
  })
})

describe('getConversationViewCounts myTeams wiring (L1)', () => {
  it('binds the caller team keys and returns the myTeams count for organizers', async () => {
    getConferenceTeamsMock.mockResolvedValue([
      { key: 'cfp', members: ['org-1'] },
      { key: 'sponsors', members: ['org-2'] },
    ])
    readMock.fetch.mockResolvedValue({
      active: 5,
      needsReply: 2,
      myTeams: 3,
      unassigned: 1,
      mine: 0,
      resolved: 4,
      archived: 6,
    })

    const counts = await getConversationViewCounts({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
    })

    expect(counts.myTeams).toBe(3)
    // The GROQ must select a "myTeams" count field and bind $myTeamKeys to the
    // caller's own membership (org-1 is on the cfp team).
    const [groq, params] = readMock.fetch.mock.calls[0]
    expect(groq).toContain('"myTeams"')
    expect(params.myTeamKeys).toEqual(['cfp'])
  })

  it('omits myTeams for a speaker caller (organizer-only view)', async () => {
    readMock.fetch.mockResolvedValue({ active: 1, archived: 2 })
    const counts = await getConversationViewCounts({
      speakerId: 's-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
    })
    expect(counts.myTeams).toBeUndefined()
    expect(getConferenceTeamsMock).not.toHaveBeenCalled()
  })
})
