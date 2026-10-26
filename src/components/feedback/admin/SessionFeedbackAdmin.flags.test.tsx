/**
 * @vitest-environment jsdom
 *
 * The flagged-by-speakers box and Keep's outcomes (speaker feedback spec
 * §10.1, §10.3): what the page says after a Keep, a Keep refused because the
 * comment changed, and a flag that came back. The overview is passed in as
 * the page's re-read would deliver it.
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
import { combineTotals, feedbackTotals } from '@/lib/feedback/totals'
import type {
  AdminFeedbackComment,
  AdminFeedbackOverview,
  AdminFeedbackSession,
  KeepAnswer,
  KeepNow,
} from '@/lib/feedback/admin'
import { SessionFeedbackAdmin } from './SessionFeedbackAdmin'

afterEach(cleanup)

const CHANGED =
  'This comment changed after this page loaded (a new flag or new wording). Look at it again before you keep it.'
/** The server's answer to a refused Keep: where the comment stands now. */
const refused = (now: KeepNow) => () =>
  Promise.resolve({ kept: false as const, now })

const X: AdminFeedbackComment = {
  id: 'feedbackResponse-00000000000000000000000000000001',
  colour: 'yellow',
  comment: 'Good content, a bit too fast.',
  submittedAt: '2026-10-27T09:10:00.000Z',
  hidden: false,
  flagged: true,
  rev: 'r1',
  judgement: null,
  kept: null,
}
const overview = (
  ...comments: AdminFeedbackComment[]
): AdminFeedbackOverview => {
  const s: AdminFeedbackSession = {
    talkId: 'talk-a',
    title: 'Talk A',
    speakers: ['Ada'],
    format: null,
    slotAt: null,
    totals: feedbackTotals({ live: { green: 10, yellow: 1, red: 0 } }),
    comments,
  }
  return {
    totals: combineTotals([s.totals]),
    comments: comments.length,
    flagged: comments.filter((c) => c.flagged).length,
    sessions: [s],
  }
}
const noop = () => Promise.resolve()
const kept = () => Promise.resolve({ kept: true as const })
const props = (
  onKeep: (c: AdminFeedbackComment) => Promise<KeepAnswer | void>,
) => ({
  onHide: noop,
  onUnhide: noop,
  onRemove: () => Promise.resolve({ removed: 1, gone: 0, changed: 0 }),
  onKeep: vi.fn(onKeep),
})
const box = () => screen.getByRole('region', { name: /Flagged by speakers/ })
const status = () => screen.getAllByRole('status')[0]

/** Keep X in the box; the page then re-reads and shows `after`. */
async function keepThenRead(
  onKeep: () => Promise<KeepAnswer | void>,
  after: AdminFeedbackOverview,
) {
  const p = props(onKeep)
  const view = render(<SessionFeedbackAdmin overview={overview(X)} {...p} />)
  await act(async () =>
    fireEvent.click(within(box()).getByRole('button', { name: 'Keep' })),
  )
  view.rerender(<SessionFeedbackAdmin overview={after} {...p} />)
  return p
}

describe('Keep from the box', () => {
  it('sends the comment as the page showed it, revision and all', async () => {
    const p = await keepThenRead(
      kept,
      overview({ ...X, flagged: false, rev: 'r2' }),
    )
    expect(p.onKeep).toHaveBeenCalledWith(X)
  })

  it('a Kept note does not sit beside the same comment flagged again', async () => {
    const p = props(kept)
    const view = render(<SessionFeedbackAdmin overview={overview(X)} {...p} />)
    await act(async () =>
      fireEvent.click(within(box()).getByRole('button', { name: 'Keep' })),
    )
    view.rerender(
      <SessionFeedbackAdmin
        overview={overview({ ...X, flagged: false, rev: 'r2' })}
        {...p}
      />,
    )
    await waitFor(() =>
      expect(
        within(box()).getByText(/^Kept: the flag is cleared/),
      ).toBeTruthy(),
    )
    view.rerender(
      <SessionFeedbackAdmin overview={overview({ ...X, rev: 'r3' })} {...p} />,
    )
    const item = within(box()).getByRole('listitem')
    expect(within(item).getByRole('button', { name: 'Keep' })).toBeTruthy()
    expect(within(box()).queryByText(/^Kept: the flag is cleared/)).toBeNull()
  })
})

describe('Keep refused because the comment changed: said as the SERVER found it', () => {
  for (const [why, now, after, said] of [
    [
      'another organizer kept it',
      'unflagged',
      overview({ ...X, flagged: false, rev: 'r2' }),
      'Already handled by another organizer: no longer flagged.',
    ],
    [
      'another organizer hid it',
      'hidden',
      overview({ ...X, flagged: false, hidden: true, rev: 'r2' }),
      'Already handled by another organizer: now hidden from speakers.',
    ],
    [
      'another organizer removed it',
      'gone',
      overview(),
      'Already gone: removed by an organizer, or its comment was deleted.',
    ],
  ] as const) {
    it(`${why}: no error, names the comment, nothing to "look at again"`, async () => {
      await keepThenRead(refused(now), after)
      await waitFor(() => expect(within(box()).getByText(said)).toBeTruthy())
      // Away from its comment, the note says which one it was.
      expect(
        within(box()).getByText('Talk A: “Good content, a bit too fast.”'),
      ).toBeTruthy()
      expect(screen.queryByText(CHANGED)).toBeNull()
      expect(screen.queryByText(/not found/)).toBeNull()
      // Said once by the live region, not also by a focused note.
      expect(status()).toHaveTextContent(said)
      expect(document.activeElement).toBe(
        within(box()).getByRole('heading', { name: /Flagged by speakers/ }),
      )
    })
  }

  it('r1 seen, r2 kept by another, r3 flagged again, while the re-read still shows r2: the server’s word, not "already handled"', async () => {
    await keepThenRead(
      refused('flagged'),
      overview({ ...X, flagged: false, rev: 'r2' }),
    )
    await waitFor(() => expect(within(box()).getByText(CHANGED)).toBeTruthy())
    expect(screen.queryByText(/Already handled/)).toBeNull()
  })

  it('still flagged but changed (new wording): the refusal stays beside it, with its session', async () => {
    const reworded = { ...X, comment: 'NEW WORDING', rev: 'r2' }
    await keepThenRead(refused('flagged'), overview(reworded))
    const item = await within(box()).findByRole('listitem')
    await waitFor(() => expect(within(item).getByText(CHANGED)).toBeTruthy())
    expect(within(item).getByText('Talk A')).toBeTruthy()
    expect(within(item).getByText('NEW WORDING')).toBeTruthy()
    expect(within(item).getByRole('button', { name: 'Keep' })).toBeTruthy()
  })

  it('a failure is said as it came', async () => {
    await keepThenRead(
      () => Promise.reject(new Error('Feedback Response not found')),
      overview({ ...X, flagged: false, rev: 'r2' }),
    )
    await waitFor(() =>
      expect(
        within(box()).getByText('Feedback Response not found'),
      ).toBeTruthy(),
    )
  })
})

describe('Keep in a session row', () => {
  const openRow = () => {
    fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
    return screen.getByRole('region', { name: 'Sessions' })
  }

  it('refused because another organizer kept it: said beside the comment, as the server found it', async () => {
    const p = props(refused('unflagged'))
    const view = render(<SessionFeedbackAdmin overview={overview(X)} {...p} />)
    const sessions = openRow()
    await act(async () =>
      fireEvent.click(within(sessions).getByRole('button', { name: 'Keep' })),
    )
    view.rerender(
      <SessionFeedbackAdmin
        overview={overview({ ...X, flagged: false, rev: 'r2' })}
        {...p}
      />,
    )
    const item = within(sessions)
      .getByText('Good content, a bit too fast.')
      .closest('li')!
    await waitFor(() =>
      expect(
        within(item).getByText(
          'Already handled by another organizer: no longer flagged.',
        ),
      ).toBeTruthy(),
    )
    expect(screen.queryByText(CHANGED)).toBeNull()
  })

  it('a background re-read long after the action does not move focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const p = props(kept)
      const view = render(
        <SessionFeedbackAdmin overview={overview(X)} {...p} />,
      )
      const sessions = openRow()
      await act(async () =>
        fireEvent.click(within(sessions).getByRole('button', { name: 'Keep' })),
      )
      ;(document.activeElement as HTMLElement | null)?.blur()
      vi.setSystemTime(Date.now() + 60_000)
      // A refetch on returning to the tab: another organizer hid it.
      view.rerender(
        <SessionFeedbackAdmin
          overview={overview({ ...X, flagged: false, hidden: true, rev: 'r3' })}
          {...p}
        />,
      )
      await new Promise((r) => setTimeout(r, 20))
      expect(document.activeElement).toBe(document.body)
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves focus to the comment, not to the page, when its button goes', async () => {
    const p = props(kept)
    const view = render(<SessionFeedbackAdmin overview={overview(X)} {...p} />)
    fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
    const sessions = screen.getByRole('region', { name: 'Sessions' })
    const keep = within(sessions).getByRole('button', { name: 'Keep' })
    keep.focus()
    await act(async () => fireEvent.click(keep))
    view.rerender(
      <SessionFeedbackAdmin
        overview={overview({ ...X, flagged: false, rev: 'r2' })}
        {...p}
      />,
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(sessions).getByText('Good content, a bit too fast.'),
      ),
    )
  })
})

describe('the server’s word, when the re-read still shows the old flag', () => {
  // The overview read after the refused Keep lags: X still flagged, at r1.
  const stale = overview(X)
  for (const [now, said] of [
    ['unflagged', 'Already handled by another organizer: no longer flagged.'],
    [
      'hidden',
      'Already handled by another organizer: now hidden from speakers.',
    ],
    [
      'gone',
      'Already gone: removed by an organizer, or its comment was deleted.',
    ],
  ] as const) {
    it(`box: answer "${now}" is said, not "changed, look again"`, async () => {
      await keepThenRead(refused(now), stale)
      await waitFor(() => expect(within(box()).getByText(said)).toBeTruthy())
      expect(screen.queryByText(CHANGED)).toBeNull()
    })

    it(`session row: answer "${now}" is said, not "changed, look again"`, async () => {
      const p = props(refused(now))
      const view = render(
        <SessionFeedbackAdmin overview={overview(X)} {...p} />,
      )
      fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
      const sessions = screen.getByRole('region', { name: 'Sessions' })
      await act(async () =>
        fireEvent.click(within(sessions).getByRole('button', { name: 'Keep' })),
      )
      view.rerender(<SessionFeedbackAdmin overview={stale} {...p} />)
      await waitFor(() => expect(within(sessions).getByText(said)).toBeTruthy())
      expect(screen.queryByText(CHANGED)).toBeNull()
    })
  }
})

describe('a NOT_FOUND for a comment this page showed', () => {
  const notFound = () =>
    Promise.reject(
      Object.assign(new Error('Feedback Response not found'), {
        data: { code: 'NOT_FOUND' },
      }),
    )

  it('is "already gone", naming it, in the box and in the live region', async () => {
    await keepThenRead(notFound, overview())
    const said =
      'Already gone: removed by an organizer, or its comment was deleted.'
    await waitFor(() => expect(within(box()).getByText(said)).toBeTruthy())
    expect(screen.queryByText('Feedback Response not found')).toBeNull()
    expect(status()).toHaveTextContent(
      `${said} Talk A: “Good content, a bit too fast.”`,
    )
  })
})

describe('focus follows only the organizer’s own action, on its own comment and place', () => {
  const Y: AdminFeedbackComment = {
    ...X,
    id: 'feedbackResponse-00000000000000000000000000000002',
    comment: 'Another comment.',
    flagged: false,
    rev: 'y1',
  }

  it('a re-read changing comment B right after a Keep on A does not move focus to B', async () => {
    const p = props(kept)
    const view = render(
      <SessionFeedbackAdmin overview={overview(X, Y)} {...p} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
    const sessions = screen.getByRole('region', { name: 'Sessions' })
    const itemOf = (text: string) =>
      within(sessions).getByText(text).closest('li')!
    // An earlier action on B leaves a note beside it.
    await act(async () =>
      fireEvent.click(
        within(itemOf('Another comment.')).getByRole('button', {
          name: 'Hide',
        }),
      ),
    )
    // Now Keep A.
    await act(async () =>
      fireEvent.click(
        within(itemOf('Good content, a bit too fast.')).getByRole('button', {
          name: 'Keep',
        }),
      ),
    )
    ;(document.activeElement as HTMLElement | null)?.blur()
    // A re-read: B changed (hidden), A unchanged.
    view.rerender(
      <SessionFeedbackAdmin
        overview={overview(X, { ...Y, hidden: true, rev: 'y2' })}
        {...p}
      />,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(document.activeElement).not.toBe(
      within(sessions).getByText('Another comment.'),
    )
  })

  it('an action in a session row does not send focus to the box', async () => {
    const p = props(kept)
    const view = render(
      <SessionFeedbackAdmin overview={overview(X, Y)} {...p} />,
    )
    // A Keep in the box leaves a note at its top.
    await act(async () =>
      fireEvent.click(within(box()).getByRole('button', { name: 'Keep' })),
    )
    view.rerender(
      <SessionFeedbackAdmin
        overview={overview({ ...X, flagged: false, rev: 'r2' }, Y)}
        {...p}
      />,
    )
    await waitFor(() =>
      expect(within(box()).getByText(/^Kept: the flag/)).toBeTruthy(),
    )
    ;(document.activeElement as HTMLElement | null)?.blur()
    // Then Hide B in its row.
    fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
    const sessions = screen.getByRole('region', { name: 'Sessions' })
    await act(async () =>
      fireEvent.click(
        within(
          within(sessions).getByText('Another comment.').closest('li')!,
        ).getByRole('button', { name: 'Hide' }),
      ),
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(document.activeElement).not.toBe(
      within(box()).getByRole('heading', { name: /Flagged by speakers/ }),
    )
  })
})

describe('focus after a Remove takes the comment away', () => {
  /**
   * As the page runs it: the Remove resolves only once the re-read that
   * drops the comment has landed (`onSettled` is awaited), so the dialog
   * closes over a page whose trigger has already gone.
   */
  async function removeVia(open: () => HTMLElement) {
    let finish = () => {}
    const p = {
      ...props(kept),
      onRemove: vi.fn(
        () =>
          new Promise<{ removed: number; gone: number; changed: number }>(
            (resolve) => {
              finish = () => resolve({ removed: 1, gone: 0, changed: 0 })
            },
          ),
      ),
    }
    const view = render(<SessionFeedbackAdmin overview={overview(X)} {...p} />)
    const remove = open()
    remove.focus()
    fireEvent.click(remove)
    const confirm = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: 'Remove' },
    )
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'), {
      timeout: 2000,
    })
    await act(async () => fireEvent.click(confirm))
    // The re-read lands: the comment is gone. Then the Remove resolves.
    view.rerender(<SessionFeedbackAdmin overview={overview()} {...p} />)
    await act(async () => finish())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('from the box: lands on the box heading, not the page', async () => {
    await removeVia(() => within(box()).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(box()).getByRole('heading', { name: /Flagged by speakers/ }),
      ),
    )
  })

  it('from a session row: lands on that session’s row', async () => {
    await removeVia(() => {
      fireEvent.click(screen.getByRole('button', { name: /Talk A/ }))
      return within(screen.getByRole('region', { name: 'Sessions' })).getByRole(
        'button',
        { name: 'Remove' },
      )
    })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /Talk A/ }),
      ),
    )
  })
})

describe('Remove from the box', () => {
  it('sends the answer as the box showed it and says what happened', async () => {
    const onRemove = vi.fn(async () => ({ removed: 0, gone: 0, changed: 1 }))
    render(
      <SessionFeedbackAdmin
        overview={overview(X)}
        {...props(kept)}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(within(box()).getByRole('button', { name: 'Remove' }))
    const confirm = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: 'Remove' },
    )
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'), {
      timeout: 2000,
    })
    await act(async () => fireEvent.click(confirm))
    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith({
        responses: [{ id: X.id, submittedAt: X.submittedAt }],
      }),
    )
    expect(
      await within(box()).findByText(
        'It had changed since you looked and was kept.',
      ),
    ).toBeTruthy()
  })
})
