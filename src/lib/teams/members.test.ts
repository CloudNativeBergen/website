import { describe, it, expect } from 'vitest'
import { teamMembersForKey } from '@/lib/teams/members'

const teams = [
  { key: 'cfp', members: ['s1', 's2'] },
  { key: 'sponsors', members: ['s3'] },
  { key: 'empty-team', members: [] },
]

describe('teamMembersForKey (L3 CRM team filter → member set)', () => {
  it('maps a team key to its member id set', () => {
    expect(teamMembersForKey(teams, 'cfp')).toEqual(['s1', 's2'])
    expect(teamMembersForKey(teams, 'sponsors')).toEqual(['s3'])
  })

  it('returns [] for a matched team with no members (match nobody)', () => {
    expect(teamMembersForKey(teams, 'empty-team')).toEqual([])
  })

  it('returns undefined for an unknown key, no key, or no teams', () => {
    expect(teamMembersForKey(teams, 'nope')).toBeUndefined()
    expect(teamMembersForKey(teams, undefined)).toBeUndefined()
    expect(teamMembersForKey(teams, null)).toBeUndefined()
    expect(teamMembersForKey(undefined, 'cfp')).toBeUndefined()
  })
})
