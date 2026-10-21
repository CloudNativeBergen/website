/**
 * @vitest-environment jsdom
 *
 * Card Counts on a talk's admin panel (speaker feedback spec §10.2). The
 * read after a save goes through GROQ, which can lag the commit by about a
 * second: the saved counts must stay on screen until a read reflects them,
 * never flick back to the old ones beside "Card Counts saved.".
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AdminTalkFeedback } from '@/lib/feedback/admin'
import { feedbackTotals } from '@/lib/feedback/totals'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

const feedback = (green: number): AdminTalkFeedback => ({
  totals: feedbackTotals({
    live: { green: 10, yellow: 2, red: 1 },
    cards: { greenCount: green, yellowCount: 1, redCount: 0 },
  }),
  comments: [],
  responses: [],
  window: { state: 'closed', feedbackVisible: true },
})

const props = {
  onHide: vi.fn(),
  onUnhide: vi.fn(),
  onRemove: vi.fn(),
  onRemoveRange: vi.fn(),
}

afterEach(cleanup)

const greenCards = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Loved it cards' })
// The combined green total: 10 scanned + the cards.
const greenTotal = () =>
  screen.getByText('Loved it').nextElementSibling?.textContent

async function saveGreen(value: string) {
  fireEvent.change(greenCards(), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
  await screen.findByText('Card Counts saved.')
}

describe('TalkFeedbackPanel Card Counts', () => {
  it('keeps the saved counts while the read still shows the old ones', async () => {
    const onSaveCards = vi.fn(async () => {})
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    expect(greenTotal()).toBe('13')
    await saveGreen('5')
    expect(onSaveCards).toHaveBeenCalledWith({ green: 5, yellow: 1, red: 0 })
    // The refetch lags the commit: it still says 3.
    rerender(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    expect(greenCards().value).toBe('5')
    expect(greenTotal()).toBe('15')
    // It catches up; later reads are shown as they are.
    rerender(
      <TalkFeedbackPanel
        feedback={feedback(5)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    expect(greenCards().value).toBe('5')
    rerender(
      <TalkFeedbackPanel
        feedback={feedback(7)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    expect(greenCards().value).toBe('7')
    expect(greenTotal()).toBe('17')
  })

  it('shows a newer read over the saved counts (another organizer saved since)', async () => {
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn(async () => {})}
        {...props}
      />,
    )
    await saveGreen('5')
    rerender(
      <TalkFeedbackPanel
        feedback={feedback(8)}
        onSaveCards={vi.fn()}
        {...props}
      />,
    )
    expect(greenCards().value).toBe('8')
  })
})
