/**
 * @vitest-environment jsdom
 *
 * A MESSAGE EDITED DOWN TO NOTHING, THROUGH THE REAL COMPOSER (#1347,
 * criterion 3). `SponsorSendModal.earlyAccess.test.tsx` stubs `EmailModal`,
 * so it cannot say whether the real one lets an emptied body be sent: its
 * Send button is disabled on an empty message unless the host allows it.
 *
 * REAL: `SponsorSendModal` and `EmailModal` (its Send gate, its draft, what
 * it hands to `onSend`).
 * STUBBED: the rich-text editor (a browser component; here a box that shows
 * the text and a button that empties it, as selecting all and deleting does:
 * the editor then reports no blocks), the modal shell, tRPC.
 */
import React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

type Block = { children?: Array<{ text?: string }> }

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showNotification: vi.fn(),
  readiness: {} as { data?: unknown; isFetching?: boolean },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          activities: {
            list: { invalidate: vi.fn() },
            listCommunications: { invalidate: vi.fn() },
          },
          discountCodeOptions: { invalidate: vi.fn() },
        },
      },
    }),
    sponsor: {
      crm: {
        sendCommunication: {
          useMutation: () => ({ mutateAsync: h.mutateAsync }),
        },
        discountCodeOptions: {
          useQuery: () => ({ data: undefined, isError: false }),
        },
        earlyAccess: {
          getSendReadiness: {
            useQuery: () => ({ ...h.readiness, refetch: vi.fn() }),
          },
        },
      },
      emailTemplates: {
        list: { useQuery: () => ({ data: [], isLoading: false }) },
      },
      contractTemplates: {
        contractReadiness: {
          useQuery: () => ({ data: undefined, isError: false }),
        },
      },
    },
    conference: {
      updateSponsorRegistrationLink: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    registration: {
      generateToken: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.showNotification }),
}))
vi.mock('@/components/admin/sponsor/SponsorTemplatePicker', () => ({
  SponsorTemplatePicker: () => null,
}))
// jsdom's own address is localhost, where the composer never sends.
vi.mock('@/lib/environment/localhost', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isLocalhostClient: () => false,
}))
vi.mock('@/components/PortableTextEditor', () => ({
  PortableTextEditor: ({
    value,
    onChange,
  }: {
    value: Block[]
    onChange: (blocks: Block[]) => void
  }) => (
    <div>
      <p data-testid="editor">
        {value
          .map((b) => (b.children ?? []).map((c) => c.text ?? '').join(''))
          .join('\n')}
      </p>
      <button type="button" onClick={() => onChange([])}>
        delete all text
      </button>
    </div>
  ),
}))
vi.mock('@headlessui/react', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  DialogTitle: ({ children, ...rest }: React.ComponentProps<'h2'>) => (
    <h2 {...rest}>{children}</h2>
  ),
}))
vi.mock('@/components/ModalShell', () => ({
  ModalShell: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode
    isOpen: boolean
  }) => (isOpen ? <div>{children}</div> : null),
}))

import { SponsorSendModal } from '@/components/admin/sponsor/SponsorSendModal'
import type { SendableKind } from '@/components/admin/sponsor/SponsorSendModal'

const READY = {
  refusal: null,
  url: null,
  sponsorStart: '2026-09-24T08:00:00.000Z',
  officialOpening: '2026-10-01T08:00:00.000Z',
}

function renderModal(kind: SendableKind = 'workshop-early-access') {
  return render(
    <SponsorSendModal
      isOpen
      kind={kind}
      onClose={vi.fn()}
      sponsorForConference={mockSponsor({
        _id: 'sfc-acme',
        status: 'closed-won',
        contactPersons: [
          mockContactPerson({
            _key: 'c-primary',
            name: 'Kari Nordmann',
            email: 'kari@acme.example',
            isPrimary: true,
          }),
        ],
      })}
      domain="conf.example.org"
      fromEmail="sponsors@conf.example.org"
      conference={{
        title: 'Cloud Native Days Bergen',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28',
        domains: ['conf.example.org'],
      }}
    />,
  )
}

/** The composer's Send button (its label is rendered twice, per width). */
const sendButton = () =>
  screen
    .getAllByRole('button')
    .find((button) => /^Send/.test(button.textContent ?? ''))!

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.readiness = { data: READY, isFetching: false }
  h.mutateAsync.mockResolvedValue({ success: true, recipientCount: 1 })
})
afterEach(cleanup)

describe('a message edited down to nothing, in the real composer', () => {
  it('can be sent on the workshop early-access kind, and posts no blocks', async () => {
    renderModal()
    await waitFor(() =>
      expect(screen.getByTestId('editor')).toHaveTextContent(
        'Thank you for sponsoring Cloud Native Days Bergen.',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'delete all text' }))
    expect(screen.getByTestId('editor')).toBeEmptyDOMElement()
    expect(sendButton()).toBeEnabled()
    fireEvent.click(sendButton())

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync.mock.calls[0][0]).toEqual({
      sponsorForConferenceId: 'sfc-acme',
      kind: 'workshop-early-access',
      recipientKeys: ['c-primary'],
      subject: 'Workshop early access: Cloud Native Days Bergen',
      message: '[]',
    })
    expect(h.showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Missing information' }),
    )
  })

  it('cannot be sent while the server refuses the send: an empty email with no block is nothing', async () => {
    h.readiness = {
      data: { refusal: { reason: 'no-window', message: 'No window.' } },
      isFetching: false,
    }
    renderModal()
    await screen.findByTestId('editor')

    fireEvent.click(screen.getByRole('button', { name: 'delete all text' }))

    expect(sendButton()).toBeDisabled()
  })

  it('cannot be sent on a kind whose email has no block of its own', async () => {
    renderModal('information')
    await screen.findByTestId('editor')

    fireEvent.click(screen.getByRole('button', { name: 'delete all text' }))

    expect(sendButton()).toBeDisabled()
    fireEvent.click(sendButton())
    expect(h.mutateAsync).not.toHaveBeenCalled()
  })
})
