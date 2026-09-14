/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { init, register } = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
}))
vi.mock('posthog-js', () => ({
  default: {
    init,
    register,
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    register_for_session: vi.fn(),
    get_explicit_consent_status: vi.fn(() => 'pending'),
  },
}))

import { initTenantAnalytics } from './init'
import { ANALYTICS_CONFIG_ELEMENT_ID } from './config'
import { getAnalyticsRuntime, notifyEligibleRoute } from './runtime'

const TOKEN = 'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh'

function configElement(token = TOKEN, conference = 'conf-1') {
  const el = document.createElement('div')
  el.id = ANALYTICS_CONFIG_ELEMENT_ID
  el.hidden = true
  el.setAttribute('data-token', token)
  el.setAttribute('data-conference', conference)
  return el
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  document.body.innerHTML = ''
  delete window.__tenantAnalytics
  init.mockReset()
  register.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'complete',
  })
})

describe('initTenantAnalytics', () => {
  it('initialises PostHog from a config element already in the page', async () => {
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0]).toBe(TOKEN)
    expect(init.mock.calls[0][1]).toMatchObject({
      cookieless_mode: 'on_reject',
    })
    expect(getAnalyticsRuntime(window)?.config).toEqual({
      token: TOKEN,
      conference: 'conf-1',
    })
  })

  it('waits for a config element that streams in after the shell', async () => {
    // The element is rendered inside a Suspense boundary and arrives after the
    // client entry has already run. Fully resolved only once it appears.
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    let settled = false
    const pending = initTenantAnalytics(window).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(init).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    document.body.appendChild(configElement())
    await pending
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the document finishes loading without a config element', async () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    let settled = false
    const pending = initTenantAnalytics(window).then(() => {
      settled = true
    })
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    })
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()
    expect(init).not.toHaveBeenCalled()
    expect(getAnalyticsRuntime(window)).toBeUndefined()
    // No token ⇒ the gate never mounts ⇒ the wait simply never resolves.
    expect(settled).toBe(false)
    // Settle it so its listener does not leak into the next test.
    document.body.appendChild(configElement())
    notifyEligibleRoute(window)
    await pending
  })

  it('still initialises when the element streams in after load, via the route gate', async () => {
    // A slow tenant read can land the Suspense hole after `load`; the gate
    // component mounts next to the element and announces it.
    const pending = initTenantAnalytics(window)
    await Promise.resolve()
    expect(init).not.toHaveBeenCalled()
    document.body.appendChild(configElement())
    notifyEligibleRoute(window)
    await pending
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('refuses a malformed token even if it reached the page', async () => {
    document.body.appendChild(configElement('phx_personal_key_must_not_load'))
    await initTenantAnalytics(window)
    expect(init).not.toHaveBeenCalled()
  })

  it('does not initialise on an admin or speaker route', async () => {
    window.history.replaceState({}, '', '/admin/settings')
    document.body.appendChild(configElement())
    let settled = false
    const pending = initTenantAnalytics(window).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(init).not.toHaveBeenCalled()
    expect(settled).toBe(false)
    // Let the wait settle so its listener does not leak into the next test.
    window.history.replaceState({}, '', '/')
    notifyEligibleRoute(window)
    await pending
  })

  it('initialises once a client-side navigation reaches a public route', async () => {
    window.history.replaceState({}, '', '/cfp/list')
    document.body.appendChild(configElement())
    const pending = initTenantAnalytics(window)
    await Promise.resolve()
    // A navigation that stays inside the portal changes nothing.
    window.history.replaceState({}, '', '/cfp/profile')
    notifyEligibleRoute(window)
    await Promise.resolve()
    expect(init).not.toHaveBeenCalled()

    window.history.replaceState({}, '', '/')
    notifyEligibleRoute(window)
    await pending
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('remembers the landing UTMs for the accept bridge', async () => {
    window.history.replaceState(
      {},
      '',
      '/?utm_campaign=cfp-open&utm_content=t1',
    )
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    expect(getAnalyticsRuntime(window)?.landingUtm).toEqual({
      utm_campaign: 'cfp-open',
      utm_content: 't1',
    })
  })
})
