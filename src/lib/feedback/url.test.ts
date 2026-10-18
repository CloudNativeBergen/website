import { describe, expect, it } from 'vitest'
import { dropFeedbackVitals, isFeedbackPath, redactFeedbackCode } from './url'

describe('isFeedbackPath', () => {
  it('is the /f segment and everything under it', () => {
    expect(isFeedbackPath('/f')).toBe(true)
    expect(isFeedbackPath('/f/k7m2qx')).toBe(true)
    expect(isFeedbackPath('/f/k7m2qx/')).toBe(true)
    // Codes are case-insensitive, so a URL typed with caps lock is one too.
    expect(isFeedbackPath('/F/K7M2QX')).toBe(true)
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

  it('redacts a capitalised URL too', () => {
    expect(redactFeedbackCode({ url: 'https://a.dev/F/K7M2QX' })).toEqual({
      url: 'https://a.dev/f/[code]',
    })
  })

  it('redacts a URL it cannot parse rather than letting it through', () => {
    expect(redactFeedbackCode({ url: '/f/k7m2qx' })).toEqual({
      url: '/f/[code]',
    })
    // ...and leaves any other one alone.
    expect(redactFeedbackCode({ url: '/program' })).toEqual({ url: '/program' })
  })
})

describe('dropFeedbackVitals — no Speed Insights metric from /f (§7.1)', () => {
  /**
   * How `/_vercel/speed-insights/script.js` 0.1.3 applies `beforeSend`
   * (verbatim from the served script): it copies back the returned `url` ONLY
   * and keeps its own `route`, which it builds from the raw path, so
   * `/f/%6b7m2qx` would report the code as its route whatever `beforeSend`
   * returned for it. Dropping the metric is the only redaction that works.
   */
  const send = (
    beforeSend: typeof dropFeedbackVitals,
    metrics: { href: string; route: string }[],
  ) =>
    metrics
      .map((e) => {
        const n = beforeSend({ type: 'vital', url: e.href, route: e.route })
        return n ? { ...e, href: n.url } : null
      })
      .filter((e) => e !== null)

  it('sends nothing at all from the attendee page, however the URL is spelled', () => {
    expect(
      send(dropFeedbackVitals, [
        { href: 'https://a.dev/f/k7m2qx', route: '/f/[code]' },
        { href: 'https://a.dev/f/%6b7m2qx', route: '/f/%6b7m2qx' },
        { href: 'https://a.dev/F/K7M2QX', route: '/F/[code]' },
        { href: 'https://a.dev/f/k7m2qx?x=1#y', route: '/f/[code]' },
      ]),
    ).toEqual([])
  })

  it('passes every other page through untouched', () => {
    const program = { href: 'https://a.dev/program', route: '/program' }
    expect(send(dropFeedbackVitals, [program])).toEqual([program])
    expect(dropFeedbackVitals({ type: 'vital', url: '/f/k7m2qx' })).toBeNull()
    // A metric captured just after a client-side exit from `/f` can carry
    // the new page's url and the old page's raw-path route.
    expect(
      dropFeedbackVitals({
        type: 'vital',
        url: 'https://a.dev/program',
        route: '/f/%6b7m2qx',
      }),
    ).toBeNull()
  })
})
