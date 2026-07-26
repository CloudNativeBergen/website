import { describe, it, expect } from 'vitest'
import {
  BADGE_GENERATOR_VERSION,
  badgeGeneratorVersion,
  isBadgeOutdated,
} from './version'

describe('badge generator versioning', () => {
  it('current version is at least 2 (the #655 keys-URL + identifier format)', () => {
    expect(BADGE_GENERATOR_VERSION).toBeGreaterThanOrEqual(2)
  })

  describe('badgeGeneratorVersion — absent field defaults to v1', () => {
    it('treats undefined as v1 (docs baked before the field existed)', () => {
      expect(badgeGeneratorVersion(undefined)).toBe(1)
    })

    it('treats null as v1', () => {
      expect(badgeGeneratorVersion(null)).toBe(1)
    })

    it('passes a stored version through unchanged', () => {
      expect(badgeGeneratorVersion(2)).toBe(2)
      expect(badgeGeneratorVersion(5)).toBe(5)
    })
  })

  describe('isBadgeOutdated', () => {
    it('flags a v1 (absent) badge as outdated while current is > 1', () => {
      expect(isBadgeOutdated(undefined)).toBe(true)
      expect(isBadgeOutdated(null)).toBe(true)
      expect(isBadgeOutdated(1)).toBe(true)
    })

    it('does NOT flag a badge stamped at the current version', () => {
      expect(isBadgeOutdated(BADGE_GENERATOR_VERSION)).toBe(false)
    })

    it('does NOT flag a badge from a hypothetical future version', () => {
      expect(isBadgeOutdated(BADGE_GENERATOR_VERSION + 1)).toBe(false)
    })

    it('flags any version strictly below the current one', () => {
      for (let v = 1; v < BADGE_GENERATOR_VERSION; v++) {
        expect(isBadgeOutdated(v)).toBe(true)
      }
    })
  })
})
