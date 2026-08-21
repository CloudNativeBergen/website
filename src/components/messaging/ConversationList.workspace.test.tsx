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

/**
 * Every background utility on an element, base and variant alike
 * (`bg-white`, `dark:bg-gray-800`, `lg:bg-…`). Hover/focus tints are excluded —
 * they are STATES, not the resting surface.
 */
const backgroundUtilities = (el: Element) =>
  el.className
    .split(/\s+/)
    .filter((c) => /(^|:)bg-/.test(c) && !/(hover|focus|active):/.test(c))

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

  /**
   * THE RAIL PAINTS NO SURFACE. It fills a pane of the messages workspace,
   * which sits directly on the admin page background — a fill here (it used to
   * carry `bg-white dark:bg-gray-800`) puts back the seam that made the
   * workspace read as an app inside the app. The `card` variant is the
   * opposite case and keeps its fill: there it IS a content card on a page.
   */
  it('paints no background as a rail, and the house card fill as a card', () => {
    const { container: rail } = render(
      <ConversationList items={ITEMS} isOrganizer variant="rail" />,
    )
    expect(backgroundUtilities(rail.querySelector('[role="region"]')!)).toEqual(
      [],
    )

    cleanup()
    const { container: card } = render(
      <ConversationList items={ITEMS} isOrganizer />,
    )
    expect(backgroundUtilities(card.querySelector('[role="region"]')!)).toEqual(
      ['bg-white', 'dark:bg-gray-800'],
    )
  })
})

/**
 * Row hover/selected tints must survive on BOTH surfaces this list renders on:
 * the page background (rail) and a gray-800 content card (card). A fixed dark
 * gray only works against one of them — `dark:hover:bg-gray-800/60` vanished
 * the moment the rail lost its gray-800 fill — so the dark states are alpha
 * overlays.
 */
describe('surface-agnostic row states', () => {
  it('tints hover and selection with alpha, not with a fixed dark gray', () => {
    render(
      <ConversationList
        items={ITEMS}
        isOrganizer
        variant="rail"
        selectedId={PROPOSAL_ROW._id}
      />,
    )
    const link = rowLink(PROPOSAL_ROW.subject!)
    expect(link.className).toContain('dark:hover:bg-white/10')
    expect(link.className).not.toContain('dark:hover:bg-gray-800')

    const selectedRow = link.parentElement!
    expect(selectedRow.className).toContain('dark:bg-blue-500/15')
  })

  /**
   * THE ROW ACCENT MUST NAME ONLY ITS AXIS. Tailwind v4 emits the container's
   * `divide-*` colour inside `:where(& > :not(:last-child))` at specificity 0,
   * so a blanket `border-transparent` on the row (specificity 0,1,0) wins and
   * paints the DIVIDER transparent too — the list then renders with no row
   * separators at all, in either variant. Every accent colour here is
   * `border-l-*`; an all-sides colour utility is the regression.
   */
  it('scopes the left accent to its own axis so the divider still paints', () => {
    render(
      <ConversationList
        items={ITEMS}
        isOrganizer
        variant="rail"
        selectedId={PROPOSAL_ROW._id}
      />,
    )
    const rows = [PROPOSAL_ROW, GENERAL_ROW].map(
      (item) => rowLink(item.subject!).parentElement!,
    )
    for (const row of rows) {
      const borderColours = row.className
        .split(/\s+/)
        .filter((c) => /(^|:)border-(?!l-)[a-z]/.test(c))
      expect(borderColours).toEqual([])
      expect(row.className).toMatch(/(^|\s|:)border-l-/)
    }
  })
})
