import type { InstallPlatform } from './PwaInstallProvider'

/**
 * The distinct install experiences `/install` renders. Kept as a pure,
 * serialisable enum (no React) so the platform → view mapping is unit-testable
 * and the presentational panels can be driven directly in Storybook.
 *
 * - `installed` — already running standalone; show a confirmation, no CTA.
 * - `chromium` — a `beforeinstallprompt` was captured; show a one-tap Install.
 * - `ios-safari` — iOS/iPadOS Safari; show the manual Add-to-Home-Screen steps
 *   (Safari has no install API).
 * - `ios-other` — iOS in a non-Safari browser, which cannot install a
 *   standalone PWA; tell the user to open the page in Safari.
 * - `desktop-generic` — anything else (desktop Chromium before the prompt
 *   fires, Firefox, desktop Safari…); show best-effort browser-menu guidance.
 */
export type InstallView =
  'installed' | 'chromium' | 'ios-safari' | 'ios-other' | 'desktop-generic'

export interface InstallViewInput {
  platform: InstallPlatform
  isStandalone: boolean
  isIOS: boolean
  isSafari: boolean
}

/**
 * Map the shared install capability (+ light UA hints) to the panel `/install`
 * should show. Order matters: an already-installed app wins over everything; a
 * live Chromium prompt beats the manual flows; iOS is split by browser because
 * only Safari can Add-to-Home-Screen.
 */
export function resolveInstallView({
  platform,
  isStandalone,
  isIOS,
  isSafari,
}: InstallViewInput): InstallView {
  if (isStandalone) return 'installed'
  if (platform === 'chromium') return 'chromium'
  if (isIOS || platform === 'ios') {
    return isSafari ? 'ios-safari' : 'ios-other'
  }
  return 'desktop-generic'
}

/**
 * Client-only browser sniffing used ONLY to choose install COPY (never to gate
 * the actual `beforeinstallprompt` capture, which lives in PwaInstallProvider).
 * Returns all-false during SSR so the first client render can refine it.
 */
export function detectBrowser(): { isIOS: boolean; isSafari: boolean } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isSafari: false }
  }
  const ua = navigator.userAgent
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as desktop Safari; disambiguate via touch support.
    (/macintosh/i.test(ua) &&
      typeof document !== 'undefined' &&
      'ontouchend' in document)
  // Safari's UA contains "Safari" but so do Chrome/Firefox/Edge on iOS; those
  // add their own tokens (CriOS/FxiOS/EdgiOS) plus Chrome/Android on other OSes.
  const isSafari =
    /safari/i.test(ua) && !/chrome|crios|android|fxios|edgios|edg\//i.test(ua)
  return { isIOS, isSafari }
}
