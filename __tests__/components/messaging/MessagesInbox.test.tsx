/**
 * @vitest-environment jsdom
 *
 * Container tests for the T2a/T2e MessagesInbox additions:
 * - the status toggle and filter chips drive `listConversations` (organizer, #916);
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
const listInputs: Array<{ view: string; filters?: string[] }> = []
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
        useInfiniteQuery: (input: { view: string; filters?: string[] }) => {
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

describe('MessagesInbox — organizer status + filter chips (#916)', () => {
  const chip = (name: string) => screen.getByRole('button', { name })

  it('lands an ORGANIZER on Open + Needs reply and drives the query from status and chips', () => {
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs[0]).toEqual({ view: 'active', filters: ['needs-reply'] })
    expect(chip('Needs reply')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Chips COMBINE.
    fireEvent.click(chip('Unassigned'))
    expect(listInputs.at(-1)).toEqual({
      view: 'active',
      filters: ['needs-reply', 'unassigned'],
    })
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?filter=needs-reply%2Cunassigned',
      expect.objectContaining({ scroll: false }),
    )

    // Clearing every chip is its own URL: all open threads.
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(listInputs.at(-1)).toEqual({ view: 'active' })
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?filter=none',
      expect.objectContaining({ scroll: false }),
    )

    // Back to the landing state writes no params.
    fireEvent.click(chip('Needs reply'))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages',
      expect.objectContaining({ scroll: false }),
    )

    // Statuses drop the chips (they only narrow open threads).
    fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }))
    expect(listInputs.at(-1)).toEqual({ view: 'resolved' })
    expect(
      screen.queryByRole('button', { name: 'Needs reply' }),
    ).not.toBeInTheDocument()
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?status=resolved',
      expect.objectContaining({ scroll: false }),
    )
  })

  it.each([
    ['needs-reply', { view: 'active', filters: ['needs-reply'] }],
    ['active', { view: 'active' }],
    ['unassigned', { view: 'active', filters: ['unassigned'] }],
    ['mine', { view: 'active', filters: ['mine'] }],
    ['resolved', { view: 'resolved' }],
    ['archived', { view: 'archived' }],
    ['not-a-view', { view: 'active', filters: ['needs-reply'] }],
  ])('keeps the legacy ?view=%s URL working', (view, expected) => {
    searchParams = new URLSearchParams(`view=${view}`)
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs.at(-1)).toEqual(expected)
  })

  it('drops a legacy ?view= from the URL on the first change', () => {
    searchParams = new URLSearchParams('view=unassigned')
    render(<MessagesInbox audience="organizer" />)
    expect(chip('Unassigned')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip('Mine'))
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/admin/messages?filter=unassigned%2Cmine',
      expect.objectContaining({ scroll: false }),
    )
  })

  it('hides My teams when no team is configured, and ignores it in the URL', () => {
    searchParams = new URLSearchParams('filter=my-teams,mine')
    render(<MessagesInbox audience="organizer" />)
    expect(listInputs.at(-1)).toEqual({ view: 'active', filters: ['mine'] })
    expect(
      screen.queryByRole('button', { name: 'My teams' }),
    ).not.toBeInTheDocument()
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
    expect(
      screen.queryByRole('button', { name: 'Needs reply' }),
    ).not.toBeInTheDocument()
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
