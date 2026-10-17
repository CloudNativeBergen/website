import { describe, expect, it } from 'vitest'
import { isFeedbackPath, redactFeedbackCode } from './url'

describe('isFeedbackPath', () => {
  it('is the /f segment and everything under it', () => {
    expect(isFeedbackPath('/f')).toBe(true)
    expect(isFeedbackPath('/f/k7m2qx')).toBe(true)
    expect(isFeedbackPath('/f/k7m2qx/')).toBe(true)
  })

  it('is not a path that merely starts with an f, or has /f deeper down', () => {
    expect(isFeedbackPath('/faq')).toBe(false)
    expect(isFeedbackPath('/foo/f/k7m2qx')).toBe(false)
    expect(isFeedbackPath('/')).toBe(false)
    expect(isFeedbackPath(null)).toBe(false)
  })
})

describe('redactFeedbackCode — no code reaches Vercel Analytics (§7.1)', () => {
  it('replaces the code in an absolute URL, and drops its query and fragment', () => {
    expect(
      redactFeedbackCode({
        type: 'pageview',
        url: 'https://2026.cloudnativedays.no/f/k7m2qx?utm=x#top',
      }),
    ).toEqual({
      type: 'pageview',
      url: 'https://2026.cloudnativedays.no/f/[code]',
    })
  })

  it('redacts whatever the segment holds, well-formed or not', () => {
    expect(redactFeedbackCode({ url: 'https://a.dev/f/NOT-A-CODE/x' })).toEqual(
      { url: 'https://a.dev/f/[code]' },
    )
  })

  it('keeps the other fields of the event', () => {
    expect(
      redactFeedbackCode({
        type: 'vital',
        url: 'https://a.dev/f/k7m2qx',
        route: '/f/[code]',
      }),
    ).toEqual({
      type: 'vital',
      url: 'https://a.dev/f/[code]',
      route: '/f/[code]',
    })
  })

  it('leaves every other URL exactly as it was', () => {
    for (const url of [
      'https://a.dev/program?day=2',
      'https://a.dev/faq',
      'https://a.dev/foo/f/k7m2qx',
    ]) {
      expect(redactFeedbackCode({ url })).toEqual({ url })
    }
  })

  it('redacts a URL it cannot parse rather than letting it through', () => {
    expect(redactFeedbackCode({ url: '/f/k7m2qx' })).toEqual({
      url: '/f/[code]',
    })
  })
})
