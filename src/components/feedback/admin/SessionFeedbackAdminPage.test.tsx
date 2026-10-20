/**
 * @vitest-environment jsdom
 *
 * What `/admin/feedback` shows when `sessionFeedback.adminOverview` fails. A
 * failed FIRST read has nothing to show but the error. A failed REFETCH
 * (after Hide or Remove, or on focus) keeps the numbers already on screen,
 * which React Query still holds, and says they may be out of date.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { feedbackTotals } from '@/lib/feedback/totals'
import type { AdminFeedbackOverview } from '@/lib/feedback/admin'

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  refetch: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => {
  const mutation = { useMutation: () => ({ mutateAsync: vi.fn() }) }
  return {
    api: {
      useUtils: () => ({
        sessionFeedback: { adminOverview: { invalidate: vi.fn() } },
      }),
      sessionFeedback: {
        adminOverview: { useQuery: () => ({ ...h.query, refetch: h.refetch }) },
        adminHide: mutation,
        adminUnhide: mutation,
        adminRemove: mutation,
      },
    },
  }
})

import { SessionFeedbackAdminPage } from './SessionFeedbackAdminPage'

const totals = feedbackTotals({ live: { green: 12, yellow: 1, red: 0 } })
const DATA: AdminFeedbackOverview = {
  totals,
  comments: 0,
  flagged: 0,
  sessions: [
    {
      talkId: 'talk-a',
      title: 'Kubernetes the hard way',
      speakers: ['Ada'],
      format: null,
      slotAt: null,
      totals,
      comments: [],
    },
  ],
}

afterEach(() => {
  cleanup()
  h.refetch.mockClear()
})

describe('SessionFeedbackAdminPage', () => {
  it('shows only the error when the first read fails', () => {
    h.query = {
      isPending: false,
      isError: true,
      data: undefined,
      error: { message: 'Sanity is down' },
    }
    render(<SessionFeedbackAdminPage />)
    expect(screen.getByText(/Sanity is down/)).toBeTruthy()
    expect(screen.queryByText('Kubernetes the hard way')).toBeNull()
  })

  it('keeps the page when a refetch fails, says the numbers are earlier ones, and retries', () => {
    h.query = {
      isPending: false,
      isError: true,
      data: DATA,
      error: { message: 'Sanity is down' },
    }
    render(<SessionFeedbackAdminPage />)
    expect(screen.getByText('Kubernetes the hard way')).toBeTruthy()
    expect(
      screen.getByText(/Couldn’t refresh, showing earlier numbers/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(h.refetch).toHaveBeenCalled()
  })

  it('says nothing about refreshing when the read is fine', () => {
    h.query = { isPending: false, isError: false, data: DATA, error: null }
    render(<SessionFeedbackAdminPage />)
    expect(screen.queryByText(/Couldn’t refresh/)).toBeNull()
  })
})
