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

  it('sets a NUMERIC app-icon badge (iOS ignores the arg-less flag form)', () => {
    // The push handler must call setAppBadge WITH an argument. iOS does not
    // support the arg-less "flag" form of the Badging API, so a closed-app push
    // has to set a number for the app-icon badge to appear.
    expect(source).toContain('self.navigator.setAppBadge(badgeCount)')
    // Guard against a regression to the arg-less call.
    expect(source).not.toContain('setAppBadge()')
  })

  it('derives the badge count from the payload, falling back to 1', () => {
    // The count comes from the push payload (the recipient's unread total); when
    // absent it falls back to 1 so a closed-app push still shows a badge.
    expect(source).toContain('payload.badge')
    expect(source).toContain('? payload.badge')
    expect(source).toContain(': 1')
  })

  it('parses a numeric badge out of the push payload', () => {
    // parsePushPayload must read the numeric badge (unread count) so the push
    // handler can set it as the app-icon badge.
    expect(source).toContain("typeof data.badge === 'number'")
    expect(source).toContain('data.badge > 0')
  })

  it('constrains a notification click to a same-origin path', () => {
    // Mirrors src/lib/pwa/push-payload.ts sanitizeUrl: reject "//..." absolute
    // and protocol-relative URLs so a click can never leave the origin.
    expect(source).toContain("value.startsWith('/')")
    expect(source).toContain("!value.startsWith('//')")
  })

  it('rejects a backslash in the notification url (URL parsers treat \\ as /)', () => {
    // "/\evil.com" must not survive sanitisation — new URL('/\\evil.com', origin)
    // resolves OFF-origin. The mirror must reject any string containing a "\".
    expect(source).toContain("value.includes('\\\\')")
  })

  it('re-checks the resolved origin before navigating/opening on click', () => {
    // Belt-and-braces at resolution time: even a sanitised target is re-resolved
    // and compared against self.location.origin before navigate/openWindow.
    expect(source).toContain('resolved.origin === self.location.origin')
  })

  it('opens or focuses a window on notification click', () => {
    expect(source).toContain('clients.matchAll')
    expect(source).toContain('clients.openWindow')
  })

  it('stashes the click intent in the pending-nav cache for the iOS cold-open handoff', () => {
    // iOS ignores openWindow/navigate, so the click intent is handed off through
    // Cache Storage under a fixed key for the freshly-launched client to read.
    // The write must be feature-detected, awaited, and happen before openWindow.
    expect(source).toContain("const PENDING_NAV_CACHE = 'cndn-pending-nav'")
    expect(source).toContain('self.caches.open(PENDING_NAV_CACHE)')
    expect(source).toContain("new Request('/__cndn_pending_notification')")
    // The handoff cache MUST survive the activate cleanup across worker versions,
    // so it is listed in EXPECTED_CACHES.
    expect(source).toContain(
      'const EXPECTED_CACHES = [PRECACHE, RUNTIME, PENDING_NAV_CACHE]',
    )
    // The cache write is initiated before the window is opened/focused.
    const cacheWriteIndex = source.indexOf(
      'self.caches.open(PENDING_NAV_CACHE)',
    )
    const openWindowIndex = source.indexOf('clients.openWindow(openUrl)')
    expect(cacheWriteIndex).toBeGreaterThan(-1)
    expect(openWindowIndex).toBeGreaterThan(-1)
    expect(cacheWriteIndex).toBeLessThan(openWindowIndex)
  })
})
