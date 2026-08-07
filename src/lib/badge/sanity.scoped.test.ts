import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #863. `badge.admin.resendEmail` mailed whichever speaker `getBadgeById`
 * returned, and that lookup filters on the PUBLIC `badgeId` alone. The fix is
 * `getBadgeForConference`, whose predicate is the tenant boundary — so the
 * predicate itself is what has to be pinned. The router tests
 * (`src/server/routers/badge.tenancy.test.ts`) mock this function; without the
 * cases below, that mock would be the only place the conference predicate exists.
 */
const badgeFetch = vi.fn()
vi.mock('../sanity/client', () => ({
  clientRead: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientWrite: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => badgeFetch(...a) },
}))

import {
  getBadgeForConference,
  listBadgesForSpeakerInConference,
} from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getBadgeForConference is tenant-scoped at the query', () => {
  it('constrains the read to the given conference', async () => {
    badgeFetch.mockResolvedValue({ badgeId: 'b-1' })

    await getBadgeForConference('b-1', 'conf-A')

    const [query, params] = badgeFetch.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toEqual({ badgeId: 'b-1', conferenceId: 'conf-A' })
  })

  it('carries the predicate UNCONDITIONALLY', async () => {
    // The fail-open shape this must never become is a predicate guarded by its
    // own parameter (`!defined($conferenceId) || …`), which reads every tenant
    // whenever the argument is absent — `optionalTenantFilter` in
    // `eslint-rules/no-unscoped-groq.js`.
    badgeFetch.mockResolvedValue({ badgeId: 'b-1' })

    await getBadgeForConference('b-1', 'conf-A')

    const [query] = badgeFetch.mock.calls[0]
    expect(query).not.toContain('defined($conferenceId)')
  })

  it('reads NOTHING when the conference is missing', async () => {
    // An unresolved tenant has no scope to read within, so it must refuse
    // rather than issue a query that would match across tenants.
    const result = await getBadgeForConference('b-1', '')

    expect(badgeFetch).not.toHaveBeenCalled()
    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('not-found')
  })

  it('reports not-found for a badge outside the conference, like any absence', async () => {
    // The predicate does the refusing, so the caller cannot tell a foreign badge
    // from a nonexistent one — no existence oracle over other tenants' ids.
    badgeFetch.mockResolvedValue(null)

    const result = await getBadgeForConference('b-theirs', 'conf-A')

    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('not-found')
    expect(result.error?.message).toBe('Badge not found')
  })

  it('still separates a failed read from an absent badge (#848)', async () => {
    badgeFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const result = await getBadgeForConference('b-1', 'conf-A')

    expect(result.reason).toBe('unavailable')
    expect(result.reason).not.toBe('not-found')
  })
})

/**
 * #863 row 9. `badge.admin.list?speakerId=…` read through a query filtered on
 * `speaker._ref` alone. THE ROUTER TESTS CANNOT SEE THIS: they mock this
 * function, so the conference predicate would exist only in the mock — which is
 * exactly how the twelve census rows shipped. Assert it at the query.
 */
describe('listBadgesForSpeakerInConference is tenant-scoped at the query', () => {
  it('constrains the read to BOTH the speaker and the conference', async () => {
    badgeFetch.mockResolvedValue([])

    await listBadgesForSpeakerInConference('sp-1', 'conf-A')

    const [query, params] = badgeFetch.mock.calls[0]
    expect(query).toContain('speaker._ref == $speakerId')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toEqual({ speakerId: 'sp-1', conferenceId: 'conf-A' })
  })

  it('carries the conference predicate UNCONDITIONALLY', async () => {
    badgeFetch.mockResolvedValue([])

    await listBadgesForSpeakerInConference('sp-1', 'conf-A')

    const [query] = badgeFetch.mock.calls[0]
    expect(query).not.toContain('defined($conferenceId)')
  })

  it('reads NOTHING when the conference is missing', async () => {
    const result = await listBadgesForSpeakerInConference('sp-1', '')

    expect(badgeFetch).not.toHaveBeenCalled()
    expect(result.badges).toEqual([])
  })

  it('reports a failed read rather than an empty list', async () => {
    badgeFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const result = await listBadgesForSpeakerInConference('sp-1', 'conf-A')

    expect(result.badges).toBeUndefined()
    expect(result.error).toBeInstanceOf(Error)
  })
})
