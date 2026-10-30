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
import { UTM_STRIP_DEADLINE_MS, UTM_STRIP_WATCH_TICK_MS } from './address-bar'

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
  // Nothing leaves: the SDK's own requests (flags, config) go nowhere.
  vi.spyOn(
    posthog as unknown as { _send_request(o: unknown): void },
    '_send_request',
  ).mockImplementation(() => {})
  // Since posthog-js 1.433.2 events reach the network through the retry
  // queue, which no longer calls `_send_request`, so they are recorded where
  // the SDK hands them over: `eventCaptured` fires after `before_send`, with
  // the payload that is queued for sending.
  posthog.on('eventCaptured', (event) => {
    sent.push(event as unknown as (typeof sent)[number])
  })
})
afterAll(async () => {
  // The strip's guard re-checks the address bar on a timer for as long as
  // the page is on the landing. Leave it, and let the next re-check run and
  // stop while the window still has a location: left pending, it fires
  // after jsdom's teardown, in whatever file the worker runs next.
  window.history.replaceState(null, '', '/elsewhere')
  await new Promise((resolve) =>
    setTimeout(resolve, UTM_STRIP_WATCH_TICK_MS + 100),
  )
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
