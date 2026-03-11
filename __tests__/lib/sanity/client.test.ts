import { describe, expect, it } from 'vitest'
import { speakerImageUrl } from '@/lib/sanity/client'

describe('speakerImageUrl', () => {
  const sanityCdnUrl =
    'https://cdn.sanity.io/images/testproject/production/abc123-200x200.jpg'
  const githubAvatarUrl = 'https://avatars.githubusercontent.com/u/12345?v=4'
  const linkedinAvatarUrl =
    'https://media.licdn.com/dms/image/v2/abc123/profile-photo.jpg'

  it('should transform Sanity CDN URLs through the image builder', () => {
    const result = speakerImageUrl(sanityCdnUrl)

    expect(result).toContain('cdn.sanity.io')
  })

  it('should return GitHub avatar URLs unchanged', () => {
    expect(speakerImageUrl(githubAvatarUrl)).toBe(githubAvatarUrl)
  })

  it('should return LinkedIn avatar URLs unchanged', () => {
    expect(speakerImageUrl(linkedinAvatarUrl)).toBe(linkedinAvatarUrl)
  })

  it('should not transform non-Sanity URLs even with custom options', () => {
    const result = speakerImageUrl(githubAvatarUrl, {
      width: 800,
      height: 800,
      fit: 'crop',
    })

    expect(result).toBe(githubAvatarUrl)
  })

  it('should not transform plain http URLs', () => {
    const httpUrl = 'http://example.com/photo.jpg'
    expect(speakerImageUrl(httpUrl)).toBe(httpUrl)
  })
})
