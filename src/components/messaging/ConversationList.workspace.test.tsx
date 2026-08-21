/**
 * @vitest-environment jsdom
 *
 * The list pane of the three-pane messages surface.
 *
 * The row DESTINATION is the whole point of Hans's requirement: an organizer
 * reading ANY conversation — proposal-attached ones included — must stay on
 * `/admin/messages`. The default (`conversationLinkPath`) sends a proposal
 * thread OUT to `/admin/proposals/<id>#messages`, so these tests pin both
 * behaviours: the default is untouched for every other caller, and the
 * workspace's override keeps every row on the messages surface.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ConversationList } from './ConversationList'
import { messagesPaneHref } from '@/lib/messaging/panes'
import type { ConversationListItem } from '@/lib/messaging/types'

const PROPOSAL_ROW: ConversationListItem = {
  _id: 'conversation.proposal.talk-1',
  conversationType: 'proposal',
  subject: 'Scaling Kubernetes to 10,000 nodes',
  proposalId: 'talk-1',
  proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
  createdAt: '2026-07-01T09:00:00.000Z',
  lastMessageAt: '2026-07-18T09:00:00.000Z',
  unreadCount: 0,
  lastMessage: {
    authorId: 'speaker-1',
    authorName: 'Kari Nordmann',
    excerpt: 'Any update on the review?',
  },
  counterpart: { name: 'Kari Nordmann' },
}

const GENERAL_ROW: ConversationListItem = {
  _id: 'conversation.abc123',
  conversationType: 'general',
  subject: 'Question about speaker travel',
  createdAt: '2026-07-01T09:00:00.000Z',
  lastMessageAt: '2026-07-18T09:00:00.000Z',
  unreadCount: 0,
  lastMessage: {
    authorId: 'org-1',
    authorName: 'Ola Organizer',
    excerpt: 'We cover flights booked before June.',
  },
  counterpart: { name: 'Ola Organizer' },
}

const ITEMS = [PROPOSAL_ROW, GENERAL_ROW]

/** The href the workspace passes down. */
const workspaceHref = (item: ConversationListItem) =>
  messagesPaneHref({
    basePath: '/admin/messages',
    conversationId: item._id,
    pane: 'thread',
  })

const rowLink = (title: string) =>
  screen.getByText(title).closest('a') as HTMLAnchorElement

afterEach(cleanup)

describe('row destinations', () => {
  it('sends an organizer PROPOSAL row off to the proposal page by default', () => {
    // The pre-existing contract, unchanged — the inbox page, the CFP inbox and
    // every other caller still get `conversationLinkPath`.
    render(<ConversationList items={ITEMS} isOrganizer />)
    expect(rowLink(PROPOSAL_ROW.subject!)).toHaveAttribute(
      'href',
      '/admin/proposals/talk-1#messages',
    )
  })

  it('keeps a PROPOSAL row on /admin/messages when the workspace overrides it', () => {
    render(
      <ConversationList items={ITEMS} isOrganizer hrefFor={workspaceHref} />,
    )
    const href = rowLink(PROPOSAL_ROW.subject!).getAttribute('href')
    expect(href).toBe(`/admin/messages/${PROPOSAL_ROW._id}`)
    // The requirement stated negatively: never navigated to the proposal editor.
    expect(href).not.toContain('/admin/proposals/')
  })

  it('keeps a GENERAL row on /admin/messages too (same as the default)', () => {
    render(
      <ConversationList items={ITEMS} isOrganizer hrefFor={workspaceHref} />,
    )
    expect(rowLink(GENERAL_ROW.subject!)).toHaveAttribute(
      'href',
      `/admin/messages/${GENERAL_ROW._id}`,
    )
  })
})

describe('selection', () => {
  it('marks the open conversation aria-current and no other row', () => {
    render(
      <ConversationList
        items={ITEMS}
        isOrganizer
        hrefFor={workspaceHref}
        selectedId={PROPOSAL_ROW._id}
      />,
    )
    expect(rowLink(PROPOSAL_ROW.subject!)).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(rowLink(GENERAL_ROW.subject!)).not.toHaveAttribute('aria-current')
  })

  it('marks nothing current when no conversation is open', () => {
    render(
      <ConversationList items={ITEMS} isOrganizer hrefFor={workspaceHref} />,
    )
    expect(screen.queryByRole('link', { current: 'page' })).toBeNull()
  })
})

describe('variant', () => {
  it('scrolls inside itself as a rail, and is a bordered card by default', () => {
    const { container: rail } = render(
      <ConversationList items={ITEMS} isOrganizer variant="rail" />,
    )
    const railRoot = rail.querySelector('[role="region"]')!
    expect(railRoot.className).toContain('overflow-y-auto')
    // A rail draws no border of its own — the workspace pane owns the divider.
    expect(railRoot.className).not.toContain('rounded-lg')

    cleanup()
    const { container: card } = render(
      <ConversationList items={ITEMS} isOrganizer />,
    )
    const cardRoot = card.querySelector('[role="region"]')!
    expect(cardRoot.className).toContain('rounded-lg')
    expect(cardRoot.className).not.toContain('overflow-y-auto')
  })
})
