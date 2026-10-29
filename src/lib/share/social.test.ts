import { describe, expect, it } from 'vitest'
import { shareTags } from './social'

describe('shareTags', () => {
  it('joins the hashtag and the Bluesky account', () => {
    expect(
      shareTags({
        socialHashtag: 'cndn2026',
        socialLinks: ['https://bsky.app/profile/cloudnativebergen.dev'],
      }),
    ).toBe('#cndn2026 @cloudnativebergen.dev')
  })

  it('keeps a single # when the tag already has one', () => {
    expect(shareTags({ socialHashtag: ' #cndb2025 ' })).toBe('#cndb2025')
  })

  it('leaves out what is not set', () => {
    expect(
      shareTags({ socialLinks: ['https://bsky.app/profile/a.example'] }),
    ).toBe('@a.example')
    expect(shareTags({ socialHashtag: '  ', socialLinks: [] })).toBeNull()
    expect(shareTags(undefined)).toBeNull()
  })
})
