/**
 * @vitest-environment jsdom
 *
 * The three-pane messages surface — which pane an organizer is on, where the
 * back links go, and (the requirement) that a proposal-attached conversation is
 * read HERE with its proposal beside it rather than on `/admin/proposals/<id>`.
 *
 * The pane children (inbox, thread, proposal) are stubbed: this file is about
 * the LAYOUT contract — the step the URL selects, the visibility of each pane at
 * each breakpoint, and the props the workspace hands down. Their own behaviour
 * is covered by `ConversationList.workspace.test.tsx` and the existing
 * thread/inbox suites.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const searchParams = { value: new URLSearchParams() }

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.value,
}))

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

/** The conversation `message.getConversation` answers with, per test. */
const conversation: {
  value: { conversationType: string; proposalId?: string } | null
} = { value: null }

vi.mock('@/lib/trpc/client', () => ({
  api: {
    message: {
      getConversation: {
        useQuery: () => ({
          data: conversation.value
            ? { conversation: conversation.value }
            : undefined,
        }),
      },
    },
  },
}))

/** Captured props so the test can assert what the list pane was handed. */
const inboxProps: { value: Record<string, unknown> } = { value: {} }

vi.mock('./MessagesInbox', () => ({
  MessagesInbox: (props: Record<string, unknown>) => {
    inboxProps.value = props
    return <div data-testid="inbox" />
  },
}))

vi.mock('./ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId?: string }) => (
    <div data-testid="thread" data-conversation-id={conversationId} />
  ),
}))

vi.mock('./ProposalContextPane', () => ({
  ProposalContextPane: ({
    proposalId,
    backHref,
  }: {
    proposalId: string
    backHref?: string
  }) => (
    <div
      data-testid="proposal-pane"
      data-proposal-id={proposalId}
      data-back-href={backHref}
    />
  ),
}))

import { MessagesWorkspace } from './MessagesWorkspace'
import type { ConversationListItem } from '@/lib/messaging/types'

const CONV = 'conversation.proposal.talk-1'
const GENERAL = 'conversation.abc123'

function setUrl(search = '') {
  searchParams.value = new URLSearchParams(search)
}

/** A pane by its `data-pane-name` marker — the element the classes live on. */
const paneOf = (name: 'list' | 'thread' | 'proposal') =>
  document.querySelector(`[data-pane-name="${name}"]`) as HTMLElement

/** Visible below `lg` ⇒ the base display utility is `flex`, not `hidden`. */
const isNarrowVisible = (el: HTMLElement) =>
  el.className.split(/\s+/).includes('flex')

afterEach(() => {
  cleanup()
  conversation.value = null
  inboxProps.value = {}
  setUrl()
})

describe('the step the URL selects', () => {
  it('is the list on /admin/messages', () => {
    render(<MessagesWorkspace />)
    expect(screen.getByTestId('inbox').closest('[data-pane]')).toHaveAttribute(
      'data-pane',
      'list',
    )
    // No conversation ⇒ no thread and no proposal pane anywhere in the DOM.
    expect(screen.queryByTestId('thread')).toBeNull()
    expect(screen.queryByTestId('proposal-pane')).toBeNull()
  })

  it('is the thread on /admin/messages/<id>', () => {
    conversation.value = { conversationType: 'general' }
    render(<MessagesWorkspace conversationId={GENERAL} />)
    expect(screen.getByTestId('thread').closest('[data-pane]')).toHaveAttribute(
      'data-pane',
      'thread',
    )
    expect(screen.getByTestId('thread')).toHaveAttribute(
      'data-conversation-id',
      GENERAL,
    )
  })

  it('is the proposal step on /admin/messages/<id>?pane=proposal', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    setUrl('pane=proposal')
    render(<MessagesWorkspace conversationId={CONV} />)
    expect(
      screen.getByTestId('proposal-pane').closest('[data-pane]'),
    ).toHaveAttribute('data-pane', 'proposal')
  })
})

describe('mobile drill-down: exactly one pane on screen', () => {
  it('shows only the list on the list step', () => {
    render(<MessagesWorkspace />)
    expect(isNarrowVisible(paneOf('list'))).toBe(true)
    expect(isNarrowVisible(paneOf('thread'))).toBe(false)
  })

  it('shows only the thread on the thread step', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    render(<MessagesWorkspace conversationId={CONV} />)
    expect(isNarrowVisible(paneOf('list'))).toBe(false)
    expect(isNarrowVisible(paneOf('thread'))).toBe(true)
    expect(isNarrowVisible(paneOf('proposal'))).toBe(false)
  })

  it('shows only the proposal pane on the proposal step', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    setUrl('pane=proposal')
    render(<MessagesWorkspace conversationId={CONV} />)
    expect(isNarrowVisible(paneOf('list'))).toBe(false)
    expect(isNarrowVisible(paneOf('thread'))).toBe(false)
    expect(isNarrowVisible(paneOf('proposal'))).toBe(true)
  })

  it('reveals every pane from lg up, whatever the step', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    render(<MessagesWorkspace conversationId={CONV} />)
    expect(paneOf('thread').className).toContain('lg:flex')
    for (const pane of [paneOf('list'), paneOf('proposal')]) {
      expect(pane.className).toContain('lg:flex')
      // A rail must not keep the base `flex-1` at lg — that would zero its
      // basis and collapse the fixed width (#878's squeezed-thread failure).
      expect(pane.className).toContain('lg:flex-none')
    }
  })
})

describe('back navigation uses the same URLs', () => {
  it('walks thread → list', () => {
    conversation.value = { conversationType: 'general' }
    render(<MessagesWorkspace conversationId={GENERAL} />)
    expect(screen.getByRole('link', { name: /messages/i })).toHaveAttribute(
      'href',
      '/admin/messages',
    )
  })

  it('walks thread → proposal and back, preserving the inbox tab', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    setUrl('view=needs-reply')
    render(<MessagesWorkspace conversationId={CONV} />)

    expect(screen.getByRole('link', { name: /proposal/i })).toHaveAttribute(
      'href',
      `/admin/messages/${CONV}?view=needs-reply&pane=proposal`,
    )
    expect(screen.getByTestId('proposal-pane')).toHaveAttribute(
      'data-back-href',
      `/admin/messages/${CONV}?view=needs-reply`,
    )
    expect(screen.getByRole('link', { name: /messages/i })).toHaveAttribute(
      'href',
      '/admin/messages?view=needs-reply',
    )
  })

  it('offers no proposal step for a non-proposal thread', () => {
    conversation.value = { conversationType: 'general' }
    render(<MessagesWorkspace conversationId={GENERAL} />)
    expect(screen.queryByTestId('proposal-pane')).toBeNull()
    expect(screen.queryByRole('link', { name: /proposal/i })).toBeNull()
  })
})

describe('the list keeps every conversation on this page', () => {
  it('hands the inbox a row builder that never leaves /admin/messages', () => {
    render(<MessagesWorkspace />)
    const hrefFor = inboxProps.value.hrefFor as (
      item: ConversationListItem,
    ) => string
    const href = hrefFor({
      _id: CONV,
      proposalId: 'talk-1',
    } as ConversationListItem)
    expect(href).toBe(`/admin/messages/${CONV}`)
    expect(href).not.toContain('/admin/proposals/')
  })

  it('tells the inbox which row is open', () => {
    conversation.value = { conversationType: 'proposal', proposalId: 'talk-1' }
    render(<MessagesWorkspace conversationId={CONV} />)
    expect(inboxProps.value.selectedId).toBe(CONV)
    expect(inboxProps.value.variant).toBe('rail')
  })
})
