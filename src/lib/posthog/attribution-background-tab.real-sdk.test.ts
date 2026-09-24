/**
 * @vitest-environment jsdom
 *
 * A tagged link opened in a BACKGROUND tab, against the real `posthog-js`
 * (own file: the SDK is a module singleton). The SDK defers its first
 * `$pageview` until the page is first shown, and that pageview reads the
 * address bar — so the strip must wait for it rather than run out a deadline
 * nobody could see. Only the transport is faked, as in
 * `attribution.real-sdk.test.ts`.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'
import { initTenantAnalytics, VERIFY_RUN_PARAM } from './init'
import { ANALYTICS_CONFIG_ELEMENT_ID } from './config'
import { UTM_STRIP_DEADLINE_MS } from './address-bar'

const TOKEN = 'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh'

const sent: { event: string; properties: Record<string, unknown> }[] = []
let visibility: DocumentVisibilityState = 'hidden'

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  window.history.replaceState(
    null,
    '',
    `/?utm_campaign=c1&utm_content=k1&${VERIFY_RUN_PARAM}=1`,
  )
  const element = document.createElement('div')
  element.id = ANALYTICS_CONFIG_ELEMENT_ID
  element.setAttribute('data-token', TOKEN)
  element.setAttribute('data-conference', 'conf-1')
  document.body.appendChild(element)
  vi.spyOn(
    posthog as unknown as { _send_request(o: unknown): void },
    '_send_request',
  ).mockImplementation((options) => {
    const { url, data } = options as { url: string; data: unknown }
    if (!/\/e\/?(\?|$)/.test(new URL(url, 'http://x').pathname + '?')) return
    for (const event of Array.isArray(data) ? data : [data]) {
      sent.push(event as (typeof sent)[number])
    }
  })
})
afterAll(() => {
  vi.restoreAllMocks()
})

it(
  'keeps the tags until the tab is shown and its pageview has read them',
  {
    timeout: 10_000,
  },
  async () => {
    await initTenantAnalytics(window)
    // Longer than the deadline: a hidden tab must not run it out.
    await new Promise((resolve) =>
      setTimeout(resolve, UTM_STRIP_DEADLINE_MS + 200),
    )
    expect(sent.filter((e) => e.event === '$pageview')).toHaveLength(0)
    expect(window.location.search).toContain('utm_campaign=c1')

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    const [landing] = sent.filter((e) => e.event === '$pageview')
    expect(landing?.properties).toMatchObject({
      utm_campaign: 'c1',
      utm_content: 'k1',
    })
    expect(window.location.search).toBe(`?${VERIFY_RUN_PARAM}=1`)
  },
)
