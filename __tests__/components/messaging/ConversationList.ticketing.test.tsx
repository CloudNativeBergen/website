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

describe('ConversationList — speaker rows only get the closed chip', () => {
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
    // Speaker copy for a resolved thread reads "Closed by organizers" (V1h).
    expect(screen.getByText('Closed by organizers')).toBeInTheDocument()
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Needs reply')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/assigned to/i)).not.toBeInTheDocument()
  })
})

describe('ConversationList — Archived view Unarchive (T2d / V1-r1)', () => {
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
    fireEvent.click(button)
    // The handler fired; the button is a SIBLING of the row link (V1-r1), so a
    // click never reaches the link — no preventDefault gymnastics required.
    expect(onUnarchive).toHaveBeenCalledTimes(1)
    expect(onUnarchive.mock.calls[0][0]._id).toBe('conversation.gen-1')

    // Without onUnarchive the button is absent (non-archived views).
    rerender(
      <ConversationList isOrganizer items={[item({ archived: true })]} />,
    )
    expect(
      screen.queryByRole('button', { name: /unarchive/i }),
    ).not.toBeInTheDocument()
  })

  it('renders the Unarchive action OUTSIDE the row Link (valid HTML, V1-r1)', () => {
    render(
      <ConversationList
        isOrganizer
        items={[item({ archived: true })]}
        onUnarchive={vi.fn()}
      />,
    )
    // The row is still a link to the admin thread, but the Unarchive button is a
    // sibling overlay — a <button> nested inside an <a> is invalid HTML.
    const row = screen.getByRole('link')
    expect(
      within(row).queryByRole('button', { name: /unarchive/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /unarchive/i }),
    ).toBeInTheDocument()
  })

  it('keeps a sane keyboard focus order after the row restructure (V1-r2)', () => {
    const { container } = render(
      <ConversationList
        isOrganizer
        items={[
          item({ _id: 'c1', archived: true }),
          item({ _id: 'c2', archived: true }),
        ]}
        onUnarchive={vi.fn()}
      />,
    )
    // Tab order follows DOM order: each row's link, then its Unarchive action,
    // then the next row's link — the action is a later sibling of its own link,
    // never interleaved with another row's controls.
    const focusables = Array.from(
      container.querySelectorAll('a, button'),
    ) as HTMLElement[]
    const kinds = focusables.map((el) =>
      el.tagName === 'A' ? 'link' : 'unarchive',
    )
    expect(kinds).toEqual(['link', 'unarchive', 'link', 'unarchive'])
  })
})
