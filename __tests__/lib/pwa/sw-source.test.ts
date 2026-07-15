import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NEVER_CACHE_PREFIXES } from '@/lib/pwa/request-classification'

/**
 * `public/sw.js` is hand-written plain JS and cannot import the TypeScript
 * classifier, so it MIRRORS the rules inline. These tests are a drift guard:
 * they fail if the security-critical auth-path exclusions or the "no
 * unconditional skipWaiting on install" invariant are ever removed from the
 * worker source.
 */
describe('public/sw.js source invariants', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../public/sw.js'),
    'utf8',
  )

  it('references every auth prefix that must never be cached', () => {
    for (const prefix of NEVER_CACHE_PREFIXES) {
      expect(source).toContain(`'${prefix}'`)
    }
  })

  it('does not call skipWaiting() inside the install handler', () => {
    const installBlock = source.slice(
      source.indexOf("addEventListener('install'"),
      source.indexOf("addEventListener('activate'"),
    )
    expect(installBlock.length).toBeGreaterThan(0)
    // The literal call `self.skipWaiting()` must not appear in install (a
    // reference in a comment like "NO skipWaiting() here" is fine).
    expect(installBlock).not.toContain('self.skipWaiting')
  })

  it('only calls skipWaiting() in response to a SKIP_WAITING message', () => {
    expect(source).toContain('SKIP_WAITING')
    expect(source).toContain('self.skipWaiting()')
  })

  it('claims clients and cleans up non-allowlisted caches on activate', () => {
    expect(source).toContain('clients.claim()')
    expect(source).toContain('caches.delete')
  })

  it('serves the precached offline page as the navigation fallback', () => {
    expect(source).toContain('/offline')
  })

  // --- Web push handlers (#444) --------------------------------------------

  it('registers push, notificationclick and pushsubscriptionchange handlers', () => {
    expect(source).toContain("addEventListener('push'")
    expect(source).toContain("addEventListener('notificationclick'")
    expect(source).toContain("addEventListener('pushsubscriptionchange'")
  })

  it('shows a notification from the push handler', () => {
    expect(source).toContain('self.registration.showNotification')
  })

  it('constrains a notification click to a same-origin path', () => {
    // Mirrors src/lib/pwa/push-payload.ts sanitizeUrl: reject "//..." absolute
    // and protocol-relative URLs so a click can never leave the origin.
    expect(source).toContain("value.startsWith('/')")
    expect(source).toContain("!value.startsWith('//')")
  })

  it('opens or focuses a window on notification click', () => {
    expect(source).toContain('clients.matchAll')
    expect(source).toContain('clients.openWindow')
  })
})
