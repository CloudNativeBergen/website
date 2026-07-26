import { describe, it, expect } from 'vitest'
import {
  resolveConferenceVisibility,
  isConferenceUnlisted,
  CONFERENCE_VISIBILITY_VALUES,
} from '../visibility'

describe('resolveConferenceVisibility — absent-means-live', () => {
  it('treats an ABSENT field as live (legacy conferences stay public)', () => {
    expect(resolveConferenceVisibility({})).toBe('live')
    expect(resolveConferenceVisibility({ visibility: undefined })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: null })).toBe('live')
  })

  it('treats null/undefined conference as live', () => {
    expect(resolveConferenceVisibility(null)).toBe('live')
    expect(resolveConferenceVisibility(undefined)).toBe('live')
  })

  it('resolves an explicit "live" to live', () => {
    expect(resolveConferenceVisibility({ visibility: 'live' })).toBe('live')
  })

  it('resolves ONLY the explicit "unlisted" string to unlisted', () => {
    expect(resolveConferenceVisibility({ visibility: 'unlisted' })).toBe(
      'unlisted',
    )
  })

  it('treats any unknown value as live (fail-open to public per the rule)', () => {
    expect(resolveConferenceVisibility({ visibility: 'private' })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: 'draft' })).toBe('live')
    expect(resolveConferenceVisibility({ visibility: '' })).toBe('live')
  })
})

describe('isConferenceUnlisted', () => {
  it('is true only for an explicit unlisted conference', () => {
    expect(isConferenceUnlisted({ visibility: 'unlisted' })).toBe(true)
  })

  it('is false for live, absent, null and unknown', () => {
    expect(isConferenceUnlisted({ visibility: 'live' })).toBe(false)
    expect(isConferenceUnlisted({})).toBe(false)
    expect(isConferenceUnlisted(null)).toBe(false)
    expect(isConferenceUnlisted({ visibility: 'nope' })).toBe(false)
  })
})

describe('CONFERENCE_VISIBILITY_VALUES', () => {
  it('lists both values, trial (unlisted) first', () => {
    expect([...CONFERENCE_VISIBILITY_VALUES]).toEqual(['unlisted', 'live'])
  })
})
