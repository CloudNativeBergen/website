import { describe, it, expect } from 'vitest'
import {
  NEVER_SIGNED_IN_LABEL,
  providerDisplayName,
  providerDisplayNames,
  providerSummary,
} from './providers'

describe('providerDisplayName', () => {
  it('maps known providers to their human name', () => {
    expect(providerDisplayName('github:23187057')).toBe('GitHub')
    expect(providerDisplayName('linkedin:2mtSWuh1kA')).toBe('LinkedIn')
    expect(providerDisplayName('email-link:abc')).toBe('Email link')
  })

  it('never leaks the opaque account id', () => {
    // It identifies nothing to a human and is pure noise in a picker.
    expect(providerDisplayName('github:23187057')).not.toContain('23187057')
    expect(providerDisplayName('unknown-idp:xyz')).toBe('unknown-idp')
  })
})

describe('providerDisplayNames', () => {
  it('lists every linked provider, deduplicated, in document order', () => {
    expect(
      providerDisplayNames(['linkedin:1', 'github:2', 'github:3']),
    ).toEqual(['LinkedIn', 'GitHub'])
  })

  it('drops blank entries and returns empty for no providers', () => {
    expect(providerDisplayNames(['', null, undefined, '  '])).toEqual([])
    expect(providerDisplayNames(undefined)).toEqual([])
    expect(providerDisplayNames(null)).toEqual([])
  })
})

describe('providerSummary', () => {
  it('joins several providers', () => {
    expect(providerSummary(['github:1', 'linkedin:2'])).toBe(
      'GitHub + LinkedIn',
    )
  })

  it('reports an EMPTY providers list as never signed in, not as blank', () => {
    // The document was created by an organizer and nobody has claimed it.
    // Folding a never-claimed placeholder away is a different, safer operation
    // than folding two real accounts together, so it must be visible.
    expect(providerSummary([])).toBe(NEVER_SIGNED_IN_LABEL)
    expect(providerSummary(undefined)).toBe(NEVER_SIGNED_IN_LABEL)
    expect(NEVER_SIGNED_IN_LABEL).not.toBe('')
  })
})
