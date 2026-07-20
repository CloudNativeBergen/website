/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NotificationList } from './NotificationList'
import type { NotificationItem } from '@/lib/notification/types'

afterEach(cleanup)

const linked: NotificationItem = {
  id: 'linked',
  type: 'proposal_status_changed',
  title: 'Your proposal was accepted',
  message: 'Congratulations!',
  link: '/cfp/proposal/1',
  readAt: null,
  createdAt: new Date().toISOString(),
  actor: null,
}

const linkless: NotificationItem = {
  id: 'linkless',
  type: 'system',
  title: 'Test notification',
  message: 'Your push, hub, and badge are working.',
  readAt: null,
  createdAt: new Date().toISOString(),
  actor: null,
}

function renderList(
  props: Partial<React.ComponentProps<typeof NotificationList>>,
) {
  return render(
    <NotificationList
      items={[]}
      unreadCount={0}
      onMarkAllRead={vi.fn()}
      onItemClick={vi.fn()}
      {...props}
    />,
  )
}

describe('NotificationList row linking', () => {
  it('renders a linked notification as a Link to its deep link', () => {
    renderList({ items: [linked] })
    const row = screen.getByRole('link', { name: /accepted/i })
    expect(row).toHaveAttribute('href', '/cfp/proposal/1')
  })

  it('renders a linkless notification as an inert button when no linklessHref is given', () => {
    renderList({ items: [linkless] })
    // Readable inline (e.g. on the standalone page): a button, not a link.
    expect(
      screen.getByRole('button', { name: /test notification/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /test notification/i }),
    ).not.toBeInTheDocument()
  })

  it('routes a linkless notification to linklessHref when provided (the popover case)', () => {
    renderList({ items: [linkless], linklessHref: '/notifications' })
    const row = screen.getByRole('link', { name: /test notification/i })
    expect(row).toHaveAttribute('href', '/notifications')
  })

  it('fires onItemClick when a linkless row is activated', () => {
    const onItemClick = vi.fn()
    renderList({ items: [linkless], onItemClick })
    fireEvent.click(screen.getByRole('button', { name: /test notification/i }))
    expect(onItemClick).toHaveBeenCalledWith(linkless)
  })
})

describe('NotificationList footer', () => {
  it('renders a "View all notifications" link when viewAllHref is set', () => {
    renderList({ items: [linked], viewAllHref: '/notifications' })
    expect(
      screen.getByRole('link', { name: /view all notifications/i }),
    ).toHaveAttribute('href', '/notifications')
  })

  it('omits the "View all notifications" link when viewAllHref is absent', () => {
    renderList({ items: [linked] })
    expect(
      screen.queryByRole('link', { name: /view all notifications/i }),
    ).not.toBeInTheDocument()
  })
})
