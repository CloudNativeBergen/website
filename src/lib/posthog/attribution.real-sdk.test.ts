/**
 * @vitest-environment jsdom
 *
 * The #1146 attribution path against the REAL `posthog-js` (no module mock):
 * the real init entry, the real SDK capture pipeline and `before_send`, the
 * real `opt_in_capturing()` reset. Only the transport is faked — the SDK's
 * `_send_request` is replaced with a recorder, so what is asserted is the
 * payload the SDK hands to the network. A mocked SDK could not show any of
 * this: the whole question is what the SDK does inside its own calls.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'
import { initTenantAnalytics, VERIFY_RUN_PARAM } from './init'
import { ANALYTICS_CONFIG_ELEMENT_ID } from './config'
import { applyConsentChoice } from './consent'
import { getAnalyticsRuntime } from './runtime'

const TOKEN = 'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh'
// jsdom's user agent is on the SDK's bot list; the verification flag lifts
// the filter (outside production only), exactly as in the browser script.
const LANDING = `/?utm_source=bsky&utm_medium=social&utm_campaign=c1&utm_content=k1&keep=1&${VERIFY_RUN_PARAM}=1#h`

interface SentEvent {
  event: string
  properties: Record<string, unknown>
}

const sent: SentEvent[] = []
function sentEvents(name: string): SentEvent[] {
  return sent.filter((e) => e.event === name)
}
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(() => {
  window.history.replaceState(null, '', LANDING)
  const element = document.createElement('div')
  element.id = ANALYTICS_CONFIG_ELEMENT_ID
  element.setAttribute('data-token', TOKEN)
  element.setAttribute('data-conference', 'conf-1')
  document.body.appendChild(element)
  // Replace the transport on the singleton BEFORE init, so nothing leaves.
  vi.spyOn(
    posthog as unknown as { _send_request(o: unknown): void },
    '_send_request',
  ).mockImplementation((options) => {
    const { url, data } = options as { url: string; data: unknown }
    if (!/\/e\/?(\?|$)/.test(new URL(url, 'http://x').pathname + '?')) return
    for (const event of Array.isArray(data) ? data : [data]) {
      sent.push(event as SentEvent)
    }
  })
})
afterAll(() => {
  vi.restoreAllMocks()
})

describe('landing on a tagged URL, real SDK', () => {
  it('the cookieless landing pageview carries the tags, then the bar is clean', async () => {
    await initTenantAnalytics(window)
    await tick()

    const [landing] = sentEvents('$pageview')
    expect(landing?.properties).toMatchObject({
      utm_campaign: 'c1',
      utm_content: 'k1',
      $cookieless_mode: true,
    })
    // …and it was captured while the address bar still had them.
    expect(landing?.properties.$current_url).toContain('utm_campaign=c1')

    expect(window.location.search).toBe(`?keep=1&${VERIFY_RUN_PARAM}=1`)
    expect(window.location.hash).toBe('#h')
  })

  it('accepting AFTER the strip still carries the campaign into the new session', async () => {
    const runtime = getAnalyticsRuntime(window)
    if (!runtime) throw new Error('runtime not published')
    sent.length = 0

    applyConsentChoice(runtime.client, 'accept', {
      conference: runtime.config.conference,
      landingUtm: runtime.landingUtm,
    })
    // A later event of the accepted visit, sent without waiting for a batch.
    posthog.capture('later_click', {}, { send_instantly: true })
    await tick()

    // `$opt_in` is the first event of the fresh, cookie-backed client
    // session the reset starts — the one its entry UTMs come from. It is
    // captured INSIDE opt_in_capturing(), so only `before_send` can reach it.
    const [optIn] = sentEvents('$opt_in')
    expect(optIn?.properties.$cookieless_mode).toBeUndefined()
    expect(optIn?.properties).toMatchObject({
      utm_campaign: 'c1',
      utm_content: 'k1',
      utm_source: 'bsky',
    })
    const [later] = sentEvents('later_click')
    expect(later?.properties).toMatchObject({
      utm_campaign: 'c1',
      utm_content: 'k1',
    })
    // Same client session: the campaign rides the session the $opt_in opened.
    expect(later?.properties.$session_id).toBe(optIn?.properties.$session_id)
  })
})
