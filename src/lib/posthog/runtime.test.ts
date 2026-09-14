import { describe, it, expect, vi } from 'vitest'
import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsRuntime,
  notifyConsentChanged,
  onAnalyticsRuntime,
  publishAnalyticsRuntime,
  type TenantAnalyticsRuntime,
} from './runtime'

function runtime(): TenantAnalyticsRuntime {
  return {
    client: {
      opt_in_capturing: vi.fn(),
      opt_out_capturing: vi.fn(),
      register: vi.fn(),
      register_for_session: vi.fn(),
      get_explicit_consent_status: vi.fn(() => 'pending' as const),
    },
    config: { token: 'phc_x', conference: 'conf-1' },
    landingUtm: {},
  }
}

/** A window stand-in: an EventTarget with the one property the bridge uses. */
function fakeWindow() {
  return new EventTarget() as EventTarget & {
    __tenantAnalytics?: TenantAnalyticsRuntime
  }
}

describe('the analytics runtime bridge', () => {
  it('hands a subscriber the runtime immediately when it is already published', () => {
    const win = fakeWindow()
    const rt = runtime()
    publishAnalyticsRuntime(win, rt)
    expect(getAnalyticsRuntime(win)).toBe(rt)
    const cb = vi.fn()
    onAnalyticsRuntime(win, cb)
    expect(cb).toHaveBeenCalledWith(rt)
  })

  it('notifies a subscriber that registered before init finished', () => {
    const win = fakeWindow()
    const cb = vi.fn()
    const unsubscribe = onAnalyticsRuntime(win, cb)
    expect(cb).not.toHaveBeenCalled()
    const rt = runtime()
    publishAnalyticsRuntime(win, rt)
    expect(cb).toHaveBeenCalledWith(rt)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const win = fakeWindow()
    const cb = vi.fn()
    onAnalyticsRuntime(win, cb)()
    publishAnalyticsRuntime(win, runtime())
    expect(cb).not.toHaveBeenCalled()
  })

  it('broadcasts consent changes as a window event', () => {
    const win = fakeWindow()
    const cb = vi.fn()
    win.addEventListener(ANALYTICS_CONSENT_EVENT, cb)
    notifyConsentChanged(win)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
