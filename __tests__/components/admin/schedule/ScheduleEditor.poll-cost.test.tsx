/**
 * @vitest-environment jsdom
 *
 * THE COST CONTRACT OF THE SCHEDULE EDITOR'S POLLING.
 *
 * An open schedule editor was the most expensive client in the product: TWO
 * procedures (batched into one HTTP call, billed by Sanity as two reads) every
 * ten seconds, forever, whether or not anyone was at the keyboard — ~86k reads
 * a month per editor that stays open during a work day.
 *
 * The contract, in three halves:
 *
 *  1. ONE polled query — `schedule.admin.pollExternalChanges` — and nothing
 *     else on a timer. The talk statuses ride the same poll as a fingerprint.
 *  2. At `SCHEDULE_POLL_MS` (60s). This poll only ever reports what OTHER
 *     organizers did; the user's own edits are local and their own saves patch
 *     the polled baseline directly.
 *  3. It STOPS when nobody is interacting and resumes with an immediate
 *     invalidate — the shared `useIdlePolling` mechanism from #919, not a
 *     second implementation of it.
 *
 * The statuses query's no-request-while-unchanged property lives in react-query
 * rather than in our code, so the last block proves it against the REAL library.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { SCHEDULE_POLL_MS } from '@/lib/schedule/constants'
import { POLL_IDLE_AFTER_MS } from '@/hooks/useIdlePolling'
import { ConferenceSchedule, Conference } from '@/lib/conference/types'
import { toEditorSchedule, ScheduleStatus } from '@/lib/schedule/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'

/** Every `useQuery` the editor sets up, in render order. */
interface RecordedQuery {
  proc: string
  input: unknown
  refetchInterval: unknown
  refetchOnWindowFocus: unknown
  enabled: boolean
}
const queries: RecordedQuery[] = []

/** What the poll currently "returns"; cases move the fingerprint. */
const pollResult = {
  current: {
    schedules: [] as { _id: string; _rev: string; version: number }[],
    proposalsFingerprint: 'fp-1',
  },
}

function recorder(proc: string, data: () => unknown) {
  return (
    input?: unknown,
    opts?: {
      refetchInterval?: unknown
      refetchOnWindowFocus?: unknown
      enabled?: boolean
    },
  ) => {
    queries.push({
      proc,
      input,
      refetchInterval: opts?.refetchInterval,
      refetchOnWindowFocus: opts?.refetchOnWindowFocus,
      enabled: opts?.enabled !== false,
    })
    return { data: data() }
  }
}

const pollInvalidate = vi.fn()
const pollSetData = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      schedule: {
        admin: {
          pollExternalChanges: {
            invalidate: pollInvalidate,
            setData: pollSetData,
          },
        },
      },
    }),
    schedule: {
      save: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      action: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      admin: {
        pollExternalChanges: {
          useQuery: recorder(
            'schedule.admin.pollExternalChanges',
            () => pollResult.current,
          ),
        },
        // DELIBERATELY recordable rather than absent: if the statuses ever go
        // back on a timer, the assertions below must fail on the recorded
        // VALUE, not on a missing mock blowing up the render.
        proposalsStatus: {
          useQuery: recorder('schedule.admin.proposalsStatus', () => undefined),
        },
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
)

import { ScheduleEditor } from '@/components/admin/schedule/ScheduleEditor'

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const proposal: ProposalExisting = {
  _id: 'talk-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Keynote',
  description: [],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.confirmed,
  outline: '',
  topics: [],
  tos: true,
  speakers: [],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
}

const draftDay: ConferenceSchedule = {
  _id: 'draft-1',
  _rev: 'rev-1',
  date: '2026-09-01',
  status: 'draft',
  tracks: [
    {
      trackTitle: 'Main Stage',
      trackDescription: '',
      talks: [{ talk: proposal, startTime: '10:00', endTime: '10:45' }],
    },
  ],
} as ConferenceSchedule

const officialDay: ConferenceSchedule = {
  ...draftDay,
  _id: 'official-1',
  _rev: 'official-rev-1',
  status: ScheduleStatus.Official,
}

const conference = { _id: 'conf-1' } as Conference

/**
 * A FRESH element every time. React bails out of re-rendering a subtree handed
 * the referentially identical element, so a shared constant would make the
 * re-key case below pass without the component ever running again.
 */
const editor = () => (
  <ScheduleEditor
    officialSchedules={[toEditorSchedule(officialDay)]}
    draftSchedules={[toEditorSchedule(draftDay)]}
    conference={conference}
    initialProposals={[proposal]}
  />
)

/** The queries that actually cost a request on a timer. */
const polled = () =>
  queries.filter((q) => q.enabled && typeof q.refetchInterval === 'number')

const latestOf = (proc: string) => queries.filter((q) => q.proc === proc).at(-1)

beforeEach(() => {
  queries.length = 0
  pollInvalidate.mockClear()
  pollSetData.mockClear()
  pollResult.current = { schedules: [], proposalsFingerprint: 'fp-1' }
})

afterEach(() => {
  cleanup()
})

describe('an open schedule editor costs exactly one polled query', () => {
  it('polls pollExternalChanges and nothing else', () => {
    render(editor())

    expect([...new Set(polled().map((q) => q.proc))]).toEqual([
      'schedule.admin.pollExternalChanges',
    ])
  })

  it('polls it once a minute (NOT the old 10s)', () => {
    render(editor())

    expect(polled()[0].refetchInterval).toBe(SCHEDULE_POLL_MS)
    expect(SCHEDULE_POLL_MS).toBe(60_000)
  })

  it('refetches on window focus, so a longer interval is not a staler tab', () => {
    // The provider default is `false`; a tab that has been backgrounded runs no
    // interval at all, so without this the editor could show a minute-old
    // conflict state on return.
    render(editor())

    expect(
      latestOf('schedule.admin.pollExternalChanges')!.refetchOnWindowFocus,
    ).toBe(true)
  })

  it('never puts the talk statuses on a timer', () => {
    render(editor())

    const statuses = latestOf('schedule.admin.proposalsStatus')
    expect(statuses).toBeDefined()
    expect(typeof statuses!.refetchInterval).not.toBe('number')
  })

  it('keys the statuses by the fingerprint the poll returned', () => {
    render(editor())

    expect(latestOf('schedule.admin.proposalsStatus')!.input).toEqual({
      fingerprint: 'fp-1',
    })
  })

  it('re-keys them — and only then — when the fingerprint moves', () => {
    const { rerender } = render(editor())
    expect(latestOf('schedule.admin.proposalsStatus')!.input).toEqual({
      fingerprint: 'fp-1',
    })

    // A poll tick that found nothing new: same key, so react-query serves the
    // cache and no request leaves the browser (proved against the library
    // below).
    pollResult.current = { ...pollResult.current }
    rerender(editor())
    expect(latestOf('schedule.admin.proposalsStatus')!.input).toEqual({
      fingerprint: 'fp-1',
    })

    // Somebody accepted a proposal: new key, one fetch.
    pollResult.current = { schedules: [], proposalsFingerprint: 'fp-2' }
    rerender(editor())
    expect(latestOf('schedule.admin.proposalsStatus')!.input).toEqual({
      fingerprint: 'fp-2',
    })
  })
})

/**
 * THE EDITOR LEFT OPEN ON A MONITOR. This is the production failure mode: a
 * schedule editor open on a second screen polled all week.
 */
describe('the editor stops polling when nobody is there', () => {
  const currentInterval = () =>
    latestOf('schedule.admin.pollExternalChanges')?.refetchInterval

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('withdraws the interval after the idle threshold', async () => {
    render(editor())
    expect(currentInterval()).toBe(SCHEDULE_POLL_MS)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_AFTER_MS + 60_000)
    })

    expect(currentInterval()).toBe(false)
  })

  it('resumes AND refetches the moment the organizer comes back', async () => {
    render(editor())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_AFTER_MS + 60_000)
    })
    expect(currentInterval()).toBe(false)
    expect(pollInvalidate).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
      await vi.advanceTimersByTimeAsync(0)
    })

    // Both halves: the timer is back AND the editor is not left showing the
    // schedule as it was before the user walked away.
    expect(currentInterval()).toBe(SCHEDULE_POLL_MS)
    expect(pollInvalidate).toHaveBeenCalledTimes(1)
  })

  it('does not fire a phantom refetch on mount', async () => {
    // `useIdlePolling` must not report an OFF→ON transition for a fresh mount;
    // an editor that invalidated on every mount would cost the request the idle
    // gate just saved.
    render(editor())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(pollInvalidate).not.toHaveBeenCalled()
  })
})

/**
 * The half of the contract that lives in the LIBRARY. A mock of react-query
 * would be no evidence about react-query.
 */
describe('react-query serves an unchanged fingerprint from cache', () => {
  const observe = (
    client: QueryClient,
    fingerprint: string,
    queryFn: () => Promise<unknown>,
  ) =>
    new QueryObserver(client, {
      queryKey: ['schedule.admin.proposalsStatus', { fingerprint }],
      queryFn,
      staleTime: Infinity,
    }).subscribe(() => {})

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches once per DISTINCT fingerprint, and never for a repeat', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi.fn(async () => [])

    const first = observe(client, 'fp-1', queryFn)
    await vi.advanceTimersByTimeAsync(1)
    expect(queryFn).toHaveBeenCalledTimes(1)
    first()

    // Sixty ticks of "nothing changed" — the old code paid for every one.
    for (let i = 0; i < 60; i++) {
      const again = observe(client, 'fp-1', queryFn)
      await vi.advanceTimersByTimeAsync(1)
      again()
    }
    expect(queryFn).toHaveBeenCalledTimes(1)

    const moved = observe(client, 'fp-2', queryFn)
    await vi.advanceTimersByTimeAsync(1)
    expect(queryFn).toHaveBeenCalledTimes(2)
    moved()
  })
})
