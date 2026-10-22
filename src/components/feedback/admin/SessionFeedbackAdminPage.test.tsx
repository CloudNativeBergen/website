/**
 * @vitest-environment jsdom
 *
 * What `/admin/feedback` shows when `sessionFeedback.adminOverview` fails. A
 * failed FIRST read has nothing to show but the error. A failed REFETCH
 * (after Hide or Remove, or on focus) keeps the numbers already on screen,
 * which React Query still holds, and says they may be out of date.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { feedbackTotals } from '@/lib/feedback/totals'
import type { AdminFeedbackOverview } from '@/lib/feedback/admin'

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  refetch: vi.fn(),
  invalidateOverview: vi.fn(),
  overviewOptions: undefined as unknown,
  invalidateFlaggedCount: vi.fn(),
  /** Each mutation's options, by procedure. */
  mutations: new Map<string, { onSettled?: () => unknown }>(),
  mutateAsync: new Map<string, ReturnType<typeof vi.fn>>(),
}))

vi.mock('@/lib/trpc/client', () => {
  const utils = {
    sessionFeedback: {
      adminOverview: { invalidate: h.invalidateOverview },
      flaggedCount: { invalidate: h.invalidateFlaggedCount },
    },
  }
  const mutation = (name: string) => ({
    useMutation: (options: { onSettled?: () => unknown }) => {
      h.mutations.set(name, options)
      if (!h.mutateAsync.has(name)) h.mutateAsync.set(name, vi.fn())
      return { mutateAsync: h.mutateAsync.get(name) }
    },
  })
  return {
    api: {
      // Stable, as tRPC's is.
      useUtils: () => utils,
      sessionFeedback: {
        adminOverview: {
          useQuery: (_input: unknown, options: unknown) => {
            h.overviewOptions = options
            return { ...h.query, refetch: h.refetch }
          },
        },
        adminHide: mutation('adminHide'),
        adminUnhide: mutation('adminUnhide'),
        adminKeep: mutation('adminKeep'),
        adminRemove: mutation('adminRemove'),
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

  it('shows the retry running while the refetch is in flight', () => {
    h.query = {
      isPending: false,
      isError: true,
      isFetching: true,
      data: DATA,
      error: { message: 'Sanity is down' },
    }
    render(<SessionFeedbackAdminPage />)
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeTruthy()
  })

  it('reads the overview and the nav’s flagged count again after every action', async () => {
    h.query = { isPending: false, isError: false, data: DATA, error: null }
    render(<SessionFeedbackAdminPage />)
    expect([...h.mutations.keys()].sort()).toEqual([
      'adminHide',
      'adminKeep',
      'adminRemove',
      'adminUnhide',
    ])
    for (const [name, options] of h.mutations) {
      h.invalidateOverview.mockClear()
      h.invalidateFlaggedCount.mockClear()
      await options.onSettled?.()
      expect(h.invalidateOverview, name).toHaveBeenCalledTimes(1)
      expect(h.invalidateFlaggedCount, name).toHaveBeenCalledTimes(1)
    }
  })

  it('reads the overview again on returning to the tab, as the nav badge does', () => {
    h.query = { isPending: false, isError: false, data: DATA, error: null }
    render(<SessionFeedbackAdminPage />)
    expect(h.overviewOptions).toMatchObject({ refetchOnWindowFocus: true })
  })

  it('reads the overview and the nav badge again on every arrival, however the organizer came (bell, /notifications, a push)', () => {
    h.query = { isPending: false, isError: false, data: DATA, error: null }
    h.invalidateFlaggedCount.mockClear()
    render(<SessionFeedbackAdminPage />)
    // A cached overview younger than the shared staleTime is not trusted.
    expect(h.overviewOptions).toMatchObject({ refetchOnMount: 'always' })
    expect(h.invalidateFlaggedCount).toHaveBeenCalledTimes(1)
  })

  it('Keep sends the response and the revision the page showed, nothing else', async () => {
    const flagged = {
      id: 'feedbackResponse-00000000000000000000000000000007',
      colour: 'red' as const,
      comment: 'Flagged one',
      submittedAt: null,
      hidden: false,
      flagged: true,
      rev: 'rev-seen',
    }
    h.query = {
      isPending: false,
      isError: false,
      data: {
        ...DATA,
        flagged: 1,
        sessions: [{ ...DATA.sessions[0], comments: [flagged] }],
      },
      error: null,
    }
    render(<SessionFeedbackAdminPage />)
    const box = screen.getByRole('region', { name: /Flagged by speakers/ })
    await act(async () =>
      fireEvent.click(within(box).getByRole('button', { name: 'Keep' })),
    )
    expect(h.mutateAsync.get('adminKeep')).toHaveBeenCalledExactlyOnceWith({
      responseId: flagged.id,
      rev: 'rev-seen',
    })
  })

  it('says nothing about refreshing when the read is fine', () => {
    h.query = { isPending: false, isError: false, data: DATA, error: null }
    render(<SessionFeedbackAdminPage />)
    expect(screen.queryByText(/Couldn’t refresh/)).toBeNull()
  })
})
