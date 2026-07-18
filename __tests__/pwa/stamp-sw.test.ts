/**
 * @vitest-environment node
 *
 * Guards the service-worker version stamp. `scripts/stamp-sw.mjs` rewrites the
 * `CACHE_VERSION` declaration in `public/sw.js` at build time so `/sw.js` changes
 * every deploy (otherwise the PWA never updates). If the declaration's shape ever
 * drifts, the stamp would silently no-op — this test fails first, before a deploy
 * ships a service worker that can never update.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CACHE_VERSION_PATTERN } from '../../scripts/stamp-sw.mjs'

const swSource = readFileSync(
  path.resolve(process.cwd(), 'public/sw.js'),
  'utf8',
)

describe('service-worker version stamp target', () => {
  it('public/sw.js contains a stampable CACHE_VERSION declaration', () => {
    expect(CACHE_VERSION_PATTERN.test(swSource)).toBe(true)
  })

  it('the stamp replacement produces a changed, versioned CACHE_VERSION', () => {
    const stamped = swSource.replace(
      CACHE_VERSION_PATTERN,
      `const CACHE_VERSION = 'cndn-abc12345'`,
    )
    expect(stamped).not.toBe(swSource)
    expect(stamped).toContain("const CACHE_VERSION = 'cndn-abc12345'")
  })
})
