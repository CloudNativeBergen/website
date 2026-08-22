/**
 * @vitest-environment jsdom
 *
 * A POLL MUST NOT OUTLIVE THE PERSON WATCHING IT.
 *
 * React Query stops polling a BACKGROUNDED tab on its own. The failure mode it
 * cannot see is a tab that is focused and on screen but abandoned — which in
 * production meant one client polling `/admin/messages/<id>` continuously from
 * 21 Aug 07:04 UTC, at roughly 4,800 Sanity reads an hour.
 *
 * The stop is the cheap half. The half that has to be right is the RESUME:
 * idle-stopping is only safe if it is invisible to someone actually using the
 * page, so every wake path is tested here, not just the sleep path — including
 * that a freshly mounted poll can never inherit a stale idle state and sit
 * there forever looking like a broken inbox.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useIdlePolling, POLL_IDLE_AFTER_MS } from '@/hooks/useIdlePolling'

const INTERVAL = 20_000
/** Long enough to cross the threshold AND the next idleness check. */
const PAST_IDLE = POLL_IDLE_AFTER_MS + 60_000

let visibility: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibility,
})

function Harness({
  enabled = true,
  onResume,
}: {
  enabled?: boolean
  onResume?: () => void
}) {
  const interval = useIdlePolling({ intervalMs: INTERVAL, enabled, onResume })
  return <span data-testid="interval">{String(interval)}</span>
}

const interval = () => screen.getByTestId('interval').textContent

/** Let the page go idle: no events, just time. */
const goIdle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PAST_IDLE)
  })
}

const fire = async (event: Event) => {
  await act(async () => {
    window.dispatchEvent(event)
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useIdlePolling — stopping', () => {
  it('polls at the requested cadence while the user is present', () => {
    render(<Harness />)
    expect(interval()).toBe(String(INTERVAL))
  })

  it('withdraws the interval after five minutes with no interaction', async () => {
    render(<Harness />)
    await goIdle()
    expect(interval()).toBe('false')
  })

  it('keeps polling through a long session as long as the user keeps moving', async () => {
    render(<Harness />)
    // Twenty minutes of a reader who scrolls every couple of minutes.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * 60_000)
      })
      await fire(new Event('scroll'))
      expect(interval()).toBe(String(INTERVAL))
    }
  })

  it('leaves the caller own gate in charge: a disabled poll stays off', () => {
    render(<Harness enabled={false} />)
    expect(interval()).toBe('false')
  })
})

describe('useIdlePolling — resuming', () => {
  it('resumes AND refetches on a keypress', async () => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    await goIdle()
    expect(interval()).toBe('false')
    expect(onResume).not.toHaveBeenCalled()

    await fire(new KeyboardEvent('keydown', { key: 'a' }))

    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['pointermove', () => new Event('pointermove')],
    ['pointerdown', () => new Event('pointerdown')],
    ['wheel', () => new Event('wheel')],
    ['touchstart', () => new Event('touchstart')],
    ['scroll', () => new Event('scroll')],
    ['focus', () => new Event('focus')],
  ])('resumes on %s too', async (_name, make) => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    await goIdle()

    await fire(make())

    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('resumes when the tab is brought back to the foreground', async () => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    visibility = 'hidden'
    await goIdle()
    expect(interval()).toBe('false')

    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('does NOT treat the tab going away as activity', async () => {
    render(<Harness />)
    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(PAST_IDLE)
    })
    expect(interval()).toBe('false')
  })

  it('refetches when a hidden pane becomes visible again', async () => {
    const onResume = vi.fn()
    const { rerender } = render(<Harness enabled={false} onResume={onResume} />)
    expect(interval()).toBe('false')
    expect(onResume).not.toHaveBeenCalled()

    rerender(<Harness enabled onResume={onResume} />)

    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('does not refetch on mount — the query own mount fetch covers that', () => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    expect(onResume).not.toHaveBeenCalled()
  })

  it('does not refetch while the user simply keeps working', async () => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      await fire(new Event('pointermove'))
    }
    expect(onResume).not.toHaveBeenCalled()
    expect(interval()).toBe(String(INTERVAL))
  })
})

/**
 * "Never resumes" would read to a user as a broken inbox, so the two ways it
 * could happen are pinned down explicitly.
 */
describe('useIdlePolling — it cannot deadlock', () => {
  it('a poll mounted after an idle stop starts RUNNING, not stopped', async () => {
    const first = render(<Harness />)
    await goIdle()
    expect(interval()).toBe('false')

    // The last subscriber leaves (navigation away) and a new one arrives with
    // no activity event in between.
    first.unmount()
    render(<Harness />)

    expect(interval()).toBe(String(INTERVAL))
  })

  it('mounts clean after an idle teardown — no phantom refetch', async () => {
    // The mirror of the test above. `useSyncExternalStore` reads the snapshot
    // during RENDER, before `subscribe` runs, so an idle state left lying
    // around is seen by the new poll's first render; correcting it afterwards
    // would look like an OFF→ON transition and fire a refetch nobody asked for.
    const first = render(<Harness />)
    await goIdle()
    first.unmount()

    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).not.toHaveBeenCalled()
  })

  it('goes idle again after resuming, so the guard is not one-shot', async () => {
    const onResume = vi.fn()
    render(<Harness onResume={onResume} />)

    await goIdle()
    await fire(new KeyboardEvent('keydown', { key: 'a' }))
    expect(interval()).toBe(String(INTERVAL))

    await goIdle()
    expect(interval()).toBe('false')

    await fire(new KeyboardEvent('keydown', { key: 'b' }))
    expect(interval()).toBe(String(INTERVAL))
    expect(onResume).toHaveBeenCalledTimes(2)
  })

  it('keeps every subscriber in lockstep (the bell and the badge cannot disagree)', async () => {
    render(
      <>
        <Harness />
        <Harness />
      </>,
    )
    const values = () =>
      screen.getAllByTestId('interval').map((el) => el.textContent)

    expect(values()).toEqual([String(INTERVAL), String(INTERVAL)])
    await goIdle()
    expect(values()).toEqual(['false', 'false'])
    await fire(new Event('pointermove'))
    expect(values()).toEqual([String(INTERVAL), String(INTERVAL)])
  })
})
