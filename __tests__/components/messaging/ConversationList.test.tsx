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
    lastMessage: {
      authorId: 'speaker-me',
      authorName: 'Kari Nordmann',
      excerpt: 'I have updated the abstract.',
    },
    counterpart: { name: 'Kari Nordmann' },
  },
  {
    _id: 'conversation.abc123',
    conversationType: 'general',
    subject: 'Travel question',
    createdAt: new Date('2026-07-15T10:00:00Z').toISOString(),
    lastMessageAt: new Date('2026-07-18T09:00:00Z').toISOString(),
    unreadCount: 0,
    lastMessage: {
      authorId: 'organizer-1',
      authorName: 'Ola Organizer',
      excerpt: 'We cover flights booked before June.',
    },
    counterpart: { name: 'Ola Organizer' },
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

  // --- Who/What/When metadata (M6) ---

  it('renders the counterpart name and the last-message snippet per row', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument()
    expect(screen.getByText('Ola Organizer')).toBeInTheDocument()
    expect(screen.getByText(/updated the abstract/)).toBeInTheDocument()
    expect(screen.getByText(/flights booked before June/)).toBeInTheDocument()
  })

  it('prefixes the snippet with "You:" only on rows whose last message the caller wrote', () => {
    render(
      <ConversationList
        items={items}
        isOrganizer={false}
        callerId="speaker-me"
      />,
    )
    // Row 1's last message is the caller's; row 2's is not.
    const row1 = linkFor('Scaling Kubernetes')
    const row2 = linkFor('Travel question')
    expect(row1).toHaveTextContent('You:')
    expect(row2?.textContent).not.toContain('You:')
  })

  it('shows no "You:" prefix at all without a callerId', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(screen.queryByText('You:')).not.toBeInTheDocument()
  })

  it('marks proposal threads with a "Proposal" chip and leaves general threads unmarked', () => {
    render(<ConversationList items={items} isOrganizer={false} />)
    expect(screen.getAllByText('Proposal')).toHaveLength(1)
    expect(linkFor('Scaling Kubernetes')).toHaveTextContent('Proposal')
    expect(linkFor('Travel question')?.textContent).not.toContain('Proposal')
  })

  it('renders a row without a snippet line when the conversation has no messages', () => {
    const empty: ConversationListItem[] = [
      { ...items[1], lastMessage: null, counterpart: { name: 'Organizers' } },
    ]
    render(<ConversationList items={empty} isOrganizer={false} />)
    expect(screen.getByText('Travel question')).toBeInTheDocument()
    expect(screen.queryByText(/flights booked/)).not.toBeInTheDocument()
  })
})
