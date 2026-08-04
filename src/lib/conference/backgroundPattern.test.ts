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

  // The default is 'none', NOT 'cloud-native'. A conference that has nothing to
  // do with the CNCF ecosystem must not get a page background of Kubernetes,
  // Helm and Prometheus logos just because it has not configured anything. The
  // three existing Cloud Native Days editions store 'cloud-native' explicitly
  // (migration 046), so they are unaffected by this default.
  it('treats absent (undefined/null) as the neutral no-logo default', () => {
    expect(normalizeBackgroundPattern(undefined)).toBe('none')
    expect(normalizeBackgroundPattern(null)).toBe('none')
    expect(DEFAULT_BACKGROUND_PATTERN).toBe('none')
  })

  it('coerces an unknown/legacy value to the default', () => {
    expect(normalizeBackgroundPattern('rainbow')).toBe('none')
    expect(normalizeBackgroundPattern('')).toBe('none')
  })
})
