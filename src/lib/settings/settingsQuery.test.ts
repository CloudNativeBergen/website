import { describe, expect, it } from 'vitest'
import { matchesSettingsQuery } from './groups'

const CARD = ['Analytics', 'Tickets & Registration', 'PostHog project token']

describe('matchesSettingsQuery', () => {
  it('matches everything for an empty or blank query', () => {
    expect(matchesSettingsQuery('', CARD)).toBe(true)
    expect(matchesSettingsQuery('   ', CARD)).toBe(true)
  })

  it('matches card title, group name and field labels, ignoring case', () => {
    expect(matchesSettingsQuery('ANALYTICS', CARD)).toBe(true)
    expect(matchesSettingsQuery('registration', CARD)).toBe(true)
    expect(matchesSettingsQuery('posthog', CARD)).toBe(true)
  })

  it('requires every term', () => {
    expect(matchesSettingsQuery('posthog token', CARD)).toBe(true)
    expect(matchesSettingsQuery('posthog slack', CARD)).toBe(false)
  })

  it('handles Norwegian letters case-insensitively', () => {
    const card = ['Lokal informasjon', 'Spørsmål og ærend på Øya']
    expect(matchesSettingsQuery('SPØRSMÅL', card)).toBe(true)
    expect(matchesSettingsQuery('øya ærend', card)).toBe(true)
    expect(matchesSettingsQuery('oya', card)).toBe(false)
  })
})
