/**
 * @vitest-environment node
 *
 * The attendee feedback page's path is the Feedback Code (speaker feedback
 * spec §7.1). Its `<meta name="referrer">` is streamed with the rest of the
 * metadata, after the first CSS, script and font requests, so the response
 * HEADER is what keeps the code out of every Referer from the first byte.
 */
import { describe, expect, it } from 'vitest'
import config from '../next.config'

describe('next.config rewrites', () => {
  it('serves a caps-lock Feedback Code URL from the attendee page, never the 404', async () => {
    const rewrites = await config.rewrites?.()
    expect(Array.isArray(rewrites) ? rewrites : []).toContainEqual({
      source: '/F/:code',
      destination: '/f/:code',
    })
  })

  it('serves a Feedback Code URL with extra segments from the attendee page, never the 404', async () => {
    const rewrites = await config.rewrites?.()
    expect(Array.isArray(rewrites) ? rewrites : []).toContainEqual({
      source: '/f/:code/:rest+',
      destination: '/f/:code',
    })
  })
})

describe('next.config headers', () => {
  // Next applies every matching rule in order; for the same key the LAST one
  // wins. So the /f/ rule must come after the site-wide default.
  it('sends Referrer-Policy: no-referrer on /f/<code>, overriding the site default', async () => {
    const rules = (await config.headers?.()) ?? []
    const withReferrer = rules.filter((r) =>
      r.headers.some((h) => h.key === 'Referrer-Policy'),
    )
    expect(withReferrer.map((r) => r.source)).toEqual(['/:path*', '/f/:path*'])
    expect(withReferrer[1].headers).toEqual([
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ])
    expect(
      withReferrer[0].headers.find((h) => h.key === 'Referrer-Policy')?.value,
    ).toBe('strict-origin-when-cross-origin')
  })
})
