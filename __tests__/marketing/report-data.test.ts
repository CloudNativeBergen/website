import { getPlanView } from '@/lib/marketing/sanity'
import { getCopySources } from '@/lib/marketing/copy-sanity'
import { conferenceOrgId } from '@/lib/marketing/snapshots'
import type { ReportSnapshot } from '@/lib/marketing/report/types'
import type { Conference } from '@/lib/conference/types'
import { describe, it, expect, vi } from 'vitest'
const fetch = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
)
vi.mock('@/lib/sanity/client', () => ({ clientReadUncached: { fetch } }))
vi.mock('@/lib/marketing/sanity', () => ({ getPlanView: vi.fn() }))
vi.mock('@/lib/marketing/snapshots', () => ({ conferenceOrgId: vi.fn() }))
vi.mock('@/lib/marketing/copy-sanity', () => ({ getCopySources: vi.fn() }))
vi.mock('@/lib/marketing/milestones', () => ({
  resolveAllMilestones: () => ({}),
}))
import {
  loadReport,
  previousSource,
  readReportSnapshots,
} from '@/lib/marketing/report/data'

describe('report data boundaries', () => {
  it('refuses a loader without a resolved conference', async () => {
    vi.mocked(getPlanView).mockImplementation(async () => {
      throw new Error('Plan read succeeded before scope validation')
    })
    await expect(loadReport({ _id: '' } as Conference, {})).rejects.toThrow(
      'Report requires a conference scope',
    )
    expect(getPlanView).toHaveBeenCalledTimes(0)
    vi.mocked(getPlanView).mockReset()
  })
  it('refuses an empty scope before reading, while a valid scope succeeds', async () => {
    fetch.mockClear()
    await expect(
      readReportSnapshots('', '2026-01-01', '2027-01-01'),
    ).rejects.toThrow('Report requires a conference scope')
    expect(fetch).toHaveBeenCalledTimes(0)
    await expect(
      readReportSnapshots('conference', '2026-01-01', '2027-01-01'),
    ).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]).toEqual([
      expect.stringContaining('conference._ref == $conferenceId'),
      { conferenceId: 'conference', from: '2026-01-01', to: '2027-01-01' },
      { cache: 'no-store' },
    ])
  })
  it('selects the newest earlier edition even when future editions come first', () => {
    const sources = ['2027-06-01', '2025-06-01', '2024-06-01'].map(
      (startDate) => ({
        planId: startDate,
        conferenceId: startDate,
        conferenceTitle: startDate,
        startDate,
        campaigns: 1,
        tasks: 1,
      }),
    )
    expect(previousSource(sources, '2026-06-01')?.conferenceId).toBe(
      '2025-06-01',
    )
    expect(previousSource(sources, '2023-06-01')).toBeNull()
  })
})

describe('previous edition observation completeness', () => {
  it.each([
    {
      name: 'current stops on the penultimate day',
      currentDate: '2026-09-09',
      previousDate: '2025-09-10',
      previousValue: 80,
      previousEarlierValue: false,
    },
    {
      name: 'previous stops on the penultimate day',
      currentDate: '2026-09-10',
      previousDate: '2025-09-09',
      previousValue: 80,
      previousEarlierValue: false,
    },
    {
      name: 'previous final day is null after a measured penultimate day',
      currentDate: '2026-09-10',
      previousDate: '2025-09-10',
      previousValue: null,
      previousEarlierValue: true,
    },
    {
      name: 'previous final day has never been measured',
      currentDate: '2026-09-10',
      previousDate: '2025-09-10',
      previousValue: null,
      previousEarlierValue: false,
    },
  ])(
    'rejects comparison when $name',
    async ({
      currentDate,
      previousDate,
      previousValue,
      previousEarlierValue,
    }) => {
      const campaign = {
        _id: 'campaign',
        key: 'cfp',
        title: 'CFP',
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        startMilestone: 'CFP_OPEN' as const,
        endMilestone: 'CFP_CLOSE' as const,
        provisional: false,
        primaryOutcome: 'cfpSubmissions' as const,
        target: 100,
        optional: false,
      }
      const plan = {
        plan: {
          _id: 'plan',
          ownerId: null,
          ownerName: null,
          templateVersion: '1',
          copiedFromTitle: null,
          createdAt: '',
        },
        campaigns: [campaign],
        tasks: [],
      }
      vi.mocked(getPlanView).mockImplementation(async (id) =>
        id === 'current'
          ? plan
          : {
              ...plan,
              campaigns: [
                { ...campaign, startDate: '2025-09-01', endDate: '2025-09-10' },
              ],
            },
      )
      vi.mocked(conferenceOrgId).mockResolvedValue('org')
      vi.mocked(getCopySources).mockResolvedValue([
        {
          conferenceId: 'prior',
          conferenceTitle: 'Prior',
          planId: 'prior-plan',
          startDate: '2025-10-01',
          campaigns: 1,
          tasks: 0,
        },
      ])
      const snapshot = (date: string, id: string): ReportSnapshot => ({
        _id: id,
        _type: 'marketingSnapshot',
        campaign: { _type: 'reference', _ref: 'campaign' },
        conference: { _type: 'reference', _ref: id },
        date,
        takenAt: date + 'T12:00:00Z',
        primaryOutcomeValue: id === 'current' ? 100 : 80,
        primaryOutcomeAttributed: true,
        primaryOutcomeAttributedValue: null,
        secondary: {
          attributedSessions: null,
          checkoutClickThrough: null,
          blueskyInteractions: null,
        },
        perTask: [],
        source: { posthog: 'ok', bluesky: 'ok' },
      })
      const conference = {
        _id: 'current',
        title: 'Current',
        startDate: '2026-10-01',
      } as Conference
      // `loadReport` makes TWO reads per edition: the observation-date bounds
      // (one field, no range parameters) and then the documents for the
      // resolved range. The fake has to tell them apart the way the dataset
      // does, or the bounds read hands `reportRange` whole documents.
      const respond =
        (rows: (id: string) => ReportSnapshot[]) =>
        async (...args: unknown[]) => {
          const params = args[1] as Record<string, unknown> | undefined
          const all = rows(params?.conferenceId as string)
          return params?.from === undefined ? all.map((s) => s.date) : all
        }
      fetch.mockImplementation(
        respond((id) =>
          id === 'current'
            ? [snapshot(currentDate, id)]
            : [
                ...(previousEarlierValue ? [snapshot('2025-09-09', id)] : []),
                {
                  ...snapshot(previousDate, id),
                  primaryOutcomeValue: previousValue,
                },
              ],
        ),
      )
      fetch.mockClear()
      const incomplete = await loadReport(conference, {})
      // BOTH editions get their observation-date bounds read. The prior range
      // was built from its surviving Campaign windows alone, so a preserved
      // reading outside them — after that plan was reseeded, or a window moved
      // — fell outside the fetched range and this comparison reported it
      // missing, while the previous edition's own report showed it.
      expect(
        fetch.mock.calls
          .filter(([, p]) => (p as Record<string, unknown>)?.from === undefined)
          .map(([, p]) => (p as { conferenceId: string }).conferenceId),
      ).toEqual(['current', 'prior'])
      expect(incomplete.previousEdition?.campaigns[0]).toMatchObject({
        current: 100,
        previous: previousEarlierValue ? 80 : previousValue,
        comparable: false,
        reason: 'Both Campaign windows must have complete observations',
      })
      fetch.mockImplementation(
        respond((id) => [
          snapshot(id === 'current' ? '2026-09-10' : '2025-09-10', id),
        ]),
      )
      const complete = await loadReport(conference, {})
      expect(complete.previousEdition?.campaigns[0]).toMatchObject({
        current: 100,
        previous: 80,
        comparable: true,
        reason: null,
      })
    },
  )
})
