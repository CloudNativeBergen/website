/**
 * @vitest-environment jsdom
 *
 * Card Counts on a talk's admin panel (speaker feedback spec §10.2). The
 * read after a save goes through GROQ, which can lag the commit by about a
 * second: the saved counts must stay on screen until a read reflects them,
 * never flick back to the old ones beside "Card Counts saved.".
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { AdminTalkFeedback } from '@/lib/feedback/admin'
import { feedbackTotals } from '@/lib/feedback/totals'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

const feedback = (
  green: number,
  cardsSavedAt: string | null = null,
): AdminTalkFeedback => ({
  cardsSavedAt,
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
    const onSaveCards = vi.fn(async () => null)
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

  it('keeps the counts being saved when Escape is pressed during the save', async () => {
    let finish: () => void = () => {}
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn(
          () => new Promise<string | null>((r) => (finish = () => r(null))),
        )}
        {...props}
      />,
    )
    fireEvent.change(greenCards(), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
    fireEvent.keyDown(greenCards(), { key: 'Escape' })
    expect(greenCards().value).toBe('5')
    await act(async () => finish())
  })

  it('keeps the latest of two quick saves while the read still shows the first counts', async () => {
    const onSaveCards = vi.fn(async () => null)
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    await saveGreen('5')
    fireEvent.change(greenCards(), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
    await waitFor(() => expect(onSaveCards).toHaveBeenCalledTimes(2))
    // The server read has caught up with neither save yet.
    rerender(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={onSaveCards}
        {...props}
      />,
    )
    expect(greenCards().value).toBe('7')
    expect(greenTotal()).toBe('17')
  })

  it('keeps the last of two quick saves until a read carries its stamp, not just the first save’s', async () => {
    const T1 = '2026-10-27T10:00:01.000Z'
    const T2 = '2026-10-27T10:00:02.000Z'
    const stamps = [T1, T2]
    const onSaveCards = vi.fn(async () => stamps.shift() ?? null)
    const panel = (green: number, at: string | null) => (
      <TalkFeedbackPanel
        feedback={feedback(green, at)}
        onSaveCards={onSaveCards}
        {...props}
      />
    )
    const { rerender } = render(panel(3, null))
    await saveGreen('5')
    fireEvent.change(greenCards(), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Counts' }))
    await waitFor(() => expect(onSaveCards).toHaveBeenCalledTimes(2))
    await screen.findByText('Card Counts saved.')
    // A read that has caught up with the first save only.
    rerender(panel(5, T1))
    expect(greenCards().value).toBe('7')
    expect(greenTotal()).toBe('17')
    // Then with the second.
    rerender(panel(7, T2))
    expect(greenCards().value).toBe('7')
    // Another organizer's later save shows.
    rerender(panel(9, '2026-10-27T10:05:00.000Z'))
    expect(greenCards().value).toBe('9')
  })

  it('shows a newer read over the saved counts (another organizer saved since)', async () => {
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn(async () => null)}
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
      () =>
        new Promise<string | null>((resolve) => (finish = () => resolve(null))),
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

  it('links a wrong count to the message that says why, in a live region already there', () => {
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn()}
        {...props}
      />,
    )
    const regions = Array.from(document.querySelectorAll('[aria-live]'))
    fireEvent.change(greenCards(), { target: { value: '-2' } })
    const describedBy = greenCards().getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const message = document.getElementById(describedBy!)
    expect(message?.textContent).toBe(
      'Card Counts are whole numbers, 0 or more.',
    )
    expect(message?.getAttribute('aria-live')).toBe('polite')
    // The region was mounted, empty, before the words were set in it.
    expect(regions).toContain(message)
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
    const onHide = vi.fn(async () => null)
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

  it('removes a comment only as it was shown, and says when it had changed', async () => {
    const onRemove = vi.fn(async () => ({ removed: 0, gone: 0, changed: 1 }))
    render(
      <TalkFeedbackPanel
        feedback={withComment([comment])}
        onSaveCards={vi.fn()}
        {...props}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const confirm = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: 'Remove' },
    )
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'), {
      timeout: 2000,
    })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith({
        responses: [
          { id: 'feedbackResponse-1', submittedAt: '2026-10-27T09:10:00Z' },
        ],
      }),
    )
    expect(
      await screen.findByText('It had changed since you looked and was kept.', {
        selector: 'p:not([role])',
      }),
    ).toBeTruthy()
  })
})
