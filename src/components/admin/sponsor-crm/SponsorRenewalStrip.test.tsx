/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { SponsorRenewalStripView } from './SponsorRenewalStrip'

vi.mock('@/lib/trpc/client', () => ({ api: {} }))

const renewals = {
  edition: { _id: 'conf-2025', title: 'CNB 2025', origin: null },
  candidates: [
    { _id: 'sfc-1', name: 'Acme', tierTitle: 'Gold' },
    { _id: 'sfc-2', name: 'Kube Corp' },
  ],
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('SponsorRenewalStripView', () => {
  it('renders nothing with no candidates or no previous edition', () => {
    const { container, rerender } = render(
      <SponsorRenewalStripView
        renewals={{ ...renewals, candidates: [] }}
        onRenew={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<SponsorRenewalStripView renewals={null} onRenew={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('removes the chip once renewed', async () => {
    const onRenew = vi.fn().mockResolvedValue({})
    render(<SponsorRenewalStripView renewals={renewals} onRenew={onRenew} />)
    expect(
      screen.getByText('2 sponsors from CNB 2025 not renewed yet'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Renew Acme' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Renew Acme' })).toBeNull(),
    )
    expect(onRenew).toHaveBeenCalledWith('sfc-1')
    expect(
      screen.getByText('1 sponsor from CNB 2025 not renewed yet'),
    ).toBeInTheDocument()
  })

  it('keeps the chip and shows the error when renewal fails', async () => {
    const onRenew = vi.fn().mockRejectedValue(new Error('nope'))
    render(<SponsorRenewalStripView renewals={renewals} onRenew={onRenew} />)
    fireEvent.click(screen.getByRole('button', { name: 'Renew Acme' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nope')
    expect(screen.getByRole('button', { name: 'Renew Acme' })).toBeEnabled()
  })

  it('remembers the collapsed state', () => {
    const { unmount } = render(
      <SponsorRenewalStripView renewals={renewals} onRenew={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.queryByRole('button', { name: 'Renew Acme' })).toBeNull()
    unmount()
    render(<SponsorRenewalStripView renewals={renewals} onRenew={vi.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })
})
