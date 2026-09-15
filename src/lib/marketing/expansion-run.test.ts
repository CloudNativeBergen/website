/**
 * @vitest-environment node
 */
const h = vi.hoisted(() => ({
  getPlannedConferences: vi.fn(),
  getRecentlySignedSponsorIds: vi.fn(),
  getSignedSponsorSubject: vi.fn(),
  getSubjectList: vi.fn(),
  markPlanExpanded: vi.fn(),
  runGeneration: vi.fn(async () => ({ created: 0, warnings: [] })),
}))
vi.mock('./generation-sanity', () => ({
  getPlannedConferences: h.getPlannedConferences,
  getRecentlySignedSponsorIds: h.getRecentlySignedSponsorIds,
  getSignedSponsorSubject: h.getSignedSponsorSubject,
  getSubjectList: h.getSubjectList,
  markPlanExpanded: h.markPlanExpanded,
}))
vi.mock('./generation', () => ({ runGeneration: h.runGeneration }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveExpansionConferences, runPlanExpansion } from './expansion-run'

beforeEach(() => vi.clearAllMocks())

describe('resolveExpansionConferences', () => {
  it('keeps editions until the video drip closes, the longest-waiting first', async () => {
    h.getPlannedConferences.mockResolvedValue([
      // Ended long ago: recordings fallback end+14, drip +21 → closed 2027-01-05.
      {
        planId: 'plan-old',
        conferenceId: 'old',
        startDate: '2026-11-30',
        endDate: '2026-12-01',
        recordingsLiveDate: null,
        lastExpandedAt: null,
      },
      {
        planId: 'plan-late',
        conferenceId: 'late',
        startDate: '2027-06-10',
        endDate: '2027-06-11',
        recordingsLiveDate: null,
        lastExpandedAt: '2027-02-14T05:30:00.000Z',
      },
      {
        planId: 'plan-soon',
        conferenceId: 'soon',
        startDate: '2027-03-01',
        endDate: '2027-03-02',
        recordingsLiveDate: null,
        lastExpandedAt: '2027-02-15T05:30:00.000Z',
      },
      // Recordings set late keep the edition in; never expanded, so first.
      {
        planId: 'plan-recorded',
        conferenceId: 'recorded',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        recordingsLiveDate: '2027-02-01',
        lastExpandedAt: null,
      },
      {
        planId: 'plan-undated',
        conferenceId: 'undated',
        startDate: null,
        endDate: null,
        recordingsLiveDate: null,
        lastExpandedAt: null,
      },
    ])
    expect(await resolveExpansionConferences('2027-02-15')).toEqual([
      { planId: 'plan-recorded', conferenceId: 'recorded' },
      { planId: 'plan-late', conferenceId: 'late' },
      { planId: 'plan-soon', conferenceId: 'soon' },
    ])
  })
})

describe('runPlanExpansion', () => {
  const NOW = '2027-04-10T05:30:00.000Z'

  it('asks for every non-empty subject list and the recently signed sponsors', async () => {
    const ada = { _id: 'sp-ada', type: 'speaker', values: {} }
    const acme = { _id: 'sponsor-acme', type: 'sponsor', values: {} }
    h.getSubjectList.mockImplementation(async (_c: string, list: string) =>
      list === 'confirmedSpeakers' ? [ada] : [],
    )
    h.getRecentlySignedSponsorIds.mockResolvedValue(['sfc-1', 'sfc-2'])
    h.getSignedSponsorSubject.mockImplementation(
      async (_c: string, id: string) => (id === 'sfc-1' ? acme : null),
    )
    await runPlanExpansion(
      { planId: 'marketingPlan.conf-A', conferenceId: 'conf-A' },
      NOW,
    )
    expect(h.getRecentlySignedSponsorIds).toHaveBeenCalledWith(
      'conf-A',
      '2027-04-03T05:30:00.000Z',
    )
    expect(h.runGeneration).toHaveBeenCalledWith(
      'conf-A',
      [
        { kind: 'expansion', list: 'confirmedSpeakers', subjects: [ada] },
        { kind: 'trigger', event: 'sponsorSigned', subjects: [acme] },
      ],
      NOW,
    )
  })

  it("stamps the plan document's own id before the run, so a failure cannot block the queue", async () => {
    h.getSubjectList.mockResolvedValue([])
    h.getRecentlySignedSponsorIds.mockResolvedValue([])
    await runPlanExpansion(
      { planId: 'marketingPlan.conf-A', conferenceId: 'conf-A' },
      NOW,
    )
    expect(h.markPlanExpanded).toHaveBeenCalledWith('marketingPlan.conf-A', NOW)
  })

  it('generates nothing when there is nothing to expand', async () => {
    h.getSubjectList.mockResolvedValue([])
    h.getRecentlySignedSponsorIds.mockResolvedValue([])
    expect(
      await runPlanExpansion(
        { planId: 'marketingPlan.conf-A', conferenceId: 'conf-A' },
        NOW,
      ),
    ).toEqual({
      created: 0,
      warnings: [],
    })
    expect(h.runGeneration).not.toHaveBeenCalled()
  })
})
