/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConversationThreadView } from '@/components/messaging'
import type { DisplayMessage } from '@/components/messaging'
import type { ConversationPreference } from '@/lib/messaging/types'

const messages: DisplayMessage[] = [
  {
    id: 'm1',
    authorName: 'Program Committee',
    isOrganizer: true,
    isOwn: false,
    body: 'Could you shorten the abstract?',
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  },
  {
    id: 'm2',
    authorName: 'Åsa Berg',
    isOrganizer: false,
    isOwn: true,
    body: 'Sure — updated now.',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
]

const preference: ConversationPreference = {
  muted: false,
  emailOverride: 'default',
}

function renderView(
  props: Partial<React.ComponentProps<typeof ConversationThreadView>> = {},
) {
  return render(
    <ConversationThreadView
      messages={messages}
      emptyText="Start the conversation with the organizers."
      onSend={vi.fn()}
      {...props}
    />,
  )
}

describe('ConversationThreadView', () => {
  it('renders each message body and author', () => {
    renderView()
    expect(
      screen.getByText('Could you shorten the abstract?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sure — updated now.')).toBeInTheDocument()
    expect(screen.getByText('Program Committee')).toBeInTheDocument()
  })

  it('shows the empty-state copy when there are no messages', () => {
    renderView({ messages: [] })
    expect(
      screen.getByText('Start the conversation with the organizers.'),
    ).toBeInTheDocument()
  })

  it('calls onSend with the trimmed body but keeps the draft until success', () => {
    // The composer must NOT clear optimistically — a failed send would then
    // silently discard the text. It clears only when sendResetKey advances.
    const onSend = vi.fn()
    const { rerender } = renderView({ onSend, sendResetKey: 0 })
    const textarea = screen.getByLabelText(/write a message/i)
    fireEvent.change(textarea, { target: { value: '  Hello there  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Hello there')
    // Draft preserved (success not yet signalled).
    expect((textarea as HTMLTextAreaElement).value).toBe('  Hello there  ')

    // Container signals success by advancing sendResetKey → composer clears.
    rerender(
      <ConversationThreadView
        messages={messages}
        emptyText="Start the conversation with the organizers."
        onSend={onSend}
        sendResetKey={1}
      />,
    )
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('surfaces a send error with a Retry that keeps the failed draft (C2)', () => {
    const onSend = vi.fn()
    renderView({ onSend, sendError: true })
    const textarea = screen.getByLabelText(/write a message/i)
    fireEvent.change(textarea, { target: { value: 'important reply' } })

    // The inline error is announced and the draft is preserved.
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t send/i)
    expect((textarea as HTMLTextAreaElement).value).toBe('important reply')

    // Retry re-submits the same preserved text.
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onSend).toHaveBeenCalledWith('important reply')
    expect((textarea as HTMLTextAreaElement).value).toBe('important reply')
  })

  it('fires onSend only once for a rapid double-activation (C6)', () => {
    const onSend = vi.fn()
    renderView({ onSend })
    const textarea = screen.getByLabelText(/write a message/i)
    fireEvent.change(textarea, { target: { value: 'no dupes' } })
    const sendButton = screen.getByRole('button', { name: 'Send' })
    fireEvent.click(sendButton)
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('renders read-only notice and disables prefs while impersonating (C1)', () => {
    const onSend = vi.fn()
    const onSetMuted = vi.fn()
    renderView({ onSend, onSetMuted, preference, readOnly: true })

    // Composer is replaced by a subtle notice — no textarea to post as them.
    expect(screen.queryByLabelText(/write a message/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/read-only while impersonating/i),
    ).toBeInTheDocument()

    // The preferences bar is present but its mutations are disabled.
    const muteButton = screen.getByRole('button', { name: /mute/i })
    expect(muteButton).toBeDisabled()
    fireEvent.click(muteButton)
    expect(onSetMuted).not.toHaveBeenCalled()
  })

  it('exposes a polite live region for newly appended messages (C7)', () => {
    const { container, rerender } = renderView()
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toBeInTheDocument()
    // Nothing announced on the initial render (no spam).
    expect(live).toHaveTextContent('')

    // A new message from someone else is announced politely.
    const withNew: DisplayMessage[] = [
      ...messages,
      {
        id: 'm3',
        authorName: 'Program Committee',
        isOrganizer: true,
        isOwn: false,
        body: 'One more thing…',
        createdAt: new Date().toISOString(),
      },
    ]
    rerender(
      <ConversationThreadView
        messages={withNew}
        emptyText="Start the conversation with the organizers."
        onSend={vi.fn()}
      />,
    )
    expect(live).toHaveTextContent('New message from Program Committee')
  })

  it('disables Send when the composer is empty or whitespace', () => {
    renderView()
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/write a message/i), {
      target: { value: '   ' },
    })
    expect(sendButton).toBeDisabled()
  })

  it('sends on Cmd/Ctrl+Enter', () => {
    const onSend = vi.fn()
    renderView({ onSend })
    const textarea = screen.getByLabelText(/write a message/i)
    fireEvent.change(textarea, { target: { value: 'Quick reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledWith('Quick reply')
  })

  it('does not render the preferences bar without onSetMuted', () => {
    renderView({ preference })
    expect(
      screen.queryByRole('button', { name: /mute/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onSetMuted when the mute toggle is pressed', () => {
    const onSetMuted = vi.fn()
    renderView({ preference, onSetMuted })
    fireEvent.click(screen.getByRole('button', { name: /mute/i }))
    expect(onSetMuted).toHaveBeenCalledWith(true)
  })

  it('calls onSetEmailOverride when the email preference changes', () => {
    const onSetEmailOverride = vi.fn()
    renderView({ preference, onSetMuted: vi.fn(), onSetEmailOverride })
    fireEvent.change(
      screen.getByLabelText(/email notifications for this conversation/i),
      { target: { value: 'off' } },
    )
    expect(onSetEmailOverride).toHaveBeenCalledWith('off')
  })

  it('renders a distinct error state on load failure', () => {
    renderView({ messages: [], isError: true })
    expect(screen.getByRole('alert')).toHaveTextContent(
      /couldn.t load this conversation/i,
    )
  })
})
