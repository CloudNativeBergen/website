/**
 * @vitest-environment node
 *
 * Unit tests for the pure platform -> install-view mapping that drives the
 * `/install` page (src/components/pwa/installView.ts). Kept free of React so
 * every state — including the precedence rules between them — is pinned.
 */
import { describe, it, expect } from 'vitest'
import { resolveInstallView } from '@/components/pwa/installView'

const base = {
  platform: null as 'chromium' | 'ios' | null,
  isStandalone: false,
  isIOS: false,
  isSafari: false,
}

describe('resolveInstallView', () => {
  it('shows the installed state whenever running standalone (wins over all)', () => {
    expect(
      resolveInstallView({ ...base, isStandalone: true, platform: 'chromium' }),
    ).toBe('installed')
    expect(
      resolveInstallView({
        ...base,
        isStandalone: true,
        isIOS: true,
        isSafari: true,
      }),
    ).toBe('installed')
  })

  it('prefers the Chromium prompt when one was captured', () => {
    expect(resolveInstallView({ ...base, platform: 'chromium' })).toBe(
      'chromium',
    )
  })

  it('shows the iOS Safari Add-to-Home-Screen steps', () => {
    expect(
      resolveInstallView({
        ...base,
        platform: 'ios',
        isIOS: true,
        isSafari: true,
      }),
    ).toBe('ios-safari')
  })

  it('tells iOS non-Safari users to open in Safari (cannot install)', () => {
    expect(
      resolveInstallView({
        ...base,
        platform: 'ios',
        isIOS: true,
        isSafari: false,
      }),
    ).toBe('ios-other')
  })

  it('treats a detected iOS device as iOS even if platform is still null', () => {
    // Provider may not have marked platform yet on the first render.
    expect(resolveInstallView({ ...base, isIOS: true, isSafari: true })).toBe(
      'ios-safari',
    )
    expect(resolveInstallView({ ...base, isIOS: true, isSafari: false })).toBe(
      'ios-other',
    )
  })

  it('falls back to generic desktop guidance otherwise', () => {
    expect(resolveInstallView(base)).toBe('desktop-generic')
    expect(
      resolveInstallView({ ...base, isSafari: true }), // desktop Safari
    ).toBe('desktop-generic')
  })
})
