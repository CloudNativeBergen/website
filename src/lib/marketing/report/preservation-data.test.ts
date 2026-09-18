import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import type { Conference } from '@/lib/conference/types'
import { exportFixture } from './__tests__/export-fixture'
const fetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sanity/client', () => ({ clientReadUncached: { fetch } }))
vi.mock('../sanity', () => ({ getPlanView: vi.fn(async () => null) }))
vi.mock('../snapshots', () => ({ conferenceOrgId: vi.fn(async () => null) }))
import { loadReport } from './data'

describe('preserved report data', () => {
  it('projects preserved metadata and includes pre-edition retired observations after deletion', async () => {
    const base = exportFixture().snapshots[0]
    const dataset = [
      {
        ...base,
        campaignKey: 'retired',
        campaignTitle: 'Old title',
        campaignPrimaryOutcome: 'cfpSubmissions',
        campaignTarget: 250,
        campaignStartDate: '2026-06-01',
        campaignEndDate: '2026-06-30',
        perTask: [{ ...base.perTask[0], taskKey: 'launch' }],
      },
      {
        ...base,
        _id: 'foreign',
        conference: { _type: 'reference', _ref: 'other' },
        primaryOutcomeValue: 999,
      },
    ]
    fetch.mockImplementation(
      async (query: string, params: Record<string, unknown>) =>
        (await evaluate(parse(query), { dataset, params })).get(),
    )
    const report = await loadReport(
      {
        _id: 'conference-a',
        title: 'Current',
        startDate: '2027-01-01',
      } as Conference,
      {},
    )
    expect(report.range.from).toBe('2026-06-16')
    expect(
      report.snapshots.map((s) => [
        s.campaignKey,
        s.campaignTarget,
        s.perTask[0].taskKey,
      ]),
    ).toEqual([['retired', 250, 'launch']])
    expect(report.breakdown).toMatchObject([
      {
        title: 'Old title',
        primaryOutcome: 'cfpSubmissions',
        value: 137,
        retired: true,
      },
    ])
    expect(report.summary).toEqual([])
  })
})
