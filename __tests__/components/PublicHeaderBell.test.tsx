/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Session } from 'next-auth'

// Mutable session the mocked `useSession()` returns; each test sets it.
let mockSession: Session | null = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mockSession,
    status: mockSession ? 'authenticated' : 'unauthenticated',
  }),
}))

// Stub the bell so the gate can be tested without a tRPC/QueryClient provider.
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}))

import { PublicHeaderBell } from '@/components/PublicHeaderBell'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  mockSession = null
})

describe('PublicHeaderBell', () => {
  it('renders nothing when signed out', () => {
    mockSession = null
    const { container } = render(<PublicHeaderBell />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('notification-bell')).toBeNull()
  })

  it('renders nothing when a session exists but has no speaker', () => {
    // e.g. a session mid-onboarding without a speaker profile yet.
    mockSession = {
      expires: new Date(Date.now() + 60_000).toISOString(),
      user: { name: 'No Speaker' },
      // no `speaker`
    } as unknown as Session
    const { container } = render(<PublicHeaderBell />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the bell for a signed-in speaker', () => {
    mockSession = {
      expires: new Date(Date.now() + 60_000).toISOString(),
      user: { name: 'Jane Doe' },
      speaker: { _id: 'spk-1', name: 'Jane Doe', isOrganizer: false },
    } as unknown as Session
    render(<PublicHeaderBell />)
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument()
  })
})
