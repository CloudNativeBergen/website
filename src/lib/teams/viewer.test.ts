import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConferenceTeamsMock = vi.fn()
vi.mock('@/lib/teams/sanity', () => ({
  getConferenceTeams: (id: string) => getConferenceTeamsMock(id),
}))

import { getViewerTeamLens, getViewerTeamKeys } from '@/lib/teams/viewer'

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceTeamsMock.mockResolvedValue([
    { key: 'cfp', title: 'Programme', members: ['org-1', 'org-2'] },
    { key: 'sponsors', title: 'Sales', members: ['org-2'] },
  ])
})

describe('getViewerTeamLens', () => {
  it('returns every team key+title and the caller-owned keys', async () => {
    const lens = await getViewerTeamLens('conf-1', 'org-2')
    expect(lens.teams).toEqual([
      { key: 'cfp', title: 'Programme' },
      { key: 'sponsors', title: 'Sales' },
    ])
    expect(lens.myTeamKeys).toEqual(['cfp', 'sponsors'])
  })

  it('returns empty myTeamKeys for a caller on no team (inert lens)', async () => {
    const lens = await getViewerTeamLens('conf-1', 'org-99')
    expect(lens.teams).toHaveLength(2)
    expect(lens.myTeamKeys).toEqual([])
  })
})

describe('getViewerTeamKeys', () => {
  it('returns only the keys of teams the caller belongs to', async () => {
    expect(await getViewerTeamKeys('conf-1', 'org-1')).toEqual(['cfp'])
    expect(await getViewerTeamKeys('conf-1', 'org-2')).toEqual([
      'cfp',
      'sponsors',
    ])
  })
})
