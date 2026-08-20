/**
 * @vitest-environment jsdom
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { mockSponsor, mockBillingInfo } from '@/__mocks__/sponsor-data'

const mutateAsync = vi.fn<(input: unknown) => Promise<void>>()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: { crm: { list: { invalidate: vi.fn() } } },
    }),
    sponsor: {
      crm: {
        update: {
          useMutation: () => ({ mutateAsync, isPending: false }),
        },
      },
    },
  },
}))

const showNotification = vi.fn()
vi.mock('@/components/admin/NotificationProvider', () => ({
  __esModule: true,
  useNotification: () => ({ showNotification }),
}))

// vi.mock calls are hoisted automatically by Vitest
import { SponsorContactEditor } from '@/components/admin/sponsor/SponsorContactEditor'

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))
const billingSentTo = () =>
  (mutateAsync.mock.calls.at(-1)?.[0] as { billing?: unknown } | undefined)
    ?.billing

describe('SponsorContactEditor — billing', () => {
  beforeEach(() => {
    mutateAsync.mockClear().mockResolvedValue(undefined)
    showNotification.mockClear()
  })
  afterEach(cleanup)

  /**
   * Regression: `billing: undefined` was sent whenever the billing email was
   * blank, and the server skips `undefined` — so switching the invoice format
   * (or editing reference/comments) on a sponsor without a billing email was
   * dropped, while this editor reset its dirty snapshot and looked saved.
   */
  it('sends a format change for a sponsor with no billing email', async () => {
    render(
      <SponsorContactEditor
        sponsorForConference={mockSponsor({
          contactPersons: [],
          billing: mockBillingInfo({ email: '', invoiceFormat: 'pdf' }),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: /EHF/ }))
    save()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(billingSentTo()).toMatchObject({ invoiceFormat: 'ehf' })
  })

  it('sends a reference edit for a sponsor with no billing email', async () => {
    render(
      <SponsorContactEditor
        sponsorForConference={mockSponsor({
          contactPersons: [],
          billing: mockBillingInfo({ email: '', reference: '' }),
        })}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/PO Number/), {
      target: { value: 'PO-999' },
    })
    save()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(billingSentTo()).toMatchObject({ reference: 'PO-999' })
  })

  /** Blank everywhere is "no billing details", which must clear the record. */
  it('clears billing when every field is emptied', async () => {
    render(
      <SponsorContactEditor
        sponsorForConference={mockSponsor({
          contactPersons: [],
          billing: mockBillingInfo({
            email: '',
            reference: '',
            comments: '',
            invoiceFormat: undefined as never,
          }),
        })}
      />,
    )

    save()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(billingSentTo()).toBeNull()
  })

  /**
   * "Never guess a format" (src/lib/sponsor-crm/billing.ts): pre-selecting PDF
   * turned "nobody chose" into a stored choice on the next unrelated save.
   */
  it('does not pre-select a format when none is recorded', async () => {
    render(
      <SponsorContactEditor
        sponsorForConference={mockSponsor({
          contactPersons: [],
          billing: {
            email: 'billing@example.com',
          } as never,
        })}
      />,
    )

    expect(screen.getByRole('radio', { name: /EHF/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /PDF/ })).not.toBeChecked()
    expect(screen.getByText(/Not set/)).toBeInTheDocument()

    save()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(billingSentTo()).not.toHaveProperty('invoiceFormat', 'pdf')
  })
})
