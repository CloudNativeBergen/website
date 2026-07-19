import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrganizerTeam } from './types'

const getConferenceTeamsMock = vi.fn<(id: string) => Promise<OrganizerTeam[]>>()
vi.mock('./sanity', () => ({
  getConferenceTeams: (id: string) => getConferenceTeamsMock(id),
}))

const getOrganizerSpeakerIdsMock = vi.fn<() => Promise<string[]>>()
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: () => getOrganizerSpeakerIdsMock(),
}))

import { resolveRoutedOrganizerIds } from './routing'

const ALL_ORGANIZERS = ['org-1', 'org-2', 'org-3']

beforeEach(() => {
  getConferenceTeamsMock.mockReset()
  getOrganizerSpeakerIdsMock.mockReset()
  getOrganizerSpeakerIdsMock.mockResolvedValue([...ALL_ORGANIZERS])
})

const CFP_TEAM: OrganizerTeam = {
  key: 'cfp',
  title: 'CFP',
  members: ['org-1', 'org-2'],
}

describe('resolveRoutedOrganizerIds — the single fallback contract', () => {
  it('routes to the team members ONLY when the team is configured with ≥1 member', async () => {
    getConferenceTeamsMock.mockResolvedValue([CFP_TEAM])
    expect(
      await resolveRoutedOrganizerIds({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual(['org-1', 'org-2'])
    // Fell fully through the team branch — never touched the organizer set.
    expect(getOrganizerSpeakerIdsMock).not.toHaveBeenCalled()
  })

  it('falls back to ALL organizers when the team is ABSENT', async () => {
    getConferenceTeamsMock.mockResolvedValue([CFP_TEAM])
    expect(
      await resolveRoutedOrganizerIds({
        conferenceId: 'c1',
        teamKey: 'sponsors',
      }),
    ).toEqual(ALL_ORGANIZERS)
  })

  it('falls back to ALL organizers when the conference has NO teams at all', async () => {
    getConferenceTeamsMock.mockResolvedValue([])
    expect(
      await resolveRoutedOrganizerIds({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual(ALL_ORGANIZERS)
  })

  it('falls back to ALL organizers when the team is configured but EMPTY', async () => {
    getConferenceTeamsMock.mockResolvedValue([
      { key: 'cfp', title: 'CFP', members: [] },
    ])
    expect(
      await resolveRoutedOrganizerIds({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual(ALL_ORGANIZERS)
  })

  it('NEVER-FAILS: a teams-fetch error logs and falls back to ALL organizers', async () => {
    const err = new Error('sanity down')
    getConferenceTeamsMock.mockRejectedValue(err)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await resolveRoutedOrganizerIds({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual(ALL_ORGANIZERS)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('returns a fresh copy of the team members (no shared mutable reference)', async () => {
    const team = { ...CFP_TEAM, members: ['org-1', 'org-2'] }
    getConferenceTeamsMock.mockResolvedValue([team])
    const result = await resolveRoutedOrganizerIds({
      conferenceId: 'c1',
      teamKey: 'cfp',
    })
    expect(result).not.toBe(team.members)
  })
})
