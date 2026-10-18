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
  it('sends Referrer-Policy: no-referrer on /f/<code>, and only there', async () => {
    const rules = (await config.headers?.()) ?? []
    const feedback = rules.filter((r) =>
      r.headers.some((h) => h.key === 'Referrer-Policy'),
    )
    expect(feedback).toEqual([
      {
        source: '/f/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ])
  })
})
