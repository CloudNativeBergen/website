import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrganizerTeam, ConferenceTeamsConfig } from './types'

const getConferenceTeamsMock = vi.fn<(id: string) => Promise<OrganizerTeam[]>>()
vi.mock('./sanity', () => ({
  getConferenceTeams: (id: string) => getConferenceTeamsMock(id),
}))

import {
  resolveTeamRecipients,
  resolveTeamSlackChannel,
  resolveTeamEmailIdentity,
} from './resolve'

beforeEach(() => {
  getConferenceTeamsMock.mockReset()
})

const CFP_TEAM: OrganizerTeam = {
  key: 'cfp',
  title: 'CFP',
  members: ['spk-1', 'spk-2'],
  slackChannel: '#cfp-team',
  emailIdentity: ['cfpEmail'],
}

describe('resolveTeamRecipients', () => {
  it('returns the member ids of the named team', async () => {
    getConferenceTeamsMock.mockResolvedValue([CFP_TEAM])
    expect(
      await resolveTeamRecipients({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual(['spk-1', 'spk-2'])
  })

  it('returns [] when the team is absent (caller falls back to all organizers)', async () => {
    getConferenceTeamsMock.mockResolvedValue([CFP_TEAM])
    expect(
      await resolveTeamRecipients({ conferenceId: 'c1', teamKey: 'sponsors' }),
    ).toEqual([])
  })

  it('returns [] when the conference has no teams at all', async () => {
    getConferenceTeamsMock.mockResolvedValue([])
    expect(
      await resolveTeamRecipients({ conferenceId: 'c1', teamKey: 'cfp' }),
    ).toEqual([])
  })
})

const CONFERENCE: ConferenceTeamsConfig = {
  teams: [CFP_TEAM, { key: 'sponsors', title: 'Sponsors' }],
  salesNotificationChannel: '#sales',
  cfpNotificationChannel: '#cfp',
  contactEmail: 'hei@example.com',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsor@example.com',
}

describe('resolveTeamSlackChannel', () => {
  it('prefers the team channel over the conference channel', () => {
    expect(
      resolveTeamSlackChannel({
        conference: CONFERENCE,
        teamKey: 'cfp',
        kind: 'cfp',
      }),
    ).toBe('#cfp-team')
  })

  it('falls back to the cfp channel for a team without its own channel', () => {
    expect(
      resolveTeamSlackChannel({
        conference: CONFERENCE,
        teamKey: 'sponsors',
        kind: 'cfp',
      }),
    ).toBe('#cfp')
  })

  it('falls back to the sales channel for kind=sales', () => {
    expect(
      resolveTeamSlackChannel({
        conference: CONFERENCE,
        teamKey: 'sponsors',
        kind: 'sales',
      }),
    ).toBe('#sales')
  })

  it('falls back to the conference channel when the team is absent', () => {
    expect(
      resolveTeamSlackChannel({
        conference: CONFERENCE,
        teamKey: 'nope',
        kind: 'sales',
      }),
    ).toBe('#sales')
  })
})

describe('resolveTeamEmailIdentity', () => {
  it('resolves the address the team’s identity points at', () => {
    expect(resolveTeamEmailIdentity(CONFERENCE, 'cfp')).toBe('cfp@example.com')
  })

  it('falls back to contactEmail for a team with no identity', () => {
    expect(resolveTeamEmailIdentity(CONFERENCE, 'sponsors')).toBe(
      'hei@example.com',
    )
  })

  it('falls back to contactEmail when the team is absent', () => {
    expect(resolveTeamEmailIdentity(CONFERENCE, 'nope')).toBe('hei@example.com')
  })

  it('uses the first identity when several are listed', () => {
    const conf: ConferenceTeamsConfig = {
      ...CONFERENCE,
      teams: [
        {
          key: 'multi',
          title: 'Multi',
          emailIdentity: ['sponsorEmail', 'cfpEmail'],
        },
      ],
    }
    expect(resolveTeamEmailIdentity(conf, 'multi')).toBe('sponsor@example.com')
  })
})
