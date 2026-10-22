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

/** One read object, as React Query hands the same one back. */
const READ3 = feedback(3)

const props = {
  onHide: vi.fn(),
  onUnhide: vi.fn(),
  onKeep: vi.fn(),
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
    const onCardsExpired = vi.fn(async () => true)
    // One read object throughout: React Query keeps the same data object
    // when a refetch returns equal data, so nothing may wait for a new one.
    const read = feedback(3)
    const at = (
      <TalkFeedbackPanel
        feedback={read}
        onSaveCards={onSaveCards}
        onCardsExpired={onCardsExpired}
        cardsOverlayMs={60}
        {...props}
      />
    )
    const { rerender } = render(at)
    expect(greenTotal()).toBe('13')
    await saveGreen('5')
    expect(onSaveCards).toHaveBeenCalledWith({ green: 5, yellow: 1, red: 0 })
    rerender(at)
    expect(greenCards().value).toBe('5')
    expect(greenTotal()).toBe('15')
    // Its time is up: the page reads once more and, once that landed, the
    // read is shown as it is.
    await waitFor(() => expect(greenCards().value).toBe('3'))
    expect(onCardsExpired).toHaveBeenCalledTimes(1)
  })

  it('by default, keeps the saved counts for 10 s exactly', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const onCardsExpired = vi.fn(async () => true)
      render(
        <TalkFeedbackPanel
          feedback={READ3}
          onSaveCards={vi.fn(async () => null)}
          onCardsExpired={onCardsExpired}
          {...props}
        />,
      )
      fireEvent.change(greenCards(), { target: { value: '5' } })
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Save Card Counts' }),
        )
      })
      expect(screen.getByText('Card Counts saved.')).toBeTruthy()
      await act(async () => {
        vi.advanceTimersByTime(9_900)
      })
      expect(onCardsExpired).not.toHaveBeenCalled()
      expect(greenCards().value).toBe('5')
      await act(async () => {
        vi.advanceTimersByTime(100)
      })
      expect(onCardsExpired).toHaveBeenCalledTimes(1)
      expect(greenCards().value).toBe('3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the saved counts when the read it asks for fails, and asks again', async () => {
    const onCardsExpired = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    render(
      <TalkFeedbackPanel
        feedback={feedback(3)}
        onSaveCards={vi.fn(async () => null)}
        onCardsExpired={onCardsExpired}
        cardsOverlayMs={60}
        {...props}
      />,
    )
    await saveGreen('5')
    await waitFor(() => expect(onCardsExpired).toHaveBeenCalledTimes(1))
    expect(greenCards().value).toBe('5')
    await waitFor(() => expect(onCardsExpired).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(greenCards().value).toBe('3'))
  })

  it('a parent’s re-renders with a new callback never restart the time', async () => {
    const calls: number[] = []
    const at = (k: number) => (
      <TalkFeedbackPanel
        feedback={READ3}
        onSaveCards={vi.fn(async () => null)}
        onCardsExpired={async () => {
          calls.push(k)
          return true
        }}
        cardsOverlayMs={80}
        {...props}
      />
    )
    const { rerender } = render(at(0))
    await saveGreen('5')
    // Re-rendered every 20 ms with a fresh callback, well past the 80 ms.
    for (let k = 1; k <= 10; k++) {
      await act(() => new Promise((r) => setTimeout(r, 20)))
      rerender(at(k))
    }
    // It fired once, calling the callback of its own time.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBeGreaterThan(0)
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
    const expired = vi.fn(async () => true)
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
      // The read the expiry asks for lands with the very same data (B's,
      // unchanged): ours goes, and B's 3 shows.
      await waitFor(() => expect(greenCards().value).toBe('3'))
      expect(expired).toHaveBeenCalledTimes(1)
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
      await waitFor(() => expect(greenCards().value).toBe('6'))
    })
  })

  it('shows another organizer’s counts, when nothing orders them, once the saved counts’ time is up', async () => {
    const expired = vi.fn(async () => true)
    const read8 = feedback(8)
    const at = (read: AdminTalkFeedback) => (
      <TalkFeedbackPanel
        feedback={read}
        onSaveCards={vi.fn(async () => null)}
        onCardsExpired={expired}
        cardsOverlayMs={60}
        {...props}
      />
    )
    const { rerender } = render(at(READ3))
    await saveGreen('5')
    rerender(at(read8))
    expect(greenCards().value).toBe('5')
    await waitFor(() => expect(greenCards().value).toBe('8'))
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
    rev: 'rev-1',
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

  it('shows the flag and Keep on a flagged comment; Keep sends the revision shown', async () => {
    const onKeep = vi.fn(async () => ({ kept: true as const }))
    render(
      <TalkFeedbackPanel
        feedback={withComment([{ ...comment, flagged: true }])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    expect(screen.getByText('Flagged by a speaker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    await waitFor(() =>
      expect(onKeep).toHaveBeenCalledWith({ ...comment, flagged: true }),
    )
    expect(
      await screen.findByText(
        'Kept: the flag is cleared, speakers still see the comment.',
        { selector: 'p:not([role])' },
      ),
    ).toBeTruthy()
  })

  it('a refused Keep says where the comment stands, as the server read it', async () => {
    const onKeep = vi.fn(async () => ({
      kept: false as const,
      now: 'unflagged' as const,
    }))
    render(
      <TalkFeedbackPanel
        feedback={withComment([{ ...comment, flagged: true }])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(
      await screen.findByText(
        'Already handled by another organizer: no longer flagged.',
        { selector: 'p:not([role])' },
      ),
    ).toBeTruthy()
  })

  it('a Kept note does not come back at the top when a range Remove takes its comment away', async () => {
    const flagged = { ...comment, flagged: true }
    const onKeep = vi.fn(async () => ({ kept: true as const }))
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={withComment([flagged])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    const kept = 'Kept: the flag is cleared, speakers still see the comment.'
    expect(
      await screen.findByText(kept, { selector: 'p:not([role])' }),
    ).toBeTruthy()
    // A range Remove (the chart's, not this list's) deletes the comment.
    rerender(
      <TalkFeedbackPanel
        feedback={withComment([])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    expect(screen.queryByText(kept)).toBeNull()
  })

  it('a Keep that found the comment gone says so at the top once it has left the list', async () => {
    const flagged = { ...comment, flagged: true }
    const onKeep = vi.fn(async () => ({
      kept: false as const,
      now: 'gone' as const,
    }))
    const { rerender } = render(
      <TalkFeedbackPanel
        feedback={withComment([flagged])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    const gone =
      'Already gone: removed by an organizer, or its comment was deleted.'
    await screen.findByText(gone, { selector: 'p:not([role])' })
    rerender(
      <TalkFeedbackPanel
        feedback={withComment([])}
        onSaveCards={vi.fn()}
        {...props}
        onKeep={onKeep}
      />,
    )
    expect(screen.getByText(gone, { selector: 'p:not([role])' })).toBeTruthy()
  })

  it('no Keep on a comment that is not flagged', () => {
    render(
      <TalkFeedbackPanel
        feedback={withComment([comment])}
        onSaveCards={vi.fn()}
        {...props}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull()
    expect(screen.queryByText('Flagged by a speaker')).toBeNull()
  })
})
