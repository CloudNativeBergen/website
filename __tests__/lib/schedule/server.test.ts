/**
 * Tests for getScheduleData day-tab generation.
 *
 * Regression guard: a single-day conference with one saved schedule must NOT
 * fabricate a synthetic extra day at baseDate + 1. Day tabs must come only from
 * the real conference date range.
 */
import { getScheduleData } from '@/lib/schedule/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

const mockGetConference = vi.fn<AnyFn>()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

const mockFetch = vi.fn<AnyFn>()
vi.mock('@/lib/sanity/client', () => ({
  clientRead: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}))

const mockGetProposals = vi.fn<AnyFn>()
vi.mock('@/lib/proposal/server', () => ({
  getProposals: (...args: unknown[]) => mockGetProposals(...args),
}))

describe('getScheduleData day tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProposals.mockResolvedValue({ proposals: [], proposalsError: null })
  })

  it('does not fabricate an out-of-range day for a single-day conference', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        startDate: '2026-03-10',
        endDate: '2026-03-10',
        schedules: [],
      },
      error: null,
    })
    mockFetch.mockResolvedValue([
      { _id: 'sched-1', date: '2026-03-10', tracks: [], status: 'official' },
    ])

    const { officialSchedules, error } = await getScheduleData()

    expect(error).toBeUndefined()
    expect(officialSchedules.map((s) => s.date)).toEqual(['2026-03-10'])
  })

  it('produces exactly one tab per day in the conference range', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-2',
        startDate: '2026-03-10',
        endDate: '2026-03-12',
        schedules: [],
      },
      error: null,
    })
    mockFetch.mockResolvedValue([
      { _id: 'sched-1', date: '2026-03-11', tracks: [], status: 'official' },
    ])

    const { officialSchedules } = await getScheduleData()

    expect(officialSchedules.map((s) => s.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ])
  })

  it('strips ghost slots (dangling talk ref, no placeholder) on load', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-ghost',
        startDate: '2026-03-10',
        endDate: '2026-03-10',
        schedules: [],
      },
      error: null,
    })
    mockFetch.mockResolvedValue([
      {
        _id: 'sched-1',
        date: '2026-03-10',
        status: 'official',
        tracks: [
          {
            trackTitle: 'A',
            talks: [
              { talk: { _id: 't1' }, startTime: '09:00', endTime: '09:25' },
              { talk: null, startTime: '10:00', endTime: '10:25' },
              {
                placeholder: 'Lunch',
                startTime: '12:00',
                endTime: '13:00',
              },
            ],
          },
        ],
      },
    ])

    const { officialSchedules } = await getScheduleData()

    const talks = officialSchedules[0].tracks[0].talks
    expect(talks).toHaveLength(2)
    expect(talks.map((t) => t.talk?._id ?? t.placeholder)).toEqual([
      't1',
      'Lunch',
    ])
  })

  it('does not mutate conference.schedules in place (F8 — no fabricated days / reorder leak)', async () => {
    // A multi-day conference whose only saved day is the LAST one: fabricating
    // the earlier days and sorting would, if done in place, both grow and
    // reorder the shared cached array.
    const original = [
      { _id: 'sched-1', date: '2026-03-12', tracks: [], status: 'official' },
    ]
    const conference = {
      _id: 'conf-mut',
      startDate: '2026-03-10',
      endDate: '2026-03-12',
      schedules: original,
    }
    mockGetConference.mockResolvedValue({ conference, error: null })
    mockFetch.mockResolvedValue(original)

    const { officialSchedules } = await getScheduleData()

    // The returned view has all three days, sorted.
    expect(officialSchedules.map((s) => s.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ])

    // The input array is untouched: same reference, same single element.
    expect(conference.schedules).toBe(original)
    expect(conference.schedules).toHaveLength(1)
    expect(conference.schedules[0].date).toBe('2026-03-12')
  })

  it('never returns a day outside the conference date range', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-3',
        startDate: '2026-03-10',
        endDate: '2026-03-11',
        schedules: [],
      },
      error: null,
    })
    mockFetch.mockResolvedValue([
      { _id: 'sched-1', date: '2026-03-10', tracks: [], status: 'official' },
      { _id: 'sched-2', date: '2026-03-11', tracks: [], status: 'official' },
    ])

    const { officialSchedules } = await getScheduleData()

    for (const s of officialSchedules) {
      expect(s.date >= '2026-03-10' && s.date <= '2026-03-11').toBe(true)
    }
    expect(officialSchedules).toHaveLength(2)
  })
})
