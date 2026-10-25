import { describe, expect, it } from 'vitest'
import { speakerPath } from './path'

describe('speakerPath', () => {
  it('builds the profile path', () => {
    expect(speakerPath('ada-lovelace')).toBe('/speaker/ada-lovelace')
  })

  it('percent-encodes non-ASCII so no client can mis-decode it', () => {
    expect(speakerPath('sindre-bøyum')).toBe('/speaker/sindre-b%C3%B8yum')
  })

  it.each([null, undefined, '', '   '])('is null for %j', (slug) => {
    expect(speakerPath(slug)).toBeNull()
  })
})
