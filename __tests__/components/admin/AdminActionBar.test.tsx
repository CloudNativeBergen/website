/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AdminActionBar } from '@/components/admin/AdminActionBar'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

// Lightweight stand-ins so the shortcut behaviour can be tested without the
// modals' tRPC/query dependencies.
vi.mock('@/components/admin/ProposalManagementModal', () => ({
  ProposalManagementModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="edit-modal" /> : null,
}))
vi.mock('@/components/SpeakerProfilePreview', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-modal" /> : null,
}))
vi.mock('@/components/messaging/ProposalMessagePanel', () => ({
  ProposalMessagePanel: ({
    open,
    proposalId,
  }: {
    open: boolean
    proposalId: string
  }) =>
    open ? (
      <div data-testid="message-panel" data-proposal-id={proposalId} />
    ) : null,
}))
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => '/admin/proposals/prop-1',
  useSearchParams: () => new URLSearchParams('tab=reviews'),
}))

const proposal = {
  _id: 'prop-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Scaling Kubernetes',
  description: [],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.submitted,
  outline: '',
  topics: [],
  tos: true,
  speakers: [
    {
      _id: 'spk-1',
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Jane Doe',
      email: 'jane@example.com',
      slug: 'jane-doe',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
} as unknown as ProposalExisting

const conference = { _id: 'conf-1' } as unknown as Conference

// Headless UI's Menu observes its anchor for movement. jsdom ships no
// ResizeObserver, and the missing global surfaces as an UNHANDLED exception
// (which vitest reports separately from the assertions) the moment a menu
// opens. A no-op stand-in is enough: nothing here asserts on positioning.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver)

const cmd = (key: string) => fireEvent.keyDown(window, { key, metaKey: true })

afterEach(() => {
  cleanup()
  push.mockClear()
})

describe('AdminActionBar keyboard shortcuts (C8)', () => {
  it('opens the edit modal on ⌘E when no modal is open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('e')
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
  })

  // ⌘M navigates to the messages workspace. It must LEAVE the proposal route
  // rather than answer messaging in place — an in-place reader re-rendered the
  // very proposal behind it.
  it('navigates to the messages workspace on ⌘M', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('m')
    expect(push).toHaveBeenCalledWith(
      '/admin/messages/conversation.proposal.prop-1',
    )
  })

  it('never keeps the organizer on the proposal route to read messages', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('m')
    // Not a vacuous loop: the navigation must have happened first.
    expect(push).toHaveBeenCalledTimes(1)
    for (const [url] of push.mock.calls) {
      expect(url).not.toContain('messageId')
      expect(url).not.toContain('/admin/proposals/')
    }
  })

  it('suppresses global shortcuts while a modal is already open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    // Open the speaker preview via ⌘P.
    cmd('p')
    expect(screen.getByTestId('preview-modal')).toBeInTheDocument()

    // ⌘E must NOT stack a second focus-trapped modal on top.
    cmd('e')
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()

    // ...and ⌘M must not navigate out from under it either.
    cmd('m')
    expect(push).not.toHaveBeenCalled()
  })
})

/**
 * The bar carries up to eight actions. Everything used to sit in one inline row
 * from `sm` up, which wrapped into ragged rows at every width below a wide
 * desktop. It now splits: proposal STATE TRANSITIONS stay inline from `lg`,
 * everything else moves behind "More", and below `lg` the whole set collapses
 * into one "Actions" menu.
 *
 * jsdom applies no media queries, so both breakpoint variants are in the DOM at
 * once. The assertions read the buttons that are reachable WITHOUT opening a
 * menu — which is exactly the property being pinned.
 */
const barButtons = () =>
  screen.getAllByRole('button').map((b) => b.textContent?.trim())

const menuItems = () =>
  screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())

describe('AdminActionBar action split', () => {
  it('keeps only status transitions inline, plus the two menu triggers', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    // Submitted → Approve / Waitlist / Reject are the available transitions.
    expect(barButtons()).toEqual([
      'Approve',
      'Waitlist',
      'Reject',
      'More',
      'Actions',
    ])
  })

  it('puts edit, preview and message behind the "More" overflow', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(menuItems()).toEqual(['Edit', 'Preview', 'Message'])
  })

  it('collapses every action into one "Actions" menu below lg', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(menuItems()).toEqual([
      'Edit',
      'Preview',
      'Message',
      'Approve',
      'Waitlist',
      'Reject',
    ])
  })

  it('moves Remind — not a state transition — into the overflow too', () => {
    const accepted = { ...proposal, status: Status.accepted }
    render(<AdminActionBar proposal={accepted} conference={conference} />)

    expect(barButtons()).toEqual([
      'Confirm',
      'Reject',
      'Withdraw',
      'More',
      'Actions',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(menuItems()).toEqual(['Edit', 'Preview', 'Message', 'Remind'])
  })

  it('opens the message panel from the overflow Message item', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Message' }))

    const panel = screen.getByTestId('message-panel')
    expect(panel).toHaveAttribute('data-proposal-id', 'prop-1')
    // In PLACE: the action must not navigate away, or the panel is pointless.
    expect(push).not.toHaveBeenCalled()
  })
})

/**
 * The two doors to the same thread. Which entry point uses which is a decision,
 * not an accident: the action opens the panel in place; ⌘M (like every stored
 * notification link) goes to the full workspace.
 */
describe('AdminActionBar — panel vs workspace', () => {
  it('does not mount the panel until the action is used', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    expect(screen.queryByTestId('message-panel')).not.toBeInTheDocument()
  })

  it('leaves ⌘M on the workspace, with no panel opened', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    cmd('m')

    expect(push).toHaveBeenCalledWith(
      '/admin/messages/conversation.proposal.prop-1',
    )
    expect(screen.queryByTestId('message-panel')).not.toBeInTheDocument()
  })

  it('suppresses the global shortcuts while the panel is open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Message' }))
    expect(screen.getByTestId('message-panel')).toBeInTheDocument()

    // ⌘M must not navigate out from under the open panel, and ⌘E must not
    // stack a focus-trapped modal on top of it.
    cmd('m')
    expect(push).not.toHaveBeenCalled()
    cmd('e')
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
  })
})
