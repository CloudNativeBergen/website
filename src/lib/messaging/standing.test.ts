import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

import { speakerHasStandingInConference } from './standing'

beforeEach(() => vi.clearAllMocks())

/** First fetch resolves the conference's org; second runs the standing query. */
function primeFetches(orgId: string | null, standingId: string | null) {
  fetchMock
    .mockResolvedValueOnce(orgId) // conference.organization._ref
    .mockResolvedValueOnce(standingId) // standing predicate
}

describe('speakerHasStandingInConference — org scoping (E9)', () => {
  it('scopes the organizer arm to the conference’s owning org', async () => {
    primeFetches('org-A', 'spk-1')

    const ok = await speakerHasStandingInConference('spk-1', 'conf-1')

    expect(ok).toBe(true)
    const [query, params] = fetchMock.mock.calls[1]
    // The organizer arm is org-scoped, and the org id is bound.
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toMatchObject({
      speakerId: 'spk-1',
      conferenceId: 'conf-1',
      orgId: 'org-A',
    })
  })

  it('does NOT match cross-tenant organizers (org-scoped predicate returns null)', async () => {
    // A cross-org organizer fails the org-scoped organizer arm and has no talk
    // here → the predicate resolves to null → no standing.
    primeFetches('org-A', null)
    expect(await speakerHasStandingInConference('spk-b', 'conf-1')).toBe(false)
  })

  it('falls back to the GLOBAL organizer scope with a warn for an org-less conference', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    primeFetches(null, 'spk-1')

    const ok = await speakerHasStandingInConference('spk-1', 'legacy-conf')

    expect(ok).toBe(true)
    const [query, params] = fetchMock.mock.calls[1]
    expect(query).not.toContain('organization._ref == $orgId')
    expect(query).toContain('*[_type == "conference"].organizers[]._ref')
    expect(params).not.toHaveProperty('orgId')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
