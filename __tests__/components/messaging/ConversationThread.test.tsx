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

  it('calls onSend with the trimmed body and clears the composer', () => {
    const onSend = vi.fn()
    renderView({ onSend })
    const textarea = screen.getByLabelText(/write a message/i)
    fireEvent.change(textarea, { target: { value: '  Hello there  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Hello there')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
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
