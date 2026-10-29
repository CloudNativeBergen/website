/**
 * @vitest-environment jsdom
 *
 * The saved Card Counts' time limit through a REAL React Query client. A
 * refetch that returns data equal to what is on screen hands back the very
 * same data object (structural sharing, on by default), so the overlay must
 * end on the refetch having landed, not on the data changing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { AdminTalkFeedback } from '@/lib/feedback/admin'
import { feedbackTotals } from '@/lib/feedback/totals'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

const CA = '2026-10-27T10:00:02Z'

/** B's revert, landed in the same second as our save: 3 green cards. */
const bRevert = (): AdminTalkFeedback => ({
  updatedAt: CA,
  rev: 'rB',
  totals: feedbackTotals({
    live: { green: 10, yellow: 2, red: 1 },
    cards: { greenCount: 3, yellowCount: 1, redCount: 0 },
  }),
  comments: [],
  responses: [],
  window: { state: 'closed', feedbackVisible: true },
})

afterEach(cleanup)

describe('saved Card Counts through a real React Query client', () => {
  it('end once the read they ask for lands, though it returns the same data object', async () => {
    const reads: AdminTalkFeedback[] = []
    const queryFn = vi.fn(async () => bRevert())
    function Page() {
      const q = useQuery({ queryKey: ['talk'], queryFn })
      if (!q.data) return null
      reads.push(q.data)
      return (
        <TalkFeedbackPanel
          feedback={q.data}
          onSaveCards={async () => ({ updatedAt: CA, rev: 'rA' })}
          onCardsExpired={async () => !(await q.refetch()).isError}
          cardsOverlayMs={60}
          onHide={vi.fn()}
          onUnhide={vi.fn()}
          onKeep={vi.fn()}
          onRemove={vi.fn()}
        />
      )
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    )
    const green = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Loved it cards',
    })
    expect(green.value).toBe('3')
    fireEvent.change(green, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
    await screen.findByText('Card Counts saved.')
    expect(green.value).toBe('5')
    // The limit: one more read, equal to the last, and B's 3 shows.
    await waitFor(() => expect(green.value).toBe('3'))
    expect(queryFn).toHaveBeenCalledTimes(2)
    // It really was the same data object both times.
    expect(new Set(reads).size).toBe(1)
  })
})
