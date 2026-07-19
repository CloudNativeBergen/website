/**
 * @vitest-environment jsdom
 *
 * Logic tests for the NotificationBell toast bridge. The bell mirrors a rising
 * unread count to the ephemeral toast system, but only for a GENUINE increase:
 * the first resolved value establishes a baseline (no toast on login/first
 * load), a decrease (mark-read) is silent, and while impersonating a speaker
 * the toast is suppressed entirely. These are asserted through the real
 * component with tRPC / session / toast provider mocked at their seams.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

// Mutable seams the tests drive before each (re)render.
let unreadState: { data: number | undefined; isSuccess: boolean } = {
  data: 0,
  isSuccess: true,
}
// The `notification.list` (limit 1) query the bell reads for the toast title.
let listState: { data: { title: string }[] | undefined } = { data: undefined }
let sessionState: { data: { isImpersonating?: boolean } | null } = {
  data: { isImpersonating: false },
}
const showNotification = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => sessionState,
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotificationSafe: () => ({
    showNotification,
    removeNotification: vi.fn(),
  }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    notification: {
      unreadCount: {
        useQuery: () => unreadState,
      },
      list: {
        useQuery: () => listState,
      },
    },
  },
}))

beforeEach(() => {
  unreadState = { data: 0, isSuccess: true }
  listState = { data: undefined }
  sessionState = { data: { isImpersonating: false } }
  showNotification.mockClear()
})

describe('NotificationBell — toast bridge', () => {
  it('does NOT toast on first load, even with unread notifications', () => {
    unreadState = { data: 5, isSuccess: true }
    render(<NotificationBell />)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does NOT toast until the first value has resolved (isSuccess false)', () => {
    unreadState = { data: undefined, isSuccess: false }
    const { rerender } = render(<NotificationBell />)
    // First RESOLVED value only establishes the baseline — still no toast.
    unreadState = { data: 3, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('toasts on a genuine increase, with a pluralized delta message', () => {
    unreadState = { data: 3, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 5, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        message: 'You have 2 new notifications.',
      }),
    )
  })

  it('uses the singular message for a delta of one', () => {
    unreadState = { data: 0, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 1, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You have 1 new notification.' }),
    )
  })

  it('does NOT toast on a decrease (e.g. marking notifications read)', () => {
    unreadState = { data: 5, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 2, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('suppresses the toast entirely while impersonating a speaker', () => {
    sessionState = { data: { isImpersonating: true } }
    unreadState = { data: 3, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 7, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('carries the newest notification title when one is available (V1l)', () => {
    listState = { data: [{ title: 'Direct message from Ola Organizer' }] }
    unreadState = { data: 0, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 1, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Direct message from Ola Organizer',
        message: 'You have 1 new notification.',
      }),
    )
  })

  it('falls back to the generic title when no newest title is available', () => {
    listState = { data: [] }
    unreadState = { data: 1, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 3, isSuccess: true }
    rerender(<NotificationBell />)
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'You have new notifications' }),
    )
  })
})
