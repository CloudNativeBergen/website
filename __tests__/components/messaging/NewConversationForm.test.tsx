/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewConversationForm } from '@/components/messaging'

// The picker owns its own tRPC search query; stub it to a deterministic button
// so this test focuses on how the form WIRES a selected recipient into send.
vi.mock('@/components/messaging/SpeakerCombobox', () => ({
  SpeakerCombobox: ({
    value,
    onChange,
    invalid,
  }: {
    value: { _id: string; name: string } | null
    onChange: (s: { _id: string; name: string } | null) => void
    invalid?: boolean
  }) => (
    <div>
      <button
        type="button"
        data-testid="pick-speaker"
        onClick={() => onChange({ _id: 'speaker-9', name: 'Picked Speaker' })}
      >
        {value ? value.name : 'pick a speaker'}
      </button>
      {invalid && <span data-testid="picker-invalid" />}
    </div>
  ),
}))

const routerPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const sendMutate = vi.fn()
const sendReset = vi.fn()
const listConversationsInvalidate = vi.fn()
const getConversationInvalidate = vi.fn()
const listMessagesInvalidate = vi.fn()
let sendState: {
  isPending: boolean
  isError: boolean
  error: unknown
} = { isPending: false, isError: false, error: null }
// The latest options passed to useMutation, so tests can drive onSuccess.
let mutationOptions:
  { onSuccess?: (data: { conversationId: string }) => void } | undefined

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: {
        listConversations: { invalidate: listConversationsInvalidate },
        getConversation: { invalidate: getConversationInvalidate },
        listMessages: { invalidate: listMessagesInvalidate },
      },
    }),
    message: {
      send: {
        useMutation: (opts: typeof mutationOptions) => {
          mutationOptions = opts
          return { mutate: sendMutate, reset: sendReset, ...sendState }
        },
      },
    },
  },
}))

beforeEach(() => {
  sendMutate.mockClear()
  sendReset.mockClear()
  listConversationsInvalidate.mockClear()
  getConversationInvalidate.mockClear()
  listMessagesInvalidate.mockClear()
  routerPush.mockClear()
  mutationOptions = undefined
  sendState = { isPending: false, isError: false, error: null }
})

function fill(subject: string, body: string) {
  fireEvent.change(screen.getByLabelText('Subject'), {
    target: { value: subject },
  })
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: body },
  })
}

describe('NewConversationForm — organizer flow', () => {
  it('passes recipientSpeakerId once a speaker is picked', () => {
    render(<NewConversationForm basePath="/admin/messages" requireRecipient />)
    // Submit is blocked until a recipient is chosen.
    const submit = screen.getByRole('button', { name: /start conversation/i })
    fill('Travel plans', 'Can you confirm your dates?')
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByTestId('pick-speaker'))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    expect(sendMutate).toHaveBeenCalledWith({
      subject: 'Travel plans',
      body: 'Can you confirm your dates?',
      recipientSpeakerId: 'speaker-9',
    })
  })

  it('renders an inline "speaker not found" error on NOT_FOUND', () => {
    sendState = {
      isPending: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND' } },
    }
    render(<NewConversationForm basePath="/admin/messages" requireRecipient />)
    expect(screen.getByText(/speaker not found/i)).toBeInTheDocument()
    expect(screen.getByTestId('picker-invalid')).toBeInTheDocument()
    // The generic failure copy is suppressed in favour of the specific message.
    expect(
      screen.queryByText(/couldn.t start the conversation/i),
    ).not.toBeInTheDocument()
  })

  it('shows the generic error for a non-NOT_FOUND failure', () => {
    sendState = {
      isPending: false,
      isError: true,
      error: { data: { code: 'INTERNAL_SERVER_ERROR' } },
    }
    render(<NewConversationForm basePath="/admin/messages" requireRecipient />)
    expect(
      screen.getByText(/couldn.t start the conversation/i),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('picker-invalid')).not.toBeInTheDocument()
  })

  it('resets the mutation when the recipient selection changes after an error', () => {
    sendState = {
      isPending: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND' } },
    }
    render(<NewConversationForm basePath="/admin/messages" requireRecipient />)
    expect(screen.getByText(/speaker not found/i)).toBeInTheDocument()

    // Picking a DIFFERENT speaker must clear the stale NOT_FOUND.
    fireEvent.click(screen.getByTestId('pick-speaker'))
    expect(sendReset).toHaveBeenCalledTimes(1)
  })
})

describe('NewConversationForm — fixed recipient (organizer, known target)', () => {
  const fixedRecipient = { _id: 'speaker-7', name: 'Known Speaker' }

  it('hides the picker, shows the recipient, and sends their id', () => {
    render(
      <NewConversationForm
        basePath="/admin/messages"
        fixedRecipient={fixedRecipient}
      />,
    )
    // No picker — the target is preset and not changeable.
    expect(screen.queryByTestId('pick-speaker')).not.toBeInTheDocument()
    expect(screen.getByText('Known Speaker')).toBeInTheDocument()

    fill('Travel plans', 'Can you confirm your dates?')
    fireEvent.click(screen.getByRole('button', { name: /start conversation/i }))

    expect(sendMutate).toHaveBeenCalledWith({
      subject: 'Travel plans',
      body: 'Can you confirm your dates?',
      recipientSpeakerId: 'speaker-7',
    })
  })

  it('takes precedence over requireRecipient (no picker either way)', () => {
    render(
      <NewConversationForm
        basePath="/admin/messages"
        requireRecipient
        fixedRecipient={fixedRecipient}
      />,
    )
    expect(screen.queryByTestId('pick-speaker')).not.toBeInTheDocument()

    fill('Hello', 'A question')
    fireEvent.click(screen.getByRole('button', { name: /start conversation/i }))
    expect(sendMutate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientSpeakerId: 'speaker-7' }),
    )
  })
})

describe('NewConversationForm — proposal thread mode', () => {
  it('hides picker and subject, sends { proposalId, body }', () => {
    render(
      <NewConversationForm
        basePath="/admin/messages"
        proposalId="prop-1"
        navigateOnCreate={false}
      />,
    )
    expect(screen.queryByTestId('pick-speaker')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'A note about your proposal' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(sendMutate).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      body: 'A note about your proposal',
    })
  })

  it('does not navigate on success when navigateOnCreate is false, but invalidates the thread', () => {
    const onCreated = vi.fn()
    render(
      <NewConversationForm
        basePath="/admin/messages"
        proposalId="prop-1"
        navigateOnCreate={false}
        onCreated={onCreated}
      />,
    )

    mutationOptions?.onSuccess?.({
      conversationId: 'conversation.proposal.prop-1',
    })

    expect(onCreated).toHaveBeenCalledWith('conversation.proposal.prop-1')
    expect(routerPush).not.toHaveBeenCalled()
    expect(listConversationsInvalidate).toHaveBeenCalled()
    expect(getConversationInvalidate).toHaveBeenCalledWith({
      id: 'conversation.proposal.prop-1',
    })
    expect(listMessagesInvalidate).toHaveBeenCalledWith({
      conversationId: 'conversation.proposal.prop-1',
    })
  })

  it('still navigates by default in the general flow', () => {
    render(<NewConversationForm basePath="/cfp/messages" />)
    mutationOptions?.onSuccess?.({ conversationId: 'conversation.abc' })
    expect(routerPush).toHaveBeenCalledWith('/cfp/messages/conversation.abc')
  })
})

describe('NewConversationForm — speaker flow', () => {
  it('has no recipient picker and sends without recipientSpeakerId', () => {
    render(<NewConversationForm basePath="/cfp/messages" />)
    expect(screen.queryByTestId('pick-speaker')).not.toBeInTheDocument()

    fill('Hello', 'A question for the organizers')
    fireEvent.click(screen.getByRole('button', { name: /start conversation/i }))
    expect(sendMutate).toHaveBeenCalledWith({
      subject: 'Hello',
      body: 'A question for the organizers',
    })
  })
})
