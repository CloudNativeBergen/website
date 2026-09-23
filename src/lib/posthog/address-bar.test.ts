/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleUtmStrip, UTM_STRIP_DEADLINE_MS } from './address-bar'

const TAGGED = '/?utm_source=x&utm_campaign=c1&utm_content=k1&keep=1#h'

type Listener = (event: { event: string }) => void

/** The slice of the PostHog client the schedule touches, observable. */
function fakeClient() {
  const listeners = new Set<Listener>()
  return {
    on: vi.fn((_name: 'eventCaptured', cb: Listener) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }),
    emit(event: string) {
      for (const cb of [...listeners]) cb({ event })
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', TAGGED)
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  setVisibility('visible')
})

describe('scheduleUtmStrip', () => {
  it('strips on the first $pageview and not before', () => {
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    schedule.afterFirstPageview(client)

    client.emit('$opt_in')
    client.emit('$autocapture')
    expect(window.location.search).toContain('utm_campaign=c1')

    client.emit('$pageview')
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#h')
    // Done: nothing left listening, nothing left pending.
    expect(client.listenerCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('strips anyway after the deadline when no pageview arrives', () => {
    const client = fakeClient()
    scheduleUtmStrip(window).afterFirstPageview(client)

    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS - 1)
    expect(window.location.search).toContain('utm_campaign=c1')
    vi.advanceTimersByTime(1)
    expect(window.location.search).toBe('?keep=1')
    expect(client.listenerCount).toBe(0)
  })

  it('arms the deadline on its own, before any client exists', () => {
    // The config element can stream in late or never; the deadline must not
    // depend on it.
    scheduleUtmStrip(window)
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS)
    expect(window.location.search).toBe('?keep=1')
  })

  it('does not start the deadline while the tab is in the background', () => {
    // A link opened in a background tab: the SDK defers its first pageview
    // until the page is visible, and that pageview reads the address bar.
    setVisibility('hidden')
    scheduleUtmStrip(window)
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS * 10)
    expect(window.location.search).toContain('utm_campaign=c1')

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS - 1)
    expect(window.location.search).toContain('utm_campaign=c1')
    vi.advanceTimersByTime(1)
    expect(window.location.search).toBe('?keep=1')
  })

  it('now() strips immediately and cancels the rest', () => {
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    expect(window.location.search).toBe('?keep=1')
    expect(vi.getTimerCount()).toBe(0)

    // Late arrivals are no-ops: no second replaceState, no listener kept.
    const replace = vi.spyOn(window.history, 'replaceState')
    schedule.afterFirstPageview(client)
    client.emit('$pageview')
    schedule.now()
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS)
    expect(replace).not.toHaveBeenCalled()
    expect(client.on).not.toHaveBeenCalled()
  })

  it('never pushes a history entry', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const lengthBefore = window.history.length
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    schedule.afterFirstPageview(client)
    client.emit('$pageview')
    client.emit('$pageview')
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS)
    schedule.now()
    expect(push).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(window.history.length).toBe(lengthBefore)
  })

  it('arms nothing when the URL has no utm_* to begin with', () => {
    window.history.replaceState(null, '', '/?keep=1')
    const replace = vi.spyOn(window.history, 'replaceState')
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    expect(vi.getTimerCount()).toBe(0)
    schedule.afterFirstPageview(client)
    expect(client.on).not.toHaveBeenCalled()
    schedule.now()
    expect(replace).not.toHaveBeenCalled()
  })
})
