/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { Session } from 'next-auth'

let mockSession: Session | null = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mockSession,
    status: mockSession ? 'authenticated' : 'unauthenticated',
  }),
}))

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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
  mockPathname = '/'
  installServiceWorker()
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

  it('does not register / fire when signed out', () => {
    mockSession = null
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).not.toHaveBeenCalled()
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
})
