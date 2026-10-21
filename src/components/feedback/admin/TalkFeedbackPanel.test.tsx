/**
 * @vitest-environment jsdom
 *
 * Card Counts on a talk's admin panel (speaker feedback spec §10.2). The
 * read after a save goes through GROQ, which can lag the commit by about a
 * second: the saved counts must stay on screen until a read reflects them,
 * never flick back to the old ones beside "Card Counts saved.".
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('locks the counts while a save runs, so nothing typed then is lost under “saved”', async () => {
    let finish: () => void = () => {}
    const onSaveCards = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    fireEvent.change(greenCards(), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
    const yellow = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'It was OK cards',
    })
    expect(yellow.readOnly).toBe(true)
    fireEvent.change(yellow, { target: { value: '9' } })
    expect(yellow.value).toBe('1')
    await act(async () => finish())
    expect(await screen.findByText('Card Counts saved.')).toBeTruthy()
    expect(onSaveCards).toHaveBeenCalledTimes(1)
    expect(onSaveCards).toHaveBeenCalledWith({ green: 5, yellow: 1, red: 0 })
    expect(yellow.readOnly).toBe(false)
  })

  it('links a wrong count to the message that says why, in a live region', () => {
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn()}
        {...props}
      />,
    )
    fireEvent.change(greenCards(), { target: { value: '-2' } })
    const describedBy = greenCards().getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const message = document.getElementById(describedBy!)
    expect(message?.textContent).toBe(
      'Card Counts are whole numbers, 0 or more.',
    )
    expect(message?.getAttribute('aria-live')).toBe('polite')
    // The counts that are fine point at nothing.
    expect(
      screen
        .getByRole('textbox', { name: 'Not for me cards' })
        .getAttribute('aria-describedby'),
    ).toBeNull()
  })
})

describe('TalkFeedbackPanel comments', () => {
  const withComment = (comments: AdminTalkFeedback['comments']) => ({
    ...feedback(3),
    comments,
  })
  const comment = {
    id: 'feedbackResponse-1',
    colour: 'red' as const,
    comment: 'Rude remark',
    submittedAt: '2026-10-27T09:10:00Z',
    hidden: false,
    flagged: false,
  }

  it('forgets a Hide’s note once a range Remove takes that comment away', async () => {
    const onHide = vi.fn(async () => {})
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={withComment([comment])}
        onSaveCards={vi.fn()}
        {...props}
        onHide={onHide}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(
      await screen.findByText('Comment hidden from speakers.', {
        selector: 'p:not([role])',
      }),
    ).toBeTruthy()
    rerender(
      <TalkFeedbackPanel
        feedback={withComment([])}
        onSaveCards={vi.fn()}
        {...props}
        onHide={onHide}
      />,
    )
    expect(
      screen.queryByText('Comment hidden from speakers.', {
        selector: 'p:not([role])',
      }),
    ).toBeNull()
  })
})
