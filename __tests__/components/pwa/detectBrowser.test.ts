/**
 * @vitest-environment jsdom
 *
 * Tests for detectBrowser (src/components/pwa/installView.ts) — the client UA
 * sniffing that decides which install COPY the `/install` page shows. The key
 * correctness property: iOS in-app webviews (Facebook, Instagram, …) carry a
 * "Safari" token but CANNOT Add-to-Home-Screen, so they must NOT be classified
 * as Safari (they should get the "open in Safari" guidance instead).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { detectBrowser } from '@/components/pwa/installView'

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
  iosFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 [FBAN/FBIOS;FBAV/440.0]',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
}

afterEach(() => {
  setUA('') // reset between cases
})

describe('detectBrowser', () => {
  it('classifies real iOS Safari as iOS + Safari', () => {
    setUA(UA.iosSafari)
    expect(detectBrowser()).toEqual({ isIOS: true, isSafari: true })
  })

  it('classifies iOS Chrome (CriOS) as iOS but NOT Safari', () => {
    setUA(UA.iosChrome)
    expect(detectBrowser()).toEqual({ isIOS: true, isSafari: false })
  })

  it('does NOT treat an iOS in-app webview (Facebook) as Safari', () => {
    setUA(UA.iosFacebook)
    const result = detectBrowser()
    expect(result.isIOS).toBe(true)
    // Even though the UA carries "Safari" + "Version/", the FBAN token means
    // it cannot Add-to-Home-Screen → must not be Safari.
    expect(result.isSafari).toBe(false)
  })

  it('classifies desktop Chrome as neither iOS nor Safari', () => {
    setUA(UA.desktopChrome)
    expect(detectBrowser()).toEqual({ isIOS: false, isSafari: false })
  })

  it('classifies desktop Safari as Safari', () => {
    setUA(UA.desktopSafari)
    // Note: the Mac-vs-iPad split relies on touch support, which jsdom always
    // reports as present, so isIOS is not asserted here (it is false on a real
    // non-touch Mac). The meaningful signal for desktop Safari is isSafari.
    expect(detectBrowser().isSafari).toBe(true)
  })
})
