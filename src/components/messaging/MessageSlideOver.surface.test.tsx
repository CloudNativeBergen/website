/**
 * @vitest-environment jsdom
 *
 * Two conversation readers, one query string.
 *
 * `MessageSlideOver` is mounted layout-wide by `AdminLayout` and opens on
 * `?messageId=`, so ANY admin page can pop a thread. `/admin/messages` is now
 * itself a conversation reader. Without a guard the two stack: the same thread
 * twice, two composers, two auto-mark-read passes. These tests pin that the
 * slide-over stays shut on the messages surface and nowhere else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = { pathname: '/admin/proposals', search: '' }
const push = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    message: {
      getConversation: { useQuery: () => ({ data: undefined }) },
    },
    proposal: { admin: { getById: { useQuery: () => ({ data: undefined }) } } },
  },
}))

vi.mock('./ConversationThread', () => ({
  ConversationThread: () => <div data-testid="slideover-thread" />,
}))

vi.mock('@/components/admin/ProposalPreview', () => ({
  ProposalPreview: () => <div />,
}))

import { MessageSlideOver, isMessagesSurface } from './MessageSlideOver'

afterEach(() => {
  cleanup()
  nav.pathname = '/admin/proposals'
  nav.search = ''
  push.mockClear()
  replace.mockClear()
})

describe('isMessagesSurface', () => {
  it('matches the messages surface and its conversation route', () => {
    expect(isMessagesSurface('/admin/messages')).toBe(true)
    expect(isMessagesSurface('/admin/messages/conversation.abc123')).toBe(true)
  })

  it('does not match a sibling route that merely shares the prefix', () => {
    expect(isMessagesSurface('/admin/messages-settings')).toBe(false)
    expect(isMessagesSurface('/admin/proposals')).toBe(false)
    expect(isMessagesSurface('/cfp/messages')).toBe(false)
    expect(isMessagesSurface(null)).toBe(false)
  })
})

describe('MessageSlideOver', () => {
  it('opens on another admin page (the surface it was built for)', () => {
    nav.pathname = '/admin/proposals'
    nav.search = 'messageId=conversation.abc123'
    render(<MessageSlideOver />)
    expect(screen.getByTestId('slideover-thread')).toBeInTheDocument()
  })

  it('stays shut on /admin/messages, where the page reads the thread itself', () => {
    nav.pathname = '/admin/messages'
    nav.search = 'messageId=conversation.abc123'
    render(<MessageSlideOver />)
    expect(screen.queryByTestId('slideover-thread')).toBeNull()
  })

  it('stays shut on /admin/messages/<id> too', () => {
    nav.pathname = '/admin/messages/conversation.abc123'
    nav.search = 'messageId=conversation.abc123'
    render(<MessageSlideOver />)
    expect(screen.queryByTestId('slideover-thread')).toBeNull()
  })

  it('renders nothing at all without a messageId', () => {
    nav.pathname = '/admin/proposals'
    render(<MessageSlideOver />)
    expect(screen.queryByTestId('slideover-thread')).toBeNull()
  })
})

/**
 * Closing must STAY closed. The open URL and the closed URL differ only by
 * `messageId`, so a `push` on close left the open URL as the previous history
 * entry: Back reopened the panel the organizer had just dismissed, and there
 * was no way back to the page they arrived from.
 */
describe('MessageSlideOver dismissal', () => {
  it('replaces the history entry rather than pushing a new one', () => {
    nav.pathname = '/admin/proposals'
    nav.search = 'tab=reviews&messageId=conversation.abc123'
    render(<MessageSlideOver />)

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

    expect(replace).toHaveBeenCalledWith('/admin/proposals?tab=reviews', {
      scroll: false,
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps the rest of the query string', () => {
    nav.pathname = '/admin/proposals'
    nav.search = 'messageId=conversation.abc123'
    render(<MessageSlideOver />)

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

    expect(replace).toHaveBeenCalledWith('/admin/proposals', { scroll: false })
  })

  it('stays shut once the URL it navigated to is applied', () => {
    nav.pathname = '/admin/proposals'
    nav.search = 'tab=reviews&messageId=conversation.abc123'
    const { rerender } = render(<MessageSlideOver />)
    expect(screen.getByTestId('slideover-thread')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

    // Apply the URL the COMPONENT asked for — not a hardcoded clean one, which
    // would make this pass even if `closeSlideOver` navigated nowhere. Then
    // re-render as the router would; nothing may put `messageId` back.
    const [target] = replace.mock.calls.at(-1) ?? []
    expect(typeof target).toBe('string')
    const [pathname, search = ''] = (target as string).split('?')
    nav.pathname = pathname
    nav.search = search
    rerender(<MessageSlideOver />)
    expect(screen.queryByTestId('slideover-thread')).toBeNull()
  })
})
