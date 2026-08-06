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

import { getBadgeForConference } from './sanity'

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
