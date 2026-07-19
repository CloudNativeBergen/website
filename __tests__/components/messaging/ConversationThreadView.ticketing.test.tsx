/**
 * @vitest-environment jsdom
 *
 * Presentational tests for the T2 thread header controls on
 * ConversationThreadView:
 * - ORGANIZER: Resolve/Reopen toggle, the overflow "…" menu (Assign options,
 *   per-user & global archive), and readOnly (impersonation) gating;
 * - SPEAKER: the per-user Archive affordance joining the Mute/Emails bar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConversationThreadView } from '@/components/messaging'
import type { DisplayMessage } from '@/components/messaging'

afterEach(cleanup)

const messages: DisplayMessage[] = [
  {
    id: 'm1',
    authorName: 'Kari',
    isOrganizer: false,
    isOwn: false,
    body: 'hi',
    createdAt: '2026-01-01T00:00:00Z',
  },
]

const organizers = [
  { _id: 'org-1', name: 'Ola Organizer' },
  { _id: 'org-2', name: 'Grace Hopper' },
]

const preference = { muted: false, emailOverride: 'default' as const }

function renderOrganizer(overrides = {}) {
  const props = {
    onSetStatus: vi.fn(),
    onSetAssignee: vi.fn(),
    onSetGlobalArchived: vi.fn(),
    onArchiveForMe: vi.fn(),
    onSetMuted: vi.fn(),
    onSetEmailOverride: vi.fn(),
    ...overrides,
  }
  render(
    <ConversationThreadView
      messages={messages}
      emptyText=""
      subject="Talk"
      onSend={vi.fn()}
      preference={preference}
      status="open"
      organizers={organizers}
      assignedTo={null}
      globallyArchived={false}
      {...props}
    />,
  )
  return props
}

describe('ConversationThreadView — organizer ticketing controls', () => {
  it('Resolve calls onSetStatus("resolved")', () => {
    const props = renderOrganizer({ status: 'open' })
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    expect(props.onSetStatus).toHaveBeenCalledWith('resolved')
  })

  it('Reopen calls onSetStatus("open") when already resolved', () => {
    const props = renderOrganizer({ status: 'resolved' })
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }))
    expect(props.onSetStatus).toHaveBeenCalledWith('open')
  })

  it('the overflow menu assigns an organizer and unassigns via null', () => {
    const props = renderOrganizer({
      assignedTo: { _id: 'org-1', name: 'Ola Organizer' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /more conversation actions/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }))
    expect(props.onSetAssignee).toHaveBeenCalledWith('org-2')

    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }))
    expect(props.onSetAssignee).toHaveBeenCalledWith(null)
  })

  it('the overflow menu archives for me and toggles the global archive', () => {
    const props = renderOrganizer({ globallyArchived: false })
    fireEvent.click(
      screen.getByRole('button', { name: /more conversation actions/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /archive for me/i }))
    expect(props.onArchiveForMe).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole('button', { name: /archive for everyone/i }),
    )
    expect(props.onSetGlobalArchived).toHaveBeenCalledWith(true)
  })

  it('shows "Unarchive for everyone" when globally archived', () => {
    const props = renderOrganizer({ globallyArchived: true })
    fireEvent.click(
      screen.getByRole('button', { name: /more conversation actions/i }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /unarchive for everyone/i }),
    )
    expect(props.onSetGlobalArchived).toHaveBeenCalledWith(false)
  })

  it('readOnly (impersonation) disables the Resolve control', () => {
    const props = renderOrganizer({ readOnly: true })
    const resolve = screen.getByRole('button', { name: /resolve/i })
    expect(resolve).toBeDisabled()
    fireEvent.click(resolve)
    expect(props.onSetStatus).not.toHaveBeenCalled()
  })
})

describe('ConversationThreadView — speaker archive affordance', () => {
  it('renders Archive in the Mute/Emails bar and calls onArchiveForMe', () => {
    const onArchiveForMe = vi.fn()
    render(
      <ConversationThreadView
        messages={messages}
        emptyText=""
        subject="Talk"
        onSend={vi.fn()}
        preference={preference}
        onSetMuted={vi.fn()}
        onSetEmailOverride={vi.fn()}
        onArchiveForMe={onArchiveForMe}
      />,
    )
    // No organizer controls for a speaker.
    expect(
      screen.queryByRole('button', { name: /resolve/i }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))
    expect(onArchiveForMe).toHaveBeenCalledTimes(1)
  })

  it('readOnly disables the speaker Archive action', () => {
    const onArchiveForMe = vi.fn()
    render(
      <ConversationThreadView
        messages={messages}
        emptyText=""
        subject="Talk"
        onSend={vi.fn()}
        preference={preference}
        onSetMuted={vi.fn()}
        onSetEmailOverride={vi.fn()}
        onArchiveForMe={onArchiveForMe}
        readOnly
      />,
    )
    const archive = screen.getByRole('button', { name: /archive/i })
    expect(archive).toBeDisabled()
  })
})
