/**
 * @vitest-environment jsdom
 *
 * a11y-basics for the three bare-overlay → ModalShell conversions (batch B):
 * WidgetPicker (B1), ReceiptViewer (B2) and the WorkshopCard signup modal (B3).
 * Each previously used a hand-rolled `fixed inset-0` div with no dialog
 * semantics. These jsdom tests assert the ModalShell essentials: a `role=dialog`
 * with an accessible name, Escape closing, and focus returning to the trigger.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { ReceiptViewer } from '@/components/travel-support/ReceiptViewer'
import WorkshopCard from '@/components/workshop/WorkshopCard'
import type { ExpenseReceipt } from '@/lib/travel-support/types'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'

afterEach(cleanup)

describe('WidgetPicker (B1) — ModalShell a11y', () => {
  it('exposes a role=dialog named "Add widget"', () => {
    render(<WidgetPicker onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(
      screen.getByRole('dialog', { name: /add widget/i }),
    ).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<WidgetPicker onSelect={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the trigger after closing', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          {open && (
            <WidgetPicker onSelect={vi.fn()} onClose={() => setOpen(false)} />
          )}
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})

const imageReceipt: ExpenseReceipt = {
  file: { _type: 'file', asset: { _ref: 'file-1', _type: 'reference' } },
  filename: 'hotel-receipt.jpg',
  uploadedAt: '2026-01-15T10:30:00Z',
  url: 'https://example.com/hotel-receipt.jpg',
} as unknown as ExpenseReceipt

describe('ReceiptViewer (B2) — ModalShell a11y', () => {
  it('exposes a role=dialog named from the receipt filename', () => {
    render(
      <ReceiptViewer
        receipt={imageReceipt}
        receiptIndex={0}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('dialog', { name: /receipt: hotel-receipt\.jpg/i }),
    ).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <ReceiptViewer
        receipt={imageReceipt}
        receiptIndex={0}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the trigger after closing', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          {open && (
            <ReceiptViewer
              receipt={imageReceipt}
              receiptIndex={0}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})

const workshop = {
  _id: 'ws-1',
  title: 'Getting Started with Kubernetes Operators',
  format: 'workshop_120',
  capacity: 30,
  signups: 12,
  available: 18,
  waitlistCount: 0,
  date: '2026-09-10',
  startTime: '2026-09-10T09:00:00Z',
  endTime: '2026-09-10T11:00:00Z',
  room: 'Room A',
  description: 'A hands-on introduction to Kubernetes Operators.',
  speakers: [],
  topics: [],
} as unknown as ProposalWithWorkshopData

describe('WorkshopCard signup modal (B3) — ModalShell a11y', () => {
  const openModal = () => {
    fireEvent.click(
      screen.getByRole('button', { name: /register for workshop/i }),
    )
  }

  it('the signup modal is a role=dialog named after the workshop', () => {
    render(
      <WorkshopCard
        workshop={workshop}
        userSignups={[]}
        onSignup={vi.fn(async () => ({ success: true }))}
      />,
    )
    openModal()
    expect(
      screen.getByRole('dialog', { name: new RegExp(workshop.title, 'i') }),
    ).toBeInTheDocument()
  })

  it('closes the signup modal on Escape', async () => {
    render(
      <WorkshopCard
        workshop={workshop}
        userSignups={[]}
        onSignup={vi.fn(async () => ({ success: true }))}
      />,
    )
    openModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('returns focus to the register button after closing', async () => {
    render(
      <WorkshopCard
        workshop={workshop}
        userSignups={[]}
        onSignup={vi.fn(async () => ({ success: true }))}
      />,
    )
    const register = screen.getByRole('button', {
      name: /register for workshop/i,
    })
    register.focus()
    fireEvent.click(register)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(register).toHaveFocus())
  })
})
