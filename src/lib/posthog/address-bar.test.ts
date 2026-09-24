/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  scheduleUtmStrip,
  UTM_STRIP_DEADLINE_MS,
  UTM_STRIP_GUARD_MS,
  UTM_STRIP_GUARD_TICK_MS,
} from './address-bar'

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
    // Done: nothing left listening, and once the guard has run out, nothing
    // left pending.
    expect(client.listenerCount).toBe(0)
    vi.advanceTimersByTime(UTM_STRIP_GUARD_MS + UTM_STRIP_GUARD_TICK_MS)
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

  it('pauses the deadline while the tab is hidden and resumes the rest', () => {
    scheduleUtmStrip(window)
    vi.advanceTimersByTime(1000)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS * 10)
    expect(window.location.search).toContain('utm_campaign=c1')

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS - 1000 - 1)
    expect(window.location.search).toContain('utm_campaign=c1')
    vi.advanceTimersByTime(1)
    expect(window.location.search).toBe('?keep=1')
  })

  it('leaves the URL alone once the visitor has navigated off the landing', () => {
    const schedule = scheduleUtmStrip(window)
    window.history.replaceState(null, '', '/program?utm_campaign=app-link')
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS)
    schedule.now()
    expect(window.location.search).toBe('?utm_campaign=app-link')
  })

  it('still strips when only the hash changed', () => {
    scheduleUtmStrip(window)
    window.location.hash = '#later'
    vi.advanceTimersByTime(UTM_STRIP_DEADLINE_MS)
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#later')
  })

  it('now() strips immediately and cancels the rest', () => {
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    expect(window.location.search).toBe('?keep=1')
    vi.advanceTimersByTime(UTM_STRIP_GUARD_MS + UTM_STRIP_GUARD_TICK_MS)
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

  it('is spent after one strip: it never rewrites a later URL', () => {
    // Once per landing. A URL the app itself tags later (a client-side
    // navigation) is not a landing and is not this schedule's business.
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    window.history.replaceState(null, '', '/program?utm_campaign=later')
    schedule.now()
    expect(window.location.search).toBe('?utm_campaign=later')
  })

  it('re-strips when the router writes the tagged landing back after the strip', () => {
    // The Next router snapshots the URL at its first render and replays it on
    // commit; a strip in between is undone once.
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    expect(window.location.search).toBe('?keep=1')
    window.history.replaceState(window.history.state, '', TAGGED)
    vi.advanceTimersByTime(0)
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#h')

    // …and again later in the guard window.
    vi.advanceTimersByTime(UTM_STRIP_GUARD_TICK_MS * 5)
    window.history.replaceState(window.history.state, '', TAGGED)
    vi.advanceTimersByTime(UTM_STRIP_GUARD_TICK_MS)
    expect(window.location.search).toBe('?keep=1')
  })

  it('hands the router the clean URL once it has hydrated, then stops', () => {
    // Stripped before the router's history patch existed: the router still
    // holds the tagged URL. When it hydrates (its marker lands on the state)
    // the guard rewrites the clean URL once through the patch.
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    const original = window.history.replaceState.bind(window.history)
    let routerUrl: string | null = null
    original({ __NA: true }, '', window.location.href)
    window.history.replaceState = (data, unused, url) => {
      if (data?.__NA) return original(data, unused, url)
      routerUrl = String(url)
      return original({ ...(data ?? {}), __NA: true }, unused, url)
    }
    try {
      vi.advanceTimersByTime(UTM_STRIP_GUARD_TICK_MS)
      expect(routerUrl).toBe(`${window.location.origin}/?keep=1#h`)
      expect(window.history.state).toEqual({ __NA: true })
      vi.advanceTimersByTime(UTM_STRIP_GUARD_MS)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      window.history.replaceState = original
    }
  })

  it('gives up re-checking once the guard runs out', () => {
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    vi.advanceTimersByTime(UTM_STRIP_GUARD_MS + UTM_STRIP_GUARD_TICK_MS)
    window.history.replaceState(null, '', TAGGED)
    vi.advanceTimersByTime(UTM_STRIP_GUARD_MS)
    expect(window.location.search).toContain('utm_campaign=c1')
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

  it('refuses a second strip of the very same landing URL', () => {
    // The re-entry guard, on its own: the landing URL is put back verbatim,
    // so the landing-URL guard would let a second `now()` through.
    const schedule = scheduleUtmStrip(window)
    schedule.now()
    window.history.replaceState(null, '', TAGGED)
    const replace = vi.spyOn(window.history, 'replaceState')
    schedule.now()
    expect(replace).toHaveBeenCalledTimes(0)
    expect(window.location.search).toContain('utm_campaign=c1')
  })

  it('never throws out of the SDK capture that triggered it', () => {
    // `now()` runs inside the SDK's `eventCaptured` emit, BEFORE the event
    // is queued; an exception there would lose the landing pageview.
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('too many calls', 'SecurityError')
    })
    const client = fakeClient()
    const schedule = scheduleUtmStrip(window)
    schedule.afterFirstPageview(client)
    expect(() => client.emit('$pageview')).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
    expect(client.listenerCount).toBe(0)
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
