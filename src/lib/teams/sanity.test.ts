import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { getConferenceTeams, clearConferenceTeamsCache } from './sanity'

beforeEach(() => {
  clearConferenceTeamsCache()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

const TEAM_ROWS = [
  {
    _key: 'a',
    key: 'cfp',
    title: 'CFP',
    slackChannel: '#cfp',
    emailIdentity: ['cfpEmail'],
    members: ['spk-1', 'spk-2'],
  },
]

describe('getConferenceTeams', () => {
  it('returns the resolved teams with members as speaker ids', async () => {
    fetchMock.mockResolvedValueOnce(TEAM_ROWS)
    const teams = await getConferenceTeams('conf-1')
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toEqual(['spk-1', 'spk-2'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // conference id is passed as a bound param, never interpolated
    expect(fetchMock.mock.calls[0][1]).toEqual({ conferenceId: 'conf-1' })
  })

  it('returns [] when the conference has no teams (absent = today)', async () => {
    fetchMock.mockResolvedValueOnce(null)
    expect(await getConferenceTeams('conf-x')).toEqual([])
  })

  it('normalizes a missing members array to []', async () => {
    fetchMock.mockResolvedValueOnce([
      { _key: 'b', key: 'volunteers', title: 'Volunteers' },
    ])
    const teams = await getConferenceTeams('conf-2')
    expect(teams[0].members).toEqual([])
  })

  it('caches successes per conference within the TTL (one read per instance)', async () => {
    fetchMock.mockResolvedValue(TEAM_ROWS)
    await getConferenceTeams('conf-1')
    await getConferenceTeams('conf-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches per conference id independently', async () => {
    fetchMock.mockResolvedValue(TEAM_ROWS)
    await getConferenceTeams('conf-1')
    await getConferenceTeams('conf-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('re-reads after the TTL expires', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(TEAM_ROWS)
    await getConferenceTeams('conf-1')
    vi.advanceTimersByTime(60_001)
    await getConferenceTeams('conf-1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT cache failures — a transient error is retried, not poisoned', async () => {
    fetchMock.mockRejectedValueOnce(new Error('sanity down'))
    await expect(getConferenceTeams('conf-1')).rejects.toThrow('sanity down')
    fetchMock.mockResolvedValueOnce(TEAM_ROWS)
    const teams = await getConferenceTeams('conf-1')
    expect(teams).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
