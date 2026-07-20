import { describe, it, expect } from 'vitest'
import {
  validateOrganizers,
  slugifyTeamKey,
  isValidTeamKeyClient,
  validateTeams,
  buildTeamsPayload,
  type TeamFormRow,
} from './editConferenceRefs'

describe('validateOrganizers', () => {
  it('accepts a list that includes the caller', () => {
    expect(validateOrganizers(['sp-1', 'sp-2'], 'sp-1')).toBeNull()
  })

  it('rejects an empty list', () => {
    expect(validateOrganizers([], 'sp-1')).toMatch(/at least one organizer/i)
  })

  it('rejects removing yourself', () => {
    expect(validateOrganizers(['sp-2', 'sp-3'], 'sp-1')).toMatch(
      /cannot remove yourself/i,
    )
  })
})

describe('slugifyTeamKey', () => {
  it('kebab-cases a title', () => {
    expect(slugifyTeamKey('CFP Team')).toBe('cfp-team')
    expect(slugifyTeamKey('  Sponsors & Sales  ')).toBe('sponsors-sales')
  })

  it('collapses repeats and trims dashes', () => {
    expect(slugifyTeamKey('A -- B')).toBe('a-b')
  })
})

describe('isValidTeamKeyClient', () => {
  it('accepts kebab-case', () => {
    expect(isValidTeamKeyClient('cfp')).toBe(true)
    expect(isValidTeamKeyClient('team-2')).toBe(true)
  })
  it('rejects non-kebab', () => {
    expect(isValidTeamKeyClient('CFP')).toBe(false)
    expect(isValidTeamKeyClient('a--b')).toBe(false)
    expect(isValidTeamKeyClient('-a')).toBe(false)
    expect(isValidTeamKeyClient('')).toBe(false)
  })
})

function row(overrides: Partial<TeamFormRow>): TeamFormRow {
  return {
    _key: 'k',
    key: 'cfp',
    title: 'CFP',
    members: ['sp-1'],
    slackChannel: '',
    emailIdentity: '',
    ...overrides,
  }
}

describe('validateTeams', () => {
  const organizers = ['sp-1', 'sp-2']

  it('accepts a valid team', () => {
    expect(validateTeams([row({})], organizers)).toEqual({})
  })

  it('flags a missing title', () => {
    const errs = validateTeams([row({ title: '  ' })], organizers)
    expect(errs['0.title']).toBeTruthy()
  })

  it('flags a non-kebab key', () => {
    const errs = validateTeams([row({ key: 'CFP Team' })], organizers)
    expect(errs['0.key']).toMatch(/kebab/i)
  })

  it('flags duplicate keys on both rows', () => {
    const errs = validateTeams(
      [
        row({ _key: 'a', key: 'cfp' }),
        row({ _key: 'b', key: 'cfp', members: ['sp-2'] }),
      ],
      organizers,
    )
    expect(errs['0.key']).toMatch(/duplicate/i)
    expect(errs['1.key']).toMatch(/duplicate/i)
  })

  it('flags an empty member list', () => {
    const errs = validateTeams([row({ members: [] })], organizers)
    expect(errs['0.members']).toMatch(/at least one member/i)
  })

  it('flags a member who is not an organizer (subset)', () => {
    const errs = validateTeams([row({ members: ['sp-9'] })], organizers)
    expect(errs['0.members']).toMatch(/must be organizers/i)
  })
})

describe('buildTeamsPayload', () => {
  it('trims and drops empty optionals; forwards a real _key', () => {
    const payload = buildTeamsPayload([
      row({
        _key: 'real-key',
        key: ' cfp ',
        title: ' CFP ',
        slackChannel: '  ',
        emailIdentity: '',
      }),
    ])
    expect(payload[0]).toEqual({
      key: 'cfp',
      title: 'CFP',
      members: ['sp-1'],
      _key: 'real-key',
    })
  })

  it('includes slackChannel and a single-element emailIdentity array', () => {
    const payload = buildTeamsPayload([
      row({ slackChannel: '#cfp', emailIdentity: 'cfpEmail' }),
    ])
    expect(payload[0].slackChannel).toBe('#cfp')
    expect(payload[0].emailIdentity).toEqual(['cfpEmail'])
  })

  it('strips a temp _key so the server re-keys', () => {
    const payload = buildTeamsPayload([row({ _key: 'tmp-3' })])
    expect(payload[0]).not.toHaveProperty('_key')
  })
})
