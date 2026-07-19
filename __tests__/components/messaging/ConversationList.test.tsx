/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConversationList } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'

const items: ConversationListItem[] = [
  {
    _id: 'conversation.proposal.talk-1',
    conversationType: 'proposal',
    subject: 'Scaling Kubernetes',
    proposalId: 'talk-1',
    proposalTitle: 'Scaling Kubernetes',
    createdAt: new Date('2026-07-15T10:00:00Z').toISOString(),
    lastMessageAt: new Date('2026-07-18T10:00:00Z').toISOString(),
    unreadCount: 0,
  },
  {
    _id: 'conversation.abc123',
    conversationType: 'general',
    subject: 'Travel question',
    createdAt: new Date('2026-07-15T10:00:00Z').toISOString(),
    lastMessageAt: new Date('2026-07-18T09:00:00Z').toISOString(),
    unreadCount: 0,
  },
]

function linkFor(title: string): HTMLAnchorElement | null {
  return screen.getByText(title).closest('a')
}

describe('ConversationList', () => {
  it('links to the speaker (cfp) surfaces for a speaker audience', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    // Proposal thread → the proposal page anchor.
    expect(linkFor('Scaling Kubernetes')).toHaveAttribute(
      'href',
      '/cfp/proposal/talk-1#messages',
    )
    // General thread → the standalone speaker thread route.
    expect(linkFor('Travel question')).toHaveAttribute(
      'href',
      '/cfp/messages/conversation.abc123',
    )
  })

  it('links to the organizer (admin) surfaces for an organizer audience', () => {
    render(<ConversationList items={items} isOrganizer={true} />)
    expect(linkFor('Scaling Kubernetes')).toHaveAttribute(
      'href',
      '/admin/proposals/talk-1#messages',
    )
    expect(linkFor('Travel question')).toHaveAttribute(
      'href',
      '/admin/messages/conversation.abc123',
    )
  })

  it('renders the empty state when there are no conversations', () => {
    render(<ConversationList items={[]} isOrganizer={false} />)
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument()
  })

  it('exposes the inbox as a named region landmark', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(
      screen.getByRole('region', { name: 'Conversations' }),
    ).toBeInTheDocument()
  })

  it('hides the unread pill when a conversation has no unread messages', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(screen.queryByLabelText(/unread/i)).not.toBeInTheDocument()
  })

  it('renders a blue unread pill and bolds the subject when unread', () => {
    const unread: ConversationListItem[] = [{ ...items[0], unreadCount: 3 }]
    render(<ConversationList items={unread} isOrganizer={false} />)
    const pill = screen.getByLabelText('3 unread')
    expect(pill).toHaveTextContent('3')
    // Subject is bolded for an unread row.
    expect(screen.getByText('Scaling Kubernetes')).toHaveClass('font-bold')
  })

  it('caps the unread pill at 9+', () => {
    const unread: ConversationListItem[] = [{ ...items[0], unreadCount: 25 }]
    render(<ConversationList items={unread} isOrganizer={false} />)
    expect(screen.getByLabelText('25 unread')).toHaveTextContent('9+')
  })

  it('keeps a read row subject at semibold (not bold)', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(screen.getByText('Scaling Kubernetes')).toHaveClass('font-semibold')
  })
})
