/**
 * @vitest-environment jsdom
 *
 * Accessible names and keyboard handling for controls that had none: icon-only
 * buttons, selects without a label, and a menu that Escape did not close.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LinkInput } from './Form'
import { SearchInput } from './SearchInput'
import { CurrencySelect } from './CurrencySelect'
import { ContractValueInput } from './admin/sponsor-crm/form/ContractValueInput'
import { AdminHeaderActions } from './admin/AdminHeaderActions'
import { ProposalReviewForm } from './admin/ProposalReviewForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({}),
    proposal: {
      admin: {
        submitReview: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))

afterEach(cleanup)

describe('accessible names', () => {
  it('names the link add and remove buttons', () => {
    render(
      <LinkInput
        index={1}
        name="link-1"
        update={vi.fn()}
        add={vi.fn()}
        remove={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Remove link 2' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Add another link' }),
    ).toBeTruthy()
  })

  it('names a search input by its placeholder unless it has an id', () => {
    render(
      <SearchInput value="" onChange={vi.fn()} placeholder="Search talks" />,
    )
    expect(screen.getByRole('textbox', { name: 'Search talks' })).toBeTruthy()
    cleanup()
    render(
      <>
        <label htmlFor="s">Find speaker</label>
        <SearchInput id="s" value="" onChange={vi.fn()} placeholder="x" />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Find speaker' })).toBeTruthy()
  })

  it('names the currency select and links the contract value label', () => {
    render(
      <ContractValueInput
        value="100"
        currency="NOK"
        onValueChange={vi.fn()}
        onCurrencyChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Contract Value')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeTruthy()
    cleanup()
    render(<CurrencySelect value="NOK" setValue={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeTruthy()
  })

  it('names each star rating button', () => {
    render(<ProposalReviewForm proposalId="p1" onReviewSubmit={vi.fn()} />)
    const star = screen.getByRole('button', { name: 'Rate Content 3 of 5' })
    fireEvent.click(star)
    expect(star.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('admin actions menu', () => {
  it('closes on Escape and returns focus to the trigger', () => {
    render(
      <AdminHeaderActions items={[{ label: 'Export', onClick: vi.fn() }]} />,
    )
    const trigger = screen.getByRole('button', { name: 'Actions menu' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })
})
