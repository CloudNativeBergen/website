import { describe, it, expect } from 'vitest'
import { formatTeamSummary } from './format'
import type { OrganizerTeam } from './types'

describe('formatTeamSummary', () => {
  it('renders title, key, member count, channel and identity', () => {
    const team: OrganizerTeam = {
      key: 'cfp',
      title: 'Program Committee',
      members: ['a', 'b', 'c'],
      slackChannel: '#cfp',
      emailIdentity: ['cfpEmail'],
    }
    expect(formatTeamSummary(team)).toBe(
      'Program Committee (cfp) — 3 members · #cfp · cfpEmail',
    )
  })

  it('singularizes a single member and omits optional segments', () => {
    const team: OrganizerTeam = {
      key: 'volunteers',
      title: 'Volunteers',
      members: ['a'],
    }
    expect(formatTeamSummary(team)).toBe('Volunteers (volunteers) — 1 member')
  })

  it('prefixes a missing # on the channel', () => {
    const team: OrganizerTeam = {
      key: 'sponsors',
      title: 'Sponsors',
      members: [],
      slackChannel: 'sponsor-chat',
    }
    expect(formatTeamSummary(team)).toBe(
      'Sponsors (sponsors) — 0 members · #sponsor-chat',
    )
  })
})
