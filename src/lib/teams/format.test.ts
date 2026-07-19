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

  it('treats null/undefined members as an empty roster (#566)', () => {
    // The settings projection can dereference a deleted member to null, or omit
    // the array entirely — the formatter must not crash on either.
    const nullMembers = {
      key: 'ghosts',
      title: 'Ghosts',
      members: null,
    } as unknown as OrganizerTeam
    expect(formatTeamSummary(nullMembers)).toBe('Ghosts (ghosts) — 0 members')

    const missingMembers = {
      key: 'phantoms',
      title: 'Phantoms',
    } as unknown as OrganizerTeam
    expect(formatTeamSummary(missingMembers)).toBe(
      'Phantoms (phantoms) — 0 members',
    )
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
