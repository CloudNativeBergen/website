/**
 * @vitest-environment jsdom
 *
 * Logic tests for the NotificationBell toast bridge. The bell mirrors a rising
 * unread count to the ephemeral toast system, but only for a GENUINE increase:
 * the first resolved value establishes a baseline (no toast on login/first
 * load), a decrease (mark-read) is silent, and while impersonating a speaker
 * the toast is suppressed entirely. These are asserted through the real
 * component with tRPC / session / toast provider mocked at their seams.
 *
 * The newest-notification title the toast wears is fetched ONCE, on the rise
 * itself — see `NotificationBell.poll-cost.test.tsx` for the cost contract that
 * says it must never become a second polled query.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

// Mutable seams the tests drive before each (re)render.
let unreadState: { data: number | undefined; isSuccess: boolean } = {
  data: 0,
  isSuccess: true,
}
// What the one-shot `notification.list` fetch resolves to on a rise.
let latestRows: { title: string }[] = []
let sessionState: { data: { isImpersonating?: boolean } | null } = {
  data: { isImpersonating: false },
}
const showNotification = vi.fn()
const listFetch = vi.fn(async () => latestRows)

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
    useUtils: () => ({ notification: { list: { fetch: listFetch } } }),
    notification: {
      unreadCount: {
        useQuery: () => unreadState,
      },
    },
  },
}))

beforeEach(() => {
  unreadState = { data: 0, isSuccess: true }
  latestRows = []
  sessionState = { data: { isImpersonating: false } }
  showNotification.mockClear()
  listFetch.mockClear()
})

describe('NotificationBell — toast bridge', () => {
  it('does NOT toast on first load, even with unread notifications', async () => {
    unreadState = { data: 5, isSuccess: true }
    render(<NotificationBell />)
    await Promise.resolve()
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('does NOT toast until the first value has resolved (isSuccess false)', async () => {
    unreadState = { data: undefined, isSuccess: false }
    const { rerender } = render(<NotificationBell />)
    // First RESOLVED value only establishes the baseline — still no toast.
    unreadState = { data: 3, isSuccess: true }
    rerender(<NotificationBell />)
    await Promise.resolve()
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('toasts on a genuine increase, with a pluralized delta message', async () => {
    unreadState = { data: 3, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 5, isSuccess: true }
    rerender(<NotificationBell />)
    await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1))
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        message: 'You have 2 new notifications.',
      }),
    )
  })

  it('uses the singular message for a delta of one', async () => {
    unreadState = { data: 0, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 1, isSuccess: true }
    rerender(<NotificationBell />)
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'You have 1 new notification.' }),
      ),
    )
  })

  it('does NOT toast on a decrease (e.g. marking notifications read)', async () => {
    unreadState = { data: 5, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 2, isSuccess: true }
    rerender(<NotificationBell />)
    await Promise.resolve()
    expect(showNotification).not.toHaveBeenCalled()
    // …and it does not pay for the title lookup either.
    expect(listFetch).not.toHaveBeenCalled()
  })

  it('suppresses the toast entirely while impersonating a speaker', async () => {
    sessionState = { data: { isImpersonating: true } }
    unreadState = { data: 3, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 7, isSuccess: true }
    rerender(<NotificationBell />)
    await Promise.resolve()
    expect(showNotification).not.toHaveBeenCalled()
    expect(listFetch).not.toHaveBeenCalled()
  })

  it('carries the newest notification title when one is available (V1l)', async () => {
    latestRows = [{ title: 'Direct message from Ola Organizer' }]
    unreadState = { data: 0, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 1, isSuccess: true }
    rerender(<NotificationBell />)
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Direct message from Ola Organizer',
          message: 'You have 1 new notification.',
        }),
      ),
    )
    // Read at the moment of the rise, and only then.
    expect(listFetch).toHaveBeenCalledTimes(1)
    expect(listFetch).toHaveBeenCalledWith({ limit: 1 })
  })

  it('falls back to the generic title when no newest title is available', async () => {
    latestRows = []
    unreadState = { data: 1, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 3, isSuccess: true }
    rerender(<NotificationBell />)
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'You have new notifications' }),
      ),
    )
  })

  it('still toasts (generically) when the title lookup fails', async () => {
    listFetch.mockRejectedValueOnce(new Error('offline'))
    unreadState = { data: 1, isSuccess: true }
    const { rerender } = render(<NotificationBell />)
    unreadState = { data: 2, isSuccess: true }
    rerender(<NotificationBell />)
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'You have new notifications',
          message: 'You have 1 new notification.',
        }),
      ),
    )
  })
})
