/**
 * @vitest-environment jsdom
 *
 * Card Counts on a talk's admin panel (speaker feedback spec §10.2). The
 * read after a save goes through GROQ, which can lag the commit by about a
 * second: the saved counts must stay on screen until a read reflects them,
 * never flick back to the old ones beside "Card Counts saved.".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { TalkFeedbackPanel, type CardsSave } from './TalkFeedbackPanel'

const feedback = (
  green: number,
  updatedAt: string | null = null,
  rev: string | null = null,
): AdminTalkFeedback => ({
  updatedAt,
  rev,
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
  it('keeps the saved counts while the read still shows the old ones, and no longer than its time', async () => {
    const onSaveCards = vi.fn(async () => null)
    const onCardsExpired = vi.fn()
    const at = (green: number) => (
      <TalkFeedbackPanel
        feedback={feedback(green)}
        onSaveCards={onSaveCards}
        onCardsExpired={onCardsExpired}
        cardsOverlayMs={60}
        {...props}
      />
    )
    const { rerender } = render(at(3))
    expect(greenTotal()).toBe('13')
    await saveGreen('5')
    expect(onSaveCards).toHaveBeenCalledWith({ green: 5, yellow: 1, red: 0 })
    // The refetch lags the commit: it still says 3.
    rerender(at(3))
    expect(greenCards().value).toBe('5')
    expect(greenTotal()).toBe('15')
    // Its time is up: the page asks for a read, and shows the next one.
    await waitFor(() => expect(onCardsExpired).toHaveBeenCalledTimes(1))
    rerender(at(7))
    expect(greenCards().value).toBe('7')
    expect(greenTotal()).toBe('17')
  })

  it('keeps the counts being saved when Escape is pressed during the save', async () => {
    let finish: () => void = () => {}
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn(
          () => new Promise<CardsSave | null>((r) => (finish = () => r(null))),
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

  it('keeps the last of two quick saves until a read includes it, not just the first', async () => {
    const T1 = '2026-10-27T10:00:01.000Z'
    const T2 = '2026-10-27T10:00:02.000Z'
    const saves = [
      { updatedAt: T1, rev: 'r1' },
      { updatedAt: T2, rev: 'r2' },
    ]
    const onSaveCards = vi.fn(async () => saves.shift() ?? null)
    const panel = (
      green: number,
      at: string | null,
      rev: string | null = null,
    ) => (
      <TalkFeedbackPanel
        feedback={feedback(green, at, rev)}
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
    rerender(panel(5, T1, 'r1'))
    expect(greenCards().value).toBe('7')
    expect(greenTotal()).toBe('17')
    // Then with the second.
    rerender(panel(7, T2, 'r2'))
    expect(greenCards().value).toBe('7')
    // Another organizer's later save shows.
    rerender(panel(9, '2026-10-27T10:05:00.000Z', 'r3'))
    expect(greenCards().value).toBe('9')
  })

  describe('another organizer’s save, in every order against ours (committed at 10:00:02)', () => {
    const CA = '2026-10-27T10:00:02.000Z'
    const expired = vi.fn()
    beforeEach(() => expired.mockClear())
    const setup = (green: number, at: string) => {
      const view = render(
        <TalkFeedbackPanel
          feedback={feedback(green, at)}
          onSaveCards={vi.fn(async () => ({ updatedAt: CA, rev: 'rA' }))}
          onCardsExpired={expired}
          cardsOverlayMs={60}
          {...props}
        />,
      )
      return (g: number, readAt: string, rev = 'rB') =>
        view.rerender(
          <TalkFeedbackPanel
            feedback={feedback(g, readAt, rev)}
            onSaveCards={vi.fn()}
            onCardsExpired={expired}
            cardsOverlayMs={60}
            {...props}
          />,
        )
    }

    it('B landed before our page read: a lagging read of B’s counts keeps ours', async () => {
      const read = setup(4, '2026-10-27T10:00:00.000Z')
      await saveGreen('5')
      read(4, '2026-10-27T10:00:00.000Z')
      expect(greenCards().value).toBe('5')
    })

    it('B landed between our read and our commit: a lagging read of B’s counts keeps ours', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      read(4, '2026-10-27T10:00:01.000Z')
      expect(greenCards().value).toBe('5')
      expect(greenTotal()).toBe('15')
    })

    it('B landed after our commit: its counts show', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      read(4, '2026-10-27T10:00:03.000Z')
      expect(greenCards().value).toBe('4')
    })

    it('a read from the same second as our commit, of another write, with the counts unchanged keeps ours', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      // Whole seconds: this may be a write just before ours, read in the lag.
      read(3, CA)
      expect(greenCards().value).toBe('5')
    })

    it('B restored 3 in the same second as our 5: ours stands only until its time is up, then the read shows 3', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      // The refetch sees B directly: a tie, another revision, B never changes.
      read(3, CA)
      expect(greenCards().value).toBe('5')
      await waitFor(() => expect(expired).toHaveBeenCalledTimes(1))
      // Until that read arrives, ours stays: a quiet page asked for one.
      expect(greenCards().value).toBe('5')
      // The read the expiry asked for, still B's.
      read(3, CA)
      expect(greenCards().value).toBe('3')
    })

    it('a read strictly after our commit shows as it is, even with the counts we saved over', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      // Another write a second after ours put 3 back: it is the truth.
      read(3, '2026-10-27T10:00:03.000Z')
      expect(greenCards().value).toBe('3')
      expect(expired).not.toHaveBeenCalled()
    })

    it('a lagging read within the time keeps ours, however often it comes', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      read(3, '2026-10-27T09:59:00.000Z', 'r0')
      read(3, '2026-10-27T09:59:00.000Z', 'r0')
      expect(greenCards().value).toBe('5')
      expect(expired).not.toHaveBeenCalled()
    })

    it('a read of our own revision clears, whatever its time and counts', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      read(3, CA, 'rA')
      expect(greenCards().value).toBe('3')
    })

    it('a read from the same second as our commit, of another write with other counts, keeps ours until its time is up', async () => {
      const read = setup(3, '2026-10-27T09:59:00.000Z')
      await saveGreen('5')
      read(6, CA)
      expect(greenCards().value).toBe('5')
      await waitFor(() => expect(expired).toHaveBeenCalled())
      read(6, CA)
      expect(greenCards().value).toBe('6')
    })
  })

  it('shows another organizer’s counts, when nothing orders them, once the saved counts’ time is up', async () => {
    const expired = vi.fn()
    const at = (green: number) => (
      <TalkFeedbackPanel
        feedback={feedback(green)}
        onSaveCards={vi.fn(async () => null)}
        onCardsExpired={expired}
        cardsOverlayMs={60}
        {...props}
      />
    )
    const { rerender } = render(at(3))
    await saveGreen('5')
    rerender(at(8))
    expect(greenCards().value).toBe('5')
    await waitFor(() => expect(expired).toHaveBeenCalled())
    rerender(at(8))
    expect(greenCards().value).toBe('8')
  })

  it('locks the counts while a save runs, so nothing typed then is lost under “saved”', async () => {
    let finish: () => void = () => {}
    const onSaveCards = vi.fn(
      () =>
        new Promise<CardsSave | null>(
          (resolve) => (finish = () => resolve(null)),
        ),
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
