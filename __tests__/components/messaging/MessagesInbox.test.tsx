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
// immediate switch, so a static searchParams + a no-op router are enough here.
const routerReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => '/admin/messages',
  useSearchParams: () => new URLSearchParams(),
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
  infiniteResult = pageOf([])
})

afterEach(cleanup)

describe('MessagesInbox — view tabs (T2a)', () => {
  it('defaults to the active view and switches the query input on tab click', () => {
    render(<MessagesInbox audience="organizer" />)
    // Initial render queried the default `active` view.
    expect(listInputs[0]).toEqual({ view: 'active' })

    fireEvent.click(screen.getByRole('tab', { name: 'Needs reply' }))
    expect(listInputs.at(-1)).toEqual({ view: 'needs-reply' })

    fireEvent.click(screen.getByRole('tab', { name: 'Unassigned' }))
    expect(listInputs.at(-1)).toEqual({ view: 'unassigned' })

    fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))
    expect(listInputs.at(-1)).toEqual({ view: 'mine' })

    fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }))
    expect(listInputs.at(-1)).toEqual({ view: 'resolved' })
  })

  it('persists the selected view in the URL query string (V1i)', () => {
    render(<MessagesInbox audience="organizer" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Needs reply' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?view=needs-reply',
      expect.objectContaining({ scroll: false }),
    )
    // Returning to the default view drops the param entirely.
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages',
      expect.objectContaining({ scroll: false }),
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

  it('speakers get only Active / Archived', () => {
    render(<MessagesInbox audience="speaker" />)
    expect(screen.getByRole('tab', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Archived' })).toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Needs reply' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Mine' })).not.toBeInTheDocument()
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
