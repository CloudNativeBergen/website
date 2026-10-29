/**
 * @vitest-environment jsdom
 *
 * What a click on a notification does besides navigating. A Session
 * Feedback flag links to /admin/feedback, often the page already open, where
 * the link alone reads nothing: the click must read the box and the nav
 * badge again (speaker feedback spec §10.1, §11.2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NotificationItem } from '@/lib/notification/types'

const h = vi.hoisted(() => ({
  items: [] as NotificationItem[],
  invalidate: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    adminOverview: vi.fn(),
    flaggedCount: vi.fn(),
  },
  markRead: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { speaker: { _id: 'sp-org', isOrganizer: true } },
    status: 'authenticated',
  }),
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
  }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      notification: {
        unreadCount: { invalidate: h.invalidate.unreadCount },
        list: { invalidate: h.invalidate.list },
      },
      sessionFeedback: {
        adminOverview: { invalidate: h.invalidate.adminOverview },
        flaggedCount: { invalidate: h.invalidate.flaggedCount },
      },
    }),
    notification: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [h.items] },
          isLoading: false,
          isError: false,
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: vi.fn(),
        }),
      },
      markRead: { useMutation: () => ({ mutate: h.markRead }) },
      markAllRead: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}))

import { NotificationPanel } from './NotificationPanel'

const item = (type: NotificationItem['type'], title: string) => ({
  id: `n-${type}`,
  type,
  title,
  link: '/admin/feedback',
  readAt: null,
  createdAt: '2026-10-27T10:00:00.000Z',
})

afterEach(() => {
  cleanup()
  for (const fn of Object.values(h.invalidate)) fn.mockClear()
})

describe('NotificationPanel — a click on a flag notification', () => {
  it('reads the flagged box and the nav badge again', () => {
    h.items = [item('session_feedback_flagged', 'A comment was flagged')]
    render(<NotificationPanel unreadCount={1} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('A comment was flagged'))
    expect(h.invalidate.adminOverview).toHaveBeenCalledTimes(1)
    expect(h.invalidate.flaggedCount).toHaveBeenCalledTimes(1)
  })

  it('another type reads neither', () => {
    h.items = [item('proposal_submitted', 'New proposal')]
    render(<NotificationPanel unreadCount={1} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('New proposal'))
    expect(h.invalidate.adminOverview).not.toHaveBeenCalled()
    expect(h.invalidate.flaggedCount).not.toHaveBeenCalled()
  })
})
