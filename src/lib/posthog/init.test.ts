/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { init, register, on, emit, resetListeners } = vi.hoisted(() => {
  // `on('eventCaptured')` is observable: `emit` plays the SDK capturing an
  // event, and each call returns its unsubscribe like the real one.
  const listeners = new Set<(event: { event: string }) => void>()
  return {
    init: vi.fn(),
    register: vi.fn(),
    on: vi.fn((_name: string, cb: (event: { event: string }) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }),
    emit: (event: string) => {
      for (const cb of [...listeners]) cb({ event })
    },
    resetListeners: () => listeners.clear(),
  }
})
vi.mock('posthog-js', () => ({
  default: {
    init,
    register,
    on,
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    register_for_session: vi.fn(),
    get_explicit_consent_status: vi.fn(() => 'pending'),
  },
}))

import { initTenantAnalytics, VERIFY_RUN_PARAM } from './init'
import { ANALYTICS_CONFIG_ELEMENT_ID } from './config'
import { UTM_STRIP_DEADLINE_MS } from './address-bar'
import { LANDING_UTM_KEY } from '@/lib/marketing/landing-utm'
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
  // Every init arms a strip deadline and a pageview listener; neither may
  // outlive its test and strip the next test's URL.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  resetListeners()
  window.history.replaceState({}, '', '/')
  document.body.innerHTML = ''
  delete window.__tenantAnalytics
  window.sessionStorage.clear()
  init.mockReset()
  register.mockReset()
  on.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
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

const TAGGED_QUERY = '?utm_source=x&utm_campaign=c1&utm_content=k1&keep=1'

describe('initTenantAnalytics: the utm_* strip (#1146)', () => {
  it('strips right after the SDK captures its first $pageview, not before', async () => {
    window.history.replaceState({}, '', `/${TAGGED_QUERY}#h`)
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    // Initialised, but the landing pageview has not gone out: the tags stay,
    // because that pageview is how a cookieless visitor is attributed.
    expect(init).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe(TAGGED_QUERY)

    emit('$pageview')
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#h')
  })

  it('hands the landing UTMs to the Accept bridge in before_send', async () => {
    window.history.replaceState({}, '', `/${TAGGED_QUERY}`)
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    emit('$pageview')
    const beforeSend = init.mock.calls[0][1].before_send as (e: unknown) => {
      properties: Record<string, unknown>
    }
    beforeSend({ event: '$opt_in', properties: { $pathname: '/' } })
    expect(
      beforeSend({ event: '$pageview', properties: { $pathname: '/' } })
        .properties.utm_campaign,
    ).toBe('c1')
  })

  it('strips at once on an excluded route, where no SDK will run', async () => {
    window.history.replaceState({}, '', `/cfp/proposal${TAGGED_QUERY}`)
    document.body.appendChild(configElement())
    const pending = initTenantAnalytics(window)
    expect(window.location.search).toBe('?keep=1')
    expect(init).not.toHaveBeenCalled()
    window.history.replaceState({}, '', '/')
    notifyEligibleRoute(window)
    await pending
  })

  it('strips at once when the config element holds no usable token', async () => {
    window.history.replaceState({}, '', `/${TAGGED_QUERY}`)
    document.body.appendChild(configElement('phx_personal_key_must_not_load'))
    await initTenantAnalytics(window)
    expect(init).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?keep=1')
  })

  it('strips after the deadline when the config element never arrives', async () => {
    window.history.replaceState({}, '', `/${TAGGED_QUERY}`)
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    const pending = initTenantAnalytics(window)
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS - 1)
    expect(window.location.search).toBe(TAGGED_QUERY)
    vi.advanceTimersByTime(1)
    expect(window.location.search).toBe('?keep=1')
    document.body.appendChild(configElement())
    notifyEligibleRoute(window)
    await pending
  })

  it('writes the CFP first-touch stash before the address bar is stripped', async () => {
    window.history.replaceState({}, '', `/cfp${TAGGED_QUERY}`)
    document.body.appendChild(configElement())
    const stashAtStrip: (string | null)[] = []
    const replace = window.history.replaceState.bind(window.history)
    vi.spyOn(window.history, 'replaceState').mockImplementation((...args) => {
      stashAtStrip.push(window.sessionStorage.getItem(LANDING_UTM_KEY))
      replace(...args)
    })
    await initTenantAnalytics(window)
    emit('$pageview')
    expect(window.location.search).toBe('?keep=1')
    expect(stashAtStrip).toHaveLength(1)
    expect(JSON.parse(stashAtStrip[0] ?? 'null')).toEqual({
      source: 'x',
      campaign: 'c1',
      content: 'k1',
    })
  })

  it('does not stash a landing on any other page', async () => {
    // Only the public CFP page credits a later proposal, as before.
    window.history.replaceState({}, '', `/program${TAGGED_QUERY}`)
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    expect(window.sessionStorage.getItem(LANDING_UTM_KEY)).toBeNull()
  })

  it('lifts the bot filter for a verification run outside production only', async () => {
    window.history.replaceState({}, '', `/?${VERIFY_RUN_PARAM}=1`)
    document.body.appendChild(configElement())
    await initTenantAnalytics(window)
    expect(init.mock.calls[0][1]).toMatchObject({
      opt_out_useragent_filter: true,
    })
    expect(getAnalyticsRuntime(window)?.config.conference).toBe('verify-test')

    init.mockReset()
    delete window.__tenantAnalytics
    vi.stubEnv('NODE_ENV', 'production')
    await initTenantAnalytics(window)
    expect(init.mock.calls[0][1].opt_out_useragent_filter).toBeUndefined()
    expect(getAnalyticsRuntime(window)?.config.conference).toBe('conf-1')
  })
})
