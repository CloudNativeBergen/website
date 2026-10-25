import { describe, expect, it } from 'vitest'
import { samePageHash } from './samePageHash'

const HERE = {
  origin: 'https://2026.cloudnativebergen.no',
  pathname: '/admin/settings',
  search: '',
}

describe('samePageHash', () => {
  it('returns the hash for an anchor on the current page', () => {
    expect(samePageHash('/admin/settings#visibility', HERE)).toBe('#visibility')
    expect(samePageHash('#analytics', HERE)).toBe('#analytics')
  })

  it('returns null for another page, even with a hash', () => {
    expect(samePageHash('/admin/settings/appearance#logos', HERE)).toBeNull()
    expect(samePageHash('/admin/tickets', HERE)).toBeNull()
  })

  it('returns null without a hash or for a different query/origin', () => {
    expect(samePageHash('/admin/settings', HERE)).toBeNull()
    expect(samePageHash('/admin/settings#', HERE)).toBeNull()
    expect(samePageHash('/admin/settings?x=1#visibility', HERE)).toBeNull()
    expect(
      samePageHash('https://evil.example/admin/settings#visibility', HERE),
    ).toBeNull()
  })
})
