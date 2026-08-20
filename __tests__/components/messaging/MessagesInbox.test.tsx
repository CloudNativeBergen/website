/**
 * @vitest-environment jsdom
 *
 * Container tests for the T2a/T2e MessagesInbox additions:
 * - the view tab bar drives the `listConversations` `view` input (organizer);
 * - the speaker toggle exposes only Active / Archived;
 * - the Archived view wires Unarchive to the un-archive mutations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { speaker: { _id: 'me' } } }),
}))

// The inbox persists the view in `?view=` (V1i). Local state still drives the
// immediate switch, so a settable searchParams + a no-op router are enough here.
const routerReplace = vi.fn()
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => '/admin/messages',
  useSearchParams: () => searchParams,
}))

// Capture every `view` the inbox query is called with, plus the mutation calls.
const listInputs: Array<{ view: string }> = []
const setArchivedMutate = vi.fn()
const setPreferenceMutate = vi.fn()
const listInvalidate = vi.fn()

let infiniteResult: Record<string, unknown> = {}

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: { listConversations: { invalidate: listInvalidate } },
    }),
    message: {
      viewCounts: {
        useQuery: () => ({ data: undefined }),
      },
      teamLens: {
        useQuery: () => ({ data: undefined }),
      },
      listConversations: {
        useInfiniteQuery: (input: { view: string }) => {
          listInputs.push(input)
          return infiniteResult
        },
      },
      setArchived: {
        useMutation: () => ({ mutate: setArchivedMutate, isPending: false }),
      },
      setPreference: {
        useMutation: () => ({ mutate: setPreferenceMutate, isPending: false }),
      },
    },
  },
}))

import { MessagesInbox } from '@/components/messaging'

function pageOf(items: unknown[]) {
  return {
    data: { pages: [items] },
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }
}

const archivedRow = {
  _id: 'conversation.gen-1',
  conversationType: 'general',
  subject: 'Old thread',
  createdAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-02-01T00:00:00Z',
  unreadCount: 0,
  lastMessage: { authorId: 'sp-1', authorName: 'Kari', excerpt: 'hi' },
  counterpart: { name: 'Kari' },
  status: 'open',
  needsReply: false,
  assignedTo: null,
  archived: true,
}

beforeEach(() => {
  listInputs.length = 0
  setArchivedMutate.mockClear()
  setPreferenceMutate.mockClear()
  listInvalidate.mockClear()
  routerReplace.mockClear()
  searchParams = new URLSearchParams()
  infiniteResult = pageOf([])
})

afterEach(cleanup)

describe('MessagesInbox — view tabs (T2a)', () => {
  it('defaults an ORGANIZER to the needs-reply view and switches the query input on tab click', () => {
    render(<MessagesInbox audience="organizer" />)
    // Initial render queried the organizer landing view: triage first.
    expect(listInputs[0]).toEqual({ view: 'needs-reply' })

    fireEvent.click(screen.getByRole('tab', { name: 'Active' }))
    expect(listInputs.at(-1)).toEqual({ view: 'active' })

    fireEvent.click(screen.getByRole('tab', { name: 'Unassigned' }))
    expect(listInputs.at(-1)).toEqual({ view: 'unassigned' })

    fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))
    expect(listInputs.at(-1)).toEqual({ view: 'mine' })

    fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }))
    expect(listInputs.at(-1)).toEqual({ view: 'resolved' })
  })

  it('renders "Needs reply" FIRST in the organizer tab bar, and it is the selected tab on load', () => {
    render(<MessagesInbox audience="organizer" />)
    const labels = screen
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.trim())
    expect(labels[0]).toBe('Needs reply')
    expect(screen.getByRole('tab', { name: 'Needs reply' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Active' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('persists the selected view in the URL query string (V1i)', () => {
    render(<MessagesInbox audience="organizer" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?view=active',
      expect.objectContaining({ scroll: false }),
    )
    // Returning to the LANDING view drops the param entirely — the canonical
    // no-param state must be the same view the fallback resolves to, or the URL
    // and the tab bar would describe different things.
    fireEvent.click(screen.getByRole('tab', { name: 'Needs reply' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages',
      expect.objectContaining({ scroll: false }),
    )
  })

  it('an unknown ?view= falls back to the SAME view the no-param write clears to', () => {
    searchParams = new URLSearchParams('view=not-a-view')
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs[0]).toEqual({ view: 'needs-reply' })
    expect(screen.getByRole('tab', { name: 'Needs reply' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps the existing ?view=needs-reply / ?view=unassigned deep links working (admin My areas cards)', () => {
    searchParams = new URLSearchParams('view=needs-reply')
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs.at(-1)).toEqual({ view: 'needs-reply' })
    cleanup()

    listInputs.length = 0
    searchParams = new URLSearchParams('view=unassigned')
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs.at(-1)).toEqual({ view: 'unassigned' })
    expect(screen.getByRole('tab', { name: 'Unassigned' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('organizers get the full tab bar; the "All" view is omitted from the UI', () => {
    render(<MessagesInbox audience="organizer" />)
    for (const label of [
      'Active',
      'Needs reply',
      'Unassigned',
      'Mine',
      'Resolved',
      'Archived',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument()
  })

  it('speakers get only Active / Archived, and still LAND on Active', () => {
    render(<MessagesInbox audience="speaker" />)
    expect(listInputs[0]).toEqual({ view: 'active' })
    expect(screen.getByRole('tab', { name: 'Active' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Archived' })).toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Needs reply' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Mine' })).not.toBeInTheDocument()
  })

  it('a speaker switching to Archived and back clears the param at ACTIVE (not the organizer landing view)', () => {
    render(<MessagesInbox audience="speaker" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?view=archived',
      expect.objectContaining({ scroll: false }),
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages',
      expect.objectContaining({ scroll: false }),
    )
  })
})

describe('MessagesInbox — Archived view Unarchive wiring (T2e)', () => {
  it('un-archives a row (global + per-user) only in the archived view', () => {
    infiniteResult = pageOf([archivedRow])
    render(<MessagesInbox audience="organizer" />)

    // Active view: no Unarchive affordance.
    expect(
      screen.queryByRole('button', { name: /unarchive/i }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }))
    fireEvent.click(screen.getByRole('button', { name: /unarchive/i }))

    // Organizer unarchive lifts BOTH archives so the row leaves the view.
    expect(setArchivedMutate).toHaveBeenCalledWith({
      conversationId: 'conversation.gen-1',
      archived: false,
    })
    expect(setPreferenceMutate).toHaveBeenCalledWith({
      conversationId: 'conversation.gen-1',
      archived: false,
    })
  })

  it('a speaker unarchive lifts ONLY the per-user archive', () => {
    infiniteResult = pageOf([archivedRow])
    render(<MessagesInbox audience="speaker" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }))
    fireEvent.click(screen.getByRole('button', { name: /unarchive/i }))

    expect(setArchivedMutate).not.toHaveBeenCalled()
    expect(setPreferenceMutate).toHaveBeenCalledWith({
      conversationId: 'conversation.gen-1',
      archived: false,
    })
  })
})
