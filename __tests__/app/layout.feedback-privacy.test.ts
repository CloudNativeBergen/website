/**
 * @vitest-environment node
 *
 * The root layout mounts the analytics on every route and cannot see the
 * path, so its WIRING is what keeps the Feedback Code off third parties on
 * `/f/**` (speaker feedback spec §7.1). The components are tested on their
 * own (`__tests__/components/analytics/FeedbackRoutePrivacy.test.tsx`); this
 * pins that the layout actually uses them. A Server Component that reads
 * headers cannot be rendered here, so the pin is on the source, like the
 * `'use cache: remote'` pin in `attendee.groq.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, '../../src/app/layout.tsx'), 'utf8')

/** The JSX between `<HiddenOnFeedbackPage>` and its closing tag, each time. */
const gated = [
  ...source.matchAll(
    /<HiddenOnFeedbackPage>([\s\S]*?)<\/HiddenOnFeedbackPage>/g,
  ),
].map((m) => m[1])

describe('root layout — the Feedback Code stays off analytics', () => {
  it('mounts Vercel Analytics and Speed Insights only through the redacting wrapper', () => {
    expect(source).toContain('<VercelInsights />')
    expect(source).not.toMatch(/@vercel\/analytics|@vercel\/speed-insights/)
  })

  it('gates the Pirsch script and the install prompt on the path', () => {
    expect(gated.some((jsx) => jsx.includes('id="pianjs"'))).toBe(true)
    expect(gated.some((jsx) => jsx.includes('<InstallPrompt />'))).toBe(true)
    // And neither is mounted anywhere else.
    expect(source.match(/id="pianjs"/g)).toHaveLength(1)
    expect(source.match(/<InstallPrompt \/>/g)).toHaveLength(1)
  })
})
