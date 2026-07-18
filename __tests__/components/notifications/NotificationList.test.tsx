/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationList } from '@/components/notifications/NotificationList'
import type { NotificationItem } from '@/lib/notification/types'

const baseItems: NotificationItem[] = [
  {
    id: '1',
    type: 'proposal_status_changed',
    title: 'Accepted',
    message: 'Your talk was accepted',
    link: '/cfp/proposal/1',
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    actor: { _id: 'a', name: 'Committee' },
  },
  {
    id: '2',
    type: 'system',
    title: 'Read one',
    readAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    actor: null,
  },
]

function renderList(
  props: Partial<React.ComponentProps<typeof NotificationList>> = {},
) {
  return render(
    <NotificationList
      items={baseItems}
      unreadCount={1}
      onMarkAllRead={vi.fn()}
      onItemClick={vi.fn()}
      {...props}
    />,
  )
}

describe('NotificationList', () => {
  it('renders each item title', () => {
    renderList()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('Read one')).toBeInTheDocument()
  })

  it('renders an unread indicator dot for unread items only', () => {
    const { container } = renderList()
    const dots = container.querySelectorAll('.bg-brand-cloud-blue')
    // One unread item -> exactly one blue dot.
    expect(dots).toHaveLength(1)
  })

  it('links notifications that have a link', () => {
    renderList()
    const link = screen.getByText('Accepted').closest('a')
    expect(link).toHaveAttribute('href', '/cfp/proposal/1')
  })

  it('fires onItemClick when an item is activated', () => {
    const onItemClick = vi.fn()
    renderList({ onItemClick })
    fireEvent.click(screen.getByText('Accepted'))
    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1' }),
    )
  })

  it('enables "Mark all read" when there are unread items', () => {
    renderList({ unreadCount: 3 })
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled()
  })

  it('disables "Mark all read" when unreadCount is 0', () => {
    renderList({ unreadCount: 0 })
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('calls onMarkAllRead when the button is pressed', () => {
    const onMarkAllRead = vi.fn()
    renderList({ unreadCount: 2, onMarkAllRead })
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(onMarkAllRead).toHaveBeenCalledOnce()
  })

  it('shows the empty state when there are no items', () => {
    renderList({ items: [], unreadCount: 0 })
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('shows skeleton rows while loading', () => {
    const { container } = renderList({ items: [], isLoading: true })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0,
    )
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('shows a distinct error state on load failure (never "all caught up")', () => {
    renderList({ items: [], isError: true, unreadCount: 0 })
    expect(screen.getByRole('alert')).toHaveTextContent(
      /couldn.t load notifications/i,
    )
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('exposes the inbox as a named region landmark', () => {
    renderList({ unreadCount: 2 })
    expect(
      screen.getByRole('region', { name: 'Notifications' }),
    ).toBeInTheDocument()
  })

  it('does not render "Show more" when hasMore is false', () => {
    renderList({ hasMore: false })
    expect(
      screen.queryByRole('button', { name: /show more/i }),
    ).not.toBeInTheDocument()
  })

  it('renders "Show more" and fires onShowMore when hasMore is true', () => {
    const onShowMore = vi.fn()
    renderList({ hasMore: true, onShowMore })
    const button = screen.getByRole('button', { name: /show more/i })
    fireEvent.click(button)
    expect(onShowMore).toHaveBeenCalledOnce()
  })

  it('shows a loading label and disables "Show more" while loading the next page', () => {
    renderList({ hasMore: true, isLoadingMore: true })
    const button = screen.getByRole('button', { name: /loading/i })
    expect(button).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /^show more$/i }),
    ).not.toBeInTheDocument()
  })

  it('hides "Mark all read" and shows a read-only hint in read-only mode', () => {
    renderList({ readOnly: true, unreadCount: 3 })
    expect(
      screen.queryByRole('button', { name: 'Mark all read' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
  })
})
