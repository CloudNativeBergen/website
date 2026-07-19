/**
 * @vitest-environment jsdom
 *
 * Row-metadata tests for the T2b ConversationList additions:
 * - ORGANIZER rows: needs-reply amber dot, Resolved chip, assignee avatar;
 * - SPEAKER rows: ONLY the Resolved chip (no needs-reply, no assignee);
 * - the Archived-view Unarchive button acts without navigating (T2d).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react'
import { ConversationList } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'

afterEach(cleanup)

function item(
  overrides: Partial<ConversationListItem> = {},
): ConversationListItem {
  return {
    _id: 'conversation.gen-1',
    conversationType: 'general',
    subject: 'Travel question',
    createdAt: '2026-01-01T00:00:00Z',
    lastMessageAt: '2026-02-01T00:00:00Z',
    unreadCount: 0,
    lastMessage: { authorId: 'sp-1', authorName: 'Kari', excerpt: 'hello' },
    counterpart: { name: 'Kari Nordmann' },
    status: 'open',
    needsReply: false,
    assignedTo: null,
    archived: false,
    ...overrides,
  }
}

describe('ConversationList — organizer row metadata (T2b)', () => {
  it('shows the needs-reply dot, Resolved chip and assignee avatar for organizers', () => {
    render(
      <ConversationList
        isOrganizer
        items={[
          item({
            _id: 'c1',
            needsReply: true,
            assignedTo: { _id: 'org-1', name: 'Ola Organizer' },
          }),
          item({ _id: 'c2', status: 'resolved' }),
        ]}
      />,
    )
    expect(screen.getByLabelText('Needs reply')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    // Assignee avatar carries an accessible label + the initial.
    const assignee = screen.getByLabelText('Assigned to Ola Organizer')
    expect(assignee).toHaveTextContent('O')
  })
})

describe('ConversationList — speaker rows only get the Resolved chip', () => {
  it('never renders needs-reply or the assignee for a speaker', () => {
    render(
      <ConversationList
        isOrganizer={false}
        items={[
          item({
            status: 'resolved',
            needsReply: true, // must be IGNORED for a speaker
            assignedTo: { _id: 'org-1', name: 'Ola Organizer' },
          }),
        ]}
      />,
    )
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByLabelText('Needs reply')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/assigned to/i)).not.toBeInTheDocument()
  })
})

describe('ConversationList — Archived view Unarchive (T2d)', () => {
  it('calls onUnarchive without navigating and only when provided', () => {
    const onUnarchive = vi.fn()
    const { rerender } = render(
      <ConversationList
        isOrganizer
        items={[item({ archived: true })]}
        onUnarchive={onUnarchive}
      />,
    )
    const button = screen.getByRole('button', { name: /unarchive/i })
    const clickEvent = fireEvent.click(button)
    // The handler fired and the click was prevented (so the row Link never
    // navigates out from under the action).
    expect(onUnarchive).toHaveBeenCalledTimes(1)
    expect(onUnarchive.mock.calls[0][0]._id).toBe('conversation.gen-1')
    expect(clickEvent).toBe(false) // preventDefault() → dispatchEvent returns false

    // Without onUnarchive the button is absent (non-archived views).
    rerender(
      <ConversationList isOrganizer items={[item({ archived: true })]} />,
    )
    expect(
      screen.queryByRole('button', { name: /unarchive/i }),
    ).not.toBeInTheDocument()
  })

  it('renders a row Link that would otherwise navigate', () => {
    render(
      <ConversationList
        isOrganizer
        items={[item({ archived: true })]}
        onUnarchive={vi.fn()}
      />,
    )
    // The row is still a link to the admin thread; the Unarchive button lives
    // inside it but stops propagation.
    const row = screen.getByRole('link')
    expect(
      within(row).getByRole('button', { name: /unarchive/i }),
    ).toBeInTheDocument()
  })
})
