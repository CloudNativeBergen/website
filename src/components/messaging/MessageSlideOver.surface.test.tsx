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
import { cleanup, render, screen } from '@testing-library/react'

const nav = { pathname: '/admin/proposals', search: '' }

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
