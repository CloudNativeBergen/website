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
const listConversationsInvalidate = vi.fn()
let sendState: {
  isPending: boolean
  isError: boolean
  error: unknown
} = { isPending: false, isError: false, error: null }

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: {
        listConversations: { invalidate: listConversationsInvalidate },
      },
    }),
    message: {
      send: {
        useMutation: () => ({ mutate: sendMutate, ...sendState }),
      },
    },
  },
}))

beforeEach(() => {
  sendMutate.mockClear()
  listConversationsInvalidate.mockClear()
  routerPush.mockClear()
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
