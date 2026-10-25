import { describe, it, expect, vi } from 'vitest'
import { loadDashboardBriefing } from './dashboardBriefing'
import type { Conference } from '@/lib/conference/types'
import { Format, Status, type ProposalExisting } from '@/lib/proposal/types'

const conference = {
  _id: 'conf-1',
  startDate: '2026-10-27',
  endDate: '2026-10-28',
} as Conference

const proposals = [
  {
    _id: 'p1',
    title: 'Talk',
    status: Status.confirmed,
    format: Format.presentation_25,
  },
] as ProposalExisting[]

const dinner = (startsAt: string) => async () => ({
  speakerInfo: { dinner: { startsAt, venueName: 'Bryggen' } },
})

const base = {
  conference,
  currentConferenceId: 'conf-1',
  isOver: false,
  proposals,
  speakerId: 's1',
}

describe('loadDashboardBriefing', () => {
  it('reads only for the current, running edition with a confirmed talk', async () => {
    const fetchFields = vi.fn(async () => null)
    expect(
      await loadDashboardBriefing({
        ...base,
        currentConferenceId: 'other',
        fetchFields,
      }),
    ).toBeUndefined()
    expect(
      await loadDashboardBriefing({ ...base, isOver: true, fetchFields }),
    ).toBeUndefined()
    expect(
      await loadDashboardBriefing({
        ...base,
        proposals: [{ ...proposals[0], status: Status.accepted }],
        fetchFields,
      }),
    ).toBeUndefined()
    expect(fetchFields).not.toHaveBeenCalled()
    expect(await loadDashboardBriefing({ ...base, fetchFields })).toBeDefined()
    expect(fetchFields).toHaveBeenCalledWith('conf-1')
  })

  it('still returns a briefing when the live read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadDashboardBriefing({
      ...base,
      fetchFields: async () => {
        throw new Error('sanity down')
      },
    })
    expect(result?.briefing.talks).toHaveLength(1)
  })

  it('does not throw on an invalid dinner start; pins on conference days', async () => {
    const run = (now: string) =>
      loadDashboardBriefing({
        ...base,
        fetchFields: dinner('not a date'),
        now: new Date(now),
      })
    expect((await run('2026-10-20T12:00:00Z'))?.pinDinner).toBe(false)
    expect((await run('2026-10-27T12:00:00Z'))?.pinDinner).toBe(true)
  })

  it('pins the dinner for its whole Oslo day across the DST change', async () => {
    // 26 Oct 2026 17:00 Oslo (CET, after DST ended on 25 Oct) = 16:00Z.
    const run = async (now: string) =>
      (
        await loadDashboardBriefing({
          ...base,
          fetchFields: dinner('2026-10-26T16:00:00Z'),
          now: new Date(now),
        })
      )?.pinDinner
    expect(await run('2026-10-25T22:30:00Z')).toBe(false) // 25 Oct 23:30 Oslo
    expect(await run('2026-10-25T23:30:00Z')).toBe(true) // 26 Oct 00:30 Oslo
    expect(await run('2026-10-26T22:30:00Z')).toBe(true) // after the dinner
    expect(await run('2026-10-26T23:30:00Z')).toBe(false) // 27 Oct 00:30 Oslo
  })
})

describe('loadDashboardBriefing dinner choice', () => {
  const withRoutes = async () => ({
    speakerInfo: {
      dinner: {
        venueName: 'Bryggen',
        routes: [{ _key: 'taxi', label: 'Taxi' }],
      },
    },
  })

  it('passes a current choice and reads a removed route as unset', async () => {
    const current = await loadDashboardBriefing({
      ...base,
      fetchFields: withRoutes,
      fetchDinnerChoice: async () => 'taxi',
    })
    expect(current?.dinnerChoice).toBe('taxi')
    const stale = await loadDashboardBriefing({
      ...base,
      fetchFields: withRoutes,
      fetchDinnerChoice: async () => 'hike',
    })
    expect(stale?.dinnerChoice).toBeNull()
  })

  it('skips the read without routes and hides the picker on a failed read', async () => {
    const fetchDinnerChoice = vi.fn(async () => 'own')
    const none = await loadDashboardBriefing({
      ...base,
      fetchFields: dinner('2026-10-27T18:00:00Z'),
      fetchDinnerChoice,
    })
    expect(none?.dinnerChoice).toBeUndefined()
    expect(fetchDinnerChoice).not.toHaveBeenCalled()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await loadDashboardBriefing({
      ...base,
      fetchFields: withRoutes,
      fetchDinnerChoice: async () => {
        throw new Error('down')
      },
    })
    expect(failed?.dinnerChoice).toBeUndefined()
  })
})
