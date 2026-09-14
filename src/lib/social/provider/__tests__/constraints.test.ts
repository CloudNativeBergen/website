import { describe, expect, it } from 'vitest'
import {
  PLATFORM_CONSTRAINTS,
  countLength,
  getPlatformConstraints,
  validatePublishInput,
} from '../constraints'

const media = (alt = 'A crowd at the keynote') => ({
  url: 'https://cdn.sanity.io/images/p/d/a.jpg',
  mimeType: 'image/jpeg',
  alt,
})

describe('platform constraints', () => {
  it('LinkedIn counts characters up to 3,000 and allows a link in the body', () => {
    const c = PLATFORM_CONSTRAINTS.linkedin
    expect(c.maxLength).toBe(3000)
    expect(c.counting).toBe('characters')
    expect(c.linkInBody).toBe(true)
  })

  it('Bluesky counts graphemes up to 300 and takes at most four images', () => {
    const c = PLATFORM_CONSTRAINTS.bluesky
    expect(c.maxLength).toBe(300)
    expect(c.counting).toBe('graphemes')
    expect(c.maxImages).toBe(4)
  })

  it('has no constraints for a platform without an adapter', () => {
    expect(getPlatformConstraints('mastodon')).toBeNull()
  })
})

describe('countLength', () => {
  it('counts a flag emoji as one grapheme but many characters', () => {
    // 🇳🇴 is two code points (four UTF-16 units) and one grapheme.
    expect(countLength('🇳🇴', 'graphemes')).toBe(1)
    expect(countLength('🇳🇴', 'characters')).toBe(4)
  })
})

describe('validatePublishInput', () => {
  const bluesky = PLATFORM_CONSTRAINTS.bluesky
  const linkedin = PLATFORM_CONSTRAINTS.linkedin

  it('accepts a body within the limit with no media', () => {
    expect(
      validatePublishInput(bluesky, { text: 'Tickets are live', media: [] }),
    ).toEqual([])
  })

  it('refuses an empty body', () => {
    const issues = validatePublishInput(linkedin, { text: '   ', media: [] })
    expect(issues).toEqual([
      { field: 'body', message: expect.stringMatching(/empty/i) },
    ])
  })

  it('refuses a Bluesky body of 301 graphemes and accepts 300', () => {
    const ok = validatePublishInput(bluesky, {
      text: '🇳🇴'.repeat(300),
      media: [],
    })
    expect(ok).toEqual([])
    const over = validatePublishInput(bluesky, {
      text: '🇳🇴'.repeat(301),
      media: [],
    })
    expect(over).toEqual([
      { field: 'body', message: expect.stringMatching(/301.*300/) },
    ])
  })

  it('refuses a fifth Bluesky image', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [media(), media(), media(), media(), media()],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/4/) },
    ])
  })

  it('refuses a Bluesky image without alt text', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [media(''), media('   ')],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/alt/i) },
    ])
  })

  it('does not require alt text where the platform does not (LinkedIn)', () => {
    expect(
      validatePublishInput(linkedin, { text: 'x', media: [media('')] }),
    ).toEqual([])
  })

  it('refuses an image type the platform does not accept', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [{ ...media(), mimeType: 'image/svg+xml' }],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/svg/i) },
    ])
  })

  it('refuses a link that is not http(s)', () => {
    const issues = validatePublishInput(linkedin, {
      text: 'x',
      media: [],
      link: 'javascript:alert(1)',
    })
    expect(issues).toEqual([
      { field: 'link', message: expect.stringMatching(/https?/) },
    ])
  })
})

describe('the link card displaces images (#1005)', () => {
  const link = 'https://cloudnativedays.no/tickets?utm_source=bluesky'
  const image = {
    url: 'https://cdn.sanity.io/x.png',
    mimeType: 'image/png',
    alt: 'a',
  }

  it('refuses a second image alongside a link on Bluesky; one image (the thumbnail) is fine', () => {
    const bluesky = PLATFORM_CONSTRAINTS.bluesky
    expect(
      validatePublishInput(bluesky, { text: 'Hi', media: [image], link }),
    ).toEqual([])
    expect(
      validatePublishInput(bluesky, { text: 'Hi', media: [image, image] }),
    ).toEqual([])
    expect(
      validatePublishInput(bluesky, {
        text: 'Hi',
        media: [image, image],
        link,
      }),
    ).toEqual([
      {
        field: 'media',
        message: expect.stringContaining('keep one image or drop the link'),
      },
    ])
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, {
        text: 'Hi',
        media: [image, image],
        link,
      }),
    ).toEqual([])
  })

  it('enforces the 3,000-byte cap alongside the 300-grapheme cap', () => {
    // 200 family emoji: 200 graphemes, 11 code units and 25 bytes each —
    // within both platforms' length limits, over Bluesky's byte cap only.
    const text = '👨‍👩‍👧‍👧'.repeat(200)
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.bluesky, { text, media: [] }),
    ).toEqual([{ field: 'body', message: '5000 bytes, the limit is 3000.' }])
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, { text, media: [] }),
    ).toEqual([])
  })
})
