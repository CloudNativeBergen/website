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

// The badge query returns whatever `mockCount` is at render time.
let mockCount: number | undefined = 0
vi.mock('@/lib/trpc/client', () => ({
  api: {
    notification: {
      unreadCount: { useQuery: () => ({ data: mockCount }) },
    },
  },
}))

import { AppBadgeSync } from './AppBadgeSync'

const setAppBadge = vi.fn().mockResolvedValue(undefined)
const clearAppBadge = vi.fn().mockResolvedValue(undefined)

function installBadgingApi() {
  Object.defineProperty(navigator, 'setAppBadge', {
    value: setAppBadge,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(navigator, 'clearAppBadge', {
    value: clearAppBadge,
    configurable: true,
    writable: true,
  })
}

function uninstallBadgingApi() {
  // @ts-expect-error — deleting the optional test shims.
  delete navigator.setAppBadge
  // @ts-expect-error — deleting the optional test shims.
  delete navigator.clearAppBadge
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
  mockSession = null
  mockCount = 0
  installBadgingApi()
})

afterEach(() => {
  cleanup()
  uninstallBadgingApi()
})

describe('AppBadgeSync', () => {
  it('renders nothing', () => {
    const { container } = render(<AppBadgeSync />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sets the badge to the unread count when signed in with unread > 0', () => {
    mockSession = signedIn()
    mockCount = 3
    render(<AppBadgeSync />)
    expect(setAppBadge).toHaveBeenCalledWith(3)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge when signed in with zero unread', () => {
    mockSession = signedIn()
    mockCount = 0
    render(<AppBadgeSync />)
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge when signed out (regardless of any stale count)', () => {
    mockSession = null
    mockCount = 5
    render(<AppBadgeSync />)
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('is a no-op when the Badging API is unsupported (feature-detect)', () => {
    uninstallBadgingApi()
    mockSession = signedIn()
    mockCount = 4
    expect(() => render(<AppBadgeSync />)).not.toThrow()
    expect(setAppBadge).not.toHaveBeenCalled()
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('does not throw when setAppBadge rejects (reject-safe)', () => {
    setAppBadge.mockRejectedValueOnce(new Error('not allowed'))
    mockSession = signedIn()
    mockCount = 2
    expect(() => render(<AppBadgeSync />)).not.toThrow()
    expect(setAppBadge).toHaveBeenCalledWith(2)
  })

  it('clears the badge on unmount', () => {
    mockSession = signedIn()
    mockCount = 1
    const { unmount } = render(<AppBadgeSync />)
    clearAppBadge.mockClear()
    unmount()
    expect(clearAppBadge).toHaveBeenCalled()
  })
})
