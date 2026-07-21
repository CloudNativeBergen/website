/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import type { Session } from 'next-auth'

let mockSession: Session | null = null
// Overridable so a test can simulate the iOS cold-open race where the session
// is still `loading` (data null) on first render before the cookie-backed
// session resolves.
let mockStatus: 'authenticated' | 'loading' | 'unauthenticated' | null = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mockSession,
    status: mockStatus ?? (mockSession ? 'authenticated' : 'unauthenticated'),
  }),
}))

let mockPathname = '/'
const routerPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: routerPush }),
}))

const markReadMutate = vi.fn()
const invalidateUnread = vi.fn()
const invalidateList = vi.fn()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      notification: {
        unreadCount: { invalidate: invalidateUnread },
        list: { invalidate: invalidateList },
      },
    }),
    notification: {
      markReadByLink: {
        useMutation: () => ({ mutate: markReadMutate }),
      },
    },
  },
}))

import { NotificationClickSync } from './NotificationClickSync'

/** A fresh EventTarget standing in for navigator.serviceWorker. */
function installServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  })
}

function postFromSW(data: unknown) {
  const event = new MessageEvent('message', { data })
  ;(navigator.serviceWorker as unknown as EventTarget).dispatchEvent(event)
}

// --- Fake Cache Storage for the pending-nav handoff -------------------------

const PENDING_NAV_KEY = '/__cndn_pending_notification'

/** Body JSON keyed by request key; models a single `cndn-pending-nav` cache. */
let pendingStore = new Map<string, string>()
const cacheDelete = vi.fn(async (key: string) => pendingStore.delete(key))

/** Install a minimal Cache Storage shim on the global. */
function installCaches() {
  const cache = {
    match: async (key: string) => {
      const body = pendingStore.get(key)
      if (body === undefined) return undefined
      return { json: async () => JSON.parse(body) }
    },
    delete: cacheDelete,
    put: async () => undefined,
  }
  Object.defineProperty(globalThis, 'caches', {
    value: { open: async () => cache },
    configurable: true,
    writable: true,
  })
}

/** Seed a pending-nav entry as the SW would have written it. */
function seedPendingNav(link: string, ts: number) {
  pendingStore.set(PENDING_NAV_KEY, JSON.stringify({ link, ts }))
}

function signedIn(): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { name: 'Jane' },
    speaker: { _id: 'sp-1', name: 'Jane', isOrganizer: false },
  } as unknown as Session
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSession = signedIn()
  mockStatus = null
  mockPathname = '/'
  pendingStore = new Map<string, string>()
  installServiceWorker()
  installCaches()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
})

describe('NotificationClickSync', () => {
  it('renders nothing', () => {
    const { container } = render(<NotificationClickSync />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks read by the clicked notification url on a notification-click message', () => {
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/1'] })
  })

  it('ignores messages that are not notification clicks', () => {
    render(<NotificationClickSync />)
    postFromSW({ type: 'SKIP_WAITING' })
    postFromSW({ type: 'notification-click' }) // missing url
    postFromSW('a raw string')
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('does not mark read on a warm click when definitively signed out', () => {
    mockSession = null
    mockStatus = 'unauthenticated'
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('marks read on a warm click while the session is still loading', () => {
    // Cookie-authed server-side, so a `loading` client must still mark read
    // (mirrors the iOS cold-open race).
    mockSession = null
    mockStatus = 'loading'
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/1'] })
  })

  // --- Cold-open mark-read via the `markread` query param (N1) --------------

  it('marks read from the markread param on mount and strips it', () => {
    // A cold open lands with the SW-appended param carrying the ORIGINAL link.
    mockPathname = '/cfp/proposal/1'
    window.history.replaceState(
      null,
      '',
      '/cfp/proposal/1?markread=%2Fcfp%2Fproposal%2F1&foo=bar',
    )
    render(<NotificationClickSync />)
    // Fires markReadByLink for the DECODED original link (not the current URL).
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/1'] })
    // Strips only the markread param, preserving other query + pathname.
    expect(window.location.search).toBe('?foo=bar')
    expect(window.location.pathname).toBe('/cfp/proposal/1')
  })

  it('does nothing when no markread param is present', () => {
    mockPathname = '/program'
    window.history.replaceState(null, '', '/program')
    render(<NotificationClickSync />)
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('strips but does not fire for a non-app-relative markread value', () => {
    mockPathname = '/program'
    window.history.replaceState(
      null,
      '',
      '/program?markread=https%3A%2F%2Fevil.com',
    )
    render(<NotificationClickSync />)
    expect(markReadMutate).not.toHaveBeenCalled()
    // The junk param is still removed so it can't linger.
    expect(window.location.search).toBe('')
  })

  it('does not fire the markread param when signed out, but still strips it', () => {
    mockSession = null
    mockPathname = '/cfp/proposal/1'
    window.history.replaceState(
      null,
      '',
      '/cfp/proposal/1?markread=%2Fcfp%2Fproposal%2F1',
    )
    render(<NotificationClickSync />)
    expect(markReadMutate).not.toHaveBeenCalled()
    // The param must be stripped even when signed out, so it can't linger and
    // re-fire on a later authenticated reload/share.
    expect(window.location.search).not.toContain('markread')
  })

  // --- Warm navigation via the notification-click postMessage ---------------

  it('navigates and clears the pending-nav cache on a warm notification-click', async () => {
    mockPathname = '/'
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/2' })
    // Marks read AND drives the deep-link navigation itself (iOS ignores the
    // SW's own navigate()).
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/2'] })
    expect(routerPush).toHaveBeenCalledWith('/cfp/proposal/2')
    // The warm tab handled it, so the cold-open handoff must be cleared.
    await waitFor(() =>
      expect(cacheDelete).toHaveBeenCalledWith(PENDING_NAV_KEY),
    )
  })

  it('does not navigate on a warm click already on the target page', () => {
    mockPathname = '/cfp/proposal/2'
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/2' })
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/2'] })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('a BACKGROUND tab marks read but does NOT navigate or clear the handoff', () => {
    // The SW broadcasts to every window; a background tab must not hijack-
    // navigate nor delete the cold-open handoff (the launched window needs it).
    const restore = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'visibilityState',
    )
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    try {
      mockPathname = '/'
      render(<NotificationClickSync />)
      postFromSW({ type: 'notification-click', url: '/cfp/proposal/2' })
      expect(markReadMutate).toHaveBeenCalledWith({
        links: ['/cfp/proposal/2'],
      })
      expect(routerPush).not.toHaveBeenCalled()
      expect(cacheDelete).not.toHaveBeenCalled()
    } finally {
      if (restore) Object.defineProperty(document, 'visibilityState', restore)
    }
  })

  // --- Cold-open consumer of the Cache-API pending-nav handoff ---------------

  it('consumes a fresh pending entry on mount: navigates, marks read, deletes it', async () => {
    mockPathname = '/'
    seedPendingNav('/cfp/proposal/9', Date.now())
    render(<NotificationClickSync />)
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/cfp/proposal/9'),
    )
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/9'] })
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
  })

  it('deletes a stale pending entry without navigating', async () => {
    mockPathname = '/'
    // Older than the 5-minute freshness window.
    seedPendingNav('/cfp/proposal/9', Date.now() - 6 * 60 * 1000)
    render(<NotificationClickSync />)
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
    expect(routerPush).not.toHaveBeenCalled()
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('marks read but does not navigate when the pending entry is the current page', async () => {
    mockPathname = '/cfp/proposal/9'
    window.history.replaceState(null, '', '/cfp/proposal/9')
    seedPendingNav('/cfp/proposal/9', Date.now())
    render(<NotificationClickSync />)
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
    // Redundant navigation is suppressed, but the notification must STILL be
    // marked read (the user is looking at the resource).
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/9'] })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('clears a pending entry when signed out but fires no mutation', async () => {
    mockSession = null
    mockStatus = 'unauthenticated'
    mockPathname = '/'
    seedPendingNav('/cfp/proposal/9', Date.now())
    render(<NotificationClickSync />)
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('still marks read on cold open while the session is loading (iOS race)', async () => {
    // The deep-link page seeded `undefined` (auth() read falsy under
    // cacheComponents), so useSession is `loading`/null on first render even
    // though the request carries a valid auth cookie. The mark-read must still
    // fire — the mutation authenticates via the cookie server-side.
    mockSession = null
    mockStatus = 'loading'
    mockPathname = '/'
    seedPendingNav('/cfp/proposal/9', Date.now())
    render(<NotificationClickSync />)
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/cfp/proposal/9'),
    )
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/9'] })
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
  })

  it('does not navigate for a non-app-relative pending link, but deletes it', async () => {
    mockPathname = '/'
    seedPendingNav('https://evil.com', Date.now())
    render(<NotificationClickSync />)
    await waitFor(() => expect(pendingStore.has(PENDING_NAV_KEY)).toBe(false))
    expect(routerPush).not.toHaveBeenCalled()
    expect(markReadMutate).not.toHaveBeenCalled()
  })
})
