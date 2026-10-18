/**
 * @vitest-environment node
 *
 * The root layout mounts the analytics on every route and cannot see the
 * path, so its WIRING is what keeps the Feedback Code off third parties on
 * `/f/**` (speaker feedback spec §7.1). The components are tested on their
 * own (`__tests__/components/analytics/FeedbackRoutePrivacy.test.tsx`); this
 * pins that they are the ONLY way those scripts reach a page. A Server
 * Component that reads headers cannot be rendered here, so the pin is on the
 * source, like the `'use cache: remote'` pin in `attendee.groq.test.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '../../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|stories)\./.test(path)
      ? [path]
      : []
  })
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: readFileSync(path, 'utf8'),
}))
const layout = files.find((f) => f.path === 'app/layout.tsx')!.source

/** The JSX between `<HiddenOnFeedbackPage>` and its closing tag, each time. */
const gated = [
  ...layout.matchAll(
    /<HiddenOnFeedbackPage>([\s\S]*?)<\/HiddenOnFeedbackPage>/g,
  ),
].map((m) => m[1])

describe('the Feedback Code stays off analytics', () => {
  it('imports the Vercel scripts only in the redacting wrapper', () => {
    expect(
      files
        .filter((f) => /@vercel\/(analytics|speed-insights)/.test(f.source))
        .map((f) => f.path),
    ).toEqual(['components/analytics/VercelInsights.tsx'])
    expect(layout).toContain('<VercelInsights />')
  })

  it('loads Pirsch once, from the root layout, inside the path gate', () => {
    expect(
      files.filter((f) => /api\.pirsch\.io/.test(f.source)).map((f) => f.path),
    ).toEqual(['app/layout.tsx'])
    expect(layout.match(/api\.pirsch\.io/g)).toHaveLength(1)
    expect(gated.some((jsx) => /api\.pirsch\.io/.test(jsx))).toBe(true)
  })

  it('mounts the install prompt once, inside the path gate', () => {
    expect(
      files.filter((f) => /<InstallPrompt\b/.test(f.source)).map((f) => f.path),
    ).toEqual(['app/layout.tsx'])
    expect(layout.match(/<InstallPrompt\b/g)).toHaveLength(1)
    expect(gated.some((jsx) => /<InstallPrompt\b/.test(jsx))).toBe(true)
  })
})
