import { describe, it, expect } from 'vitest'
import {
  normalizeBackgroundPattern,
  DEFAULT_BACKGROUND_PATTERN,
  BACKGROUND_PATTERN_VALUES,
} from './backgroundPattern'

describe('normalizeBackgroundPattern', () => {
  it('passes through each known value unchanged', () => {
    for (const value of BACKGROUND_PATTERN_VALUES) {
      expect(normalizeBackgroundPattern(value)).toBe(value)
    }
  })

  it('treats absent (undefined/null) as the default cloud-native pattern', () => {
    expect(normalizeBackgroundPattern(undefined)).toBe('cloud-native')
    expect(normalizeBackgroundPattern(null)).toBe('cloud-native')
    expect(DEFAULT_BACKGROUND_PATTERN).toBe('cloud-native')
  })

  it('coerces an unknown/legacy value to the default', () => {
    expect(normalizeBackgroundPattern('rainbow')).toBe('cloud-native')
    expect(normalizeBackgroundPattern('')).toBe('cloud-native')
  })
})
