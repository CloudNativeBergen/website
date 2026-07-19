/**
 * @vitest-environment jsdom
 *
 * Container tests for NotificationPanel — specifically the session-hydration
 * guard: `messagesHref`/`settingsHref` are audience-derived, so while the
 * session is still resolving NEITHER may render (an organizer would otherwise
 * briefly get, and could click, the speaker link).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationPanel } from '@/components/notifications/NotificationPanel'

// Mutable session state the tests set before rendering.
let sessionState: { data: unknown; status: string } = {
  data: undefined,
  status: 'loading',
}

vi.mock('next-auth/react', () => ({
  useSession: () => sessionState,
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      notification: {
        unreadCount: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    notification: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [[]] },
          isLoading: false,
          isError: false,
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
        }),
      },
      markRead: { useMutation: () => ({ mutate: vi.fn() }) },
      markAllRead: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}))

function renderPanel() {
  return render(<NotificationPanel unreadCount={0} onClose={vi.fn()} />)
}

beforeEach(() => {
  sessionState = { data: undefined, status: 'loading' }
})

describe('NotificationPanel — session-derived quick links', () => {
  it('renders NEITHER the messages link nor the settings gear while the session is loading', () => {
    renderPanel()
    expect(
      screen.queryByRole('link', { name: /view all messages/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Notification settings' }),
    ).not.toBeInTheDocument()
  })

  it('renders the speaker messages link and the settings gear once the session resolves', () => {
    sessionState = {
      data: { speaker: { _id: 'sp-1', isOrganizer: false } },
      status: 'authenticated',
    }
    renderPanel()
    expect(
      screen.getByRole('link', { name: /view all messages/i }),
    ).toHaveAttribute('href', '/cfp/messages')
    expect(
      screen.getByRole('link', { name: 'Notification settings' }),
    ).toHaveAttribute('href', '/cfp/profile#notification-settings')
  })

  it('routes an organizer to the admin inbox (same profile settings anchor)', () => {
    sessionState = {
      data: { speaker: { _id: 'org-1', isOrganizer: true } },
      status: 'authenticated',
    }
    renderPanel()
    expect(
      screen.getByRole('link', { name: /view all messages/i }),
    ).toHaveAttribute('href', '/admin/messages')
    expect(
      screen.getByRole('link', { name: 'Notification settings' }),
    ).toHaveAttribute('href', '/cfp/profile#notification-settings')
  })
})
