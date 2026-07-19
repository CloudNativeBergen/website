import { describe, it, expect } from 'vitest'
import { isValidTeamKey, countTeamKey } from './validation'

describe('isValidTeamKey', () => {
  it.each(['cfp', 'sponsors', 'a', 'team-1', 'cloud-native-bergen'])(
    'accepts kebab-case %s',
    (key) => {
      expect(isValidTeamKey(key)).toBe(true)
    },
  )

  it.each(['CFP', 'has space', 'trailing-', '-leading', 'double--hyphen', ''])(
    'rejects invalid %s',
    (key) => {
      expect(isValidTeamKey(key)).toBe(false)
    },
  )

  it('rejects non-strings', () => {
    expect(isValidTeamKey(undefined)).toBe(false)
    expect(isValidTeamKey(42)).toBe(false)
  })
})

describe('countTeamKey', () => {
  it('counts occurrences of a key across the team list', () => {
    const teams = [{ key: 'cfp' }, { key: 'sponsors' }, { key: 'cfp' }]
    expect(countTeamKey(teams, 'cfp')).toBe(2)
    expect(countTeamKey(teams, 'sponsors')).toBe(1)
    expect(countTeamKey(teams, 'nope')).toBe(0)
  })

  it('returns 0 for an undefined list', () => {
    expect(countTeamKey(undefined, 'cfp')).toBe(0)
  })
})
