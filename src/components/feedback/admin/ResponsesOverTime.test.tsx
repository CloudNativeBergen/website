/**
 * @vitest-environment jsdom
 *
 * Remove by range (speaker feedback spec §10.2, §10.3) removes exactly the
 * responses the organizer saw when they pressed Remove, and a range keeps
 * its place in time when a refetch reshapes the chart.
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
import type { ChartResponse } from '@/lib/feedback/buckets'
import type { RemovedCounts, RemoveRequest } from '@/lib/feedback/bulk-remove'
import { ResponsesOverTime } from './ResponsesOverTime'

const r = (id: string, submittedAt: string): ChartResponse => ({
  id,
  colour: 'red',
  submittedAt,
})
// A talk with no slot: the chart spans its responses.
const NO_WINDOW = {}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-27T12:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const chart = () => screen.getByRole('listbox', { name: 'Responses over time' })
const key = (k: string, shiftKey = false) =>
  fireEvent.keyDown(chart(), { key: k, shiftKey })

async function confirmRemove() {
  const button = within(await screen.findByRole('dialog')).getByRole('button', {
    name: 'Remove',
  })
  // The confirmation ignores a press for a moment after it opens.
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'), {
    timeout: 2000,
  })
  fireEvent.click(button)
}

describe('ResponsesOverTime', () => {
  it('removes the ids shown when Remove was pressed, not one that arrived while the dialog was open', async () => {
    const onRemove = vi.fn(async (range: RemoveRequest) => ({
      removed: range.responses.length,
      gone: 0,
      changed: 0,
    }))
    const shown = [
      r('a', '2026-10-27T09:01:00Z'),
      r('b', '2026-10-27T09:05:00Z'),
    ]
    const { rerender } = render(
      <ResponsesOverTime
        responses={shown}
        window={NO_WINDOW}
        onRemove={onRemove}
      />,
    )
    act(() => chart().focus())
    key('Home')
    fireEvent.click(screen.getByRole('button', { name: 'Remove these 2' }))
    await screen.findByRole('dialog')
    // A refetch brings a third answer in the same bucket.
    rerender(
      <ResponsesOverTime
        responses={[...shown, r('late', '2026-10-27T09:07:00Z')]}
        window={NO_WINDOW}
        onRemove={onRemove}
      />,
    )
    await confirmRemove()
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1))
    // The answers seen, each with the time the chart showed, and the bounds.
    expect(onRemove).toHaveBeenCalledWith({
      range: {
        from: '2026-10-27T09:00:00.000Z',
        to: '2026-10-27T09:10:00.000Z',
      },
      responses: [
        { id: 'a', submittedAt: '2026-10-27T09:01:00Z' },
        { id: 'b', submittedAt: '2026-10-27T09:05:00Z' },
      ],
    })
  })

  it('offers “Remove this response” for a range of one', () => {
    render(
      <ResponsesOverTime
        responses={[r('a', '2026-10-27T09:01:00Z')]}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 1, gone: 0, changed: 0 }))}
      />,
    )
    act(() => chart().focus())
    key('Home')
    expect(
      screen.getByRole('button', { name: 'Remove this response' }),
    ).toBeTruthy()
  })

  it('says how many went, how many were already gone and how many were kept', async () => {
    render(
      <ResponsesOverTime
        responses={[
          r('a', '2026-10-27T09:01:00Z'),
          r('b', '2026-10-27T09:02:00Z'),
        ]}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 1, gone: 1, changed: 2 }))}
      />,
    )
    act(() => chart().focus())
    key('Home')
    fireEvent.click(screen.getByRole('button', { name: 'Remove these 2' }))
    await confirmRemove()
    expect(
      await screen.findByText(
        '1 response removed. 1 was already gone. 2 had changed since you looked and were kept.',
      ),
    ).toBeTruthy()
  })

  it('keeps the range on the same minutes when a refetch drops the earliest bucket', () => {
    const responses = [
      r('early', '2026-10-27T08:01:00Z'),
      r('x', '2026-10-27T08:31:00Z'),
      r('y', '2026-10-27T08:41:00Z'),
    ]
    const { rerender } = render(
      <ResponsesOverTime
        responses={responses}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 0, gone: 0, changed: 0 }))}
      />,
    )
    act(() => chart().focus())
    // Buckets 08:00 … 08:40: pick 08:30 alone.
    key('End')
    key('ArrowLeft')
    expect(screen.getByText(/· 1 response$/)).toBeTruthy()
    // The 08:00 answer is removed elsewhere: the chart now starts at 08:30.
    rerender(
      <ResponsesOverTime
        responses={responses.slice(1)}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 0, gone: 0, changed: 0 }))}
      />,
    )
    const selected = within(chart())
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].getAttribute('aria-label')).toMatch(/09:30–09:40/)
  })

  it('still says what happened when the range took every response', async () => {
    let finish: (v: RemovedCounts) => void = () => {}
    const onRemove = vi.fn(
      () => new Promise<RemovedCounts>((r) => (finish = r)),
    )
    const all = [r('a', '2026-10-27T09:01:00Z')]
    const { rerender } = render(
      <ResponsesOverTime
        responses={all}
        window={NO_WINDOW}
        onRemove={onRemove}
      />,
    )
    act(() => chart().focus())
    key('Home')
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove this response' }),
    )
    await confirmRemove()
    // The refetch lands before the mutation resolves: the chart is empty.
    rerender(
      <ResponsesOverTime
        responses={[]}
        window={NO_WINDOW}
        onRemove={onRemove}
      />,
    )
    await act(async () => finish({ removed: 1, gone: 0, changed: 0 }))
    expect(await screen.findByText('1 response removed.')).toBeTruthy()
    expect(screen.getByText('No scanned responses yet.')).toBeTruthy()
  })

  it('names both days when a range crosses midnight', () => {
    render(
      <ResponsesOverTime
        responses={[
          r('a', '2026-10-27T22:51:00Z'),
          r('b', '2026-10-27T23:05:00Z'),
        ]}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 0, gone: 0, changed: 0 }))}
      />,
    )
    act(() => chart().focus())
    key('Home')
    key('End', true)
    // 23:50–00:10 Oslo (CET), across midnight.
    expect(
      screen.getByText(/^Tue 27 Oct, 23:50–Wed 28 Oct, 00:10 · 2 responses$/),
    ).toBeTruthy()
  })

  const three = [
    r('a', '2026-10-27T09:01:00Z'),
    r('b', '2026-10-27T09:11:00Z'),
    r('c', '2026-10-27T09:21:00Z'),
  ]
  const selected = () =>
    within(chart())
      .getAllByRole('option')
      .flatMap((o, i) =>
        o.getAttribute('aria-selected') === 'true' ? [i] : [],
      )

  it('picks the first bucket on the first arrow, not the one beside it', () => {
    render(
      <ResponsesOverTime
        responses={three}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 0, gone: 0, changed: 0 }))}
      />,
    )
    act(() => chart().focus())
    key('ArrowRight')
    expect(selected()).toEqual([0])
    key('ArrowRight')
    expect(selected()).toEqual([1])
  })

  it('on a touch screen, a tap picks a bar and a tap on another reaches to it; a swipe picks nothing', () => {
    render(
      <ResponsesOverTime
        responses={three}
        window={NO_WINDOW}
        onRemove={vi.fn(async () => ({ removed: 0, gone: 0, changed: 0 }))}
      />,
    )
    // Three buckets across 300 px.
    vi.spyOn(chart(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 300,
    } as DOMRect)
    const touch = (x: number, toX = x) => {
      fireEvent.pointerDown(chart(), {
        pointerType: 'touch',
        button: 0,
        clientX: x,
        clientY: 50,
      })
      fireEvent.pointerUp(chart(), {
        pointerType: 'touch',
        button: 0,
        clientX: toX,
        clientY: 50,
      })
    }
    touch(250, 30) // a swipe: scrolls, picks nothing
    expect(selected()).toEqual([])
    touch(50)
    expect(selected()).toEqual([0])
    touch(250)
    expect(selected()).toEqual([0, 1, 2])
    touch(150) // a new pick once a range is made
    expect(selected()).toEqual([1])
  })
})
