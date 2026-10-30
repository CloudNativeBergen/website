/**
 * @vitest-environment jsdom
 *
 * A failed delete in the confirm dialog must show why and keep the dialog
 * open, and a second click while the first is in flight must not fire twice.
 */
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => {
  const state = { rejectDelete: (_e: Error) => {} }
  const deleteExpense = vi.fn(
    () =>
      new Promise((_, reject) => {
        state.rejectDelete = reject
      }),
  )
  const mutation = (mutateAsync = vi.fn()) => ({
    useMutation: () => ({ isPending: false, error: null, mutateAsync }),
  })
  return { state, deleteExpense, mutation, stub: () => null }
})
vi.mock('@/lib/trpc/client', () => ({
  api: {
    travelSupport: {
      getMine: {
        useQuery: () => ({
          data: {
            _id: 'ts-1',
            status: 'draft',
            bankingDetails: { beneficiaryName: '' },
            expenses: [{ _id: 'e-1' }],
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      create: h.mutation(),
      updateBankingDetails: h.mutation(),
      addExpense: h.mutation(),
      updateExpense: h.mutation(),
      deleteExpense: h.mutation(h.deleteExpense),
      deleteReceipt: h.mutation(),
      submit: h.mutation(),
    },
  },
}))

vi.mock('@/components/travel-support/BankingDetailsForm', () => ({
  BankingDetailsForm: h.stub,
}))
vi.mock('@/components/travel-support/BankingDetailsDisplay', () => ({
  BankingDetailsDisplay: h.stub,
}))
vi.mock('@/components/travel-support/ExpenseForm', () => ({
  ExpenseForm: h.stub,
}))
vi.mock('@/components/travel-support/ExpenseSummary', () => ({
  ExpenseSummary: h.stub,
}))
vi.mock('@/components/travel-support/ExchangeRateDebugPanel', () => ({
  ExchangeRateDebugPanel: h.stub,
}))
vi.mock('@/components/travel-support/ApprovalSummary', () => ({
  ApprovalSummary: h.stub,
}))
vi.mock('@/components/travel-support/ExpensesList', () => ({
  ExpensesList: ({ onDelete }: { onDelete: (id: string) => void }) => (
    <button type="button" onClick={() => onDelete('e-1')}>
      delete expense
    </button>
  ),
}))

import { TravelSupportPageClient } from '@/components/travel-support/TravelSupportPageClient'

describe('TravelSupportPageClient confirm dialog', () => {
  it('blocks double submit and shows a failed delete in the dialog', async () => {
    render(
      <TravelSupportPageClient initialTravelSupport={null} speakerId="sp-1" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'delete expense' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(h.deleteExpense).toHaveBeenCalledTimes(1)

    await act(async () => h.state.rejectDelete(new Error('Expense is locked')))

    expect(screen.getByRole('alert')).toHaveTextContent('Expense is locked')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })
})
