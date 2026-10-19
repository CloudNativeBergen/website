/**
 * @vitest-environment jsdom
 *
 * `useWindowOnTheClock`: the window's state moves on by the clock, and a
 * sample taken for one window is never applied to another.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackWindow } from '@/lib/feedback'
import { useWindowOnTheClock } from './useWindowOnTheClock'

const at = (iso: string) => new Date(iso).getTime()
const windowFrom = (opensAt: string, state: FeedbackWindow['state']) =>
  ({
    state,
    opensAt,
    lastSlotEnd: new Date(at(opensAt) + 40 * 60_000).toISOString(),
    closesAt: new Date(at(opensAt) + 25 * 3_600_000).toISOString(),
    feedbackVisible: state !== 'before',
  }) as FeedbackWindow

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('useWindowOnTheClock', () => {
  it('moves from before to open at the window’s start', () => {
    const { result } = renderHook(() =>
      useWindowOnTheClock(windowFrom('2026-10-26T09:00:00Z', 'before')),
    )
    act(() => vi.advanceTimersByTime(0))
    expect(result.current?.state).toBe('before')
    act(() => vi.advanceTimersByTime(60 * 60_000 + 100))
    expect(result.current?.state).toBe('open')
  })

  it('never judges a moved window by the clock sampled for the old one', () => {
    const { result, rerender } = renderHook(({ w }) => useWindowOnTheClock(w), {
      initialProps: { w: windowFrom('2026-10-26T10:00:00Z', 'before') },
    })
    act(() => vi.advanceTimersByTime(0))
    expect(result.current?.state).toBe('before')
    // 09:30: the session was moved to 09:15, and the server says it is open.
    act(() => vi.setSystemTime(new Date('2026-10-26T09:30:00Z')))
    rerender({ w: windowFrom('2026-10-26T09:15:00Z', 'open') })
    expect(result.current?.state).toBe('open')
    act(() => vi.advanceTimersByTime(0))
    expect(result.current?.state).toBe('open')
  })
})
