import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TENANCY + INJECTION REGRESSIONS for `getAllWorkshopSignups` (#616, batch A1).
 *
 * The `signupIds`-only call path (`confirmSignup`, `batchConfirmSignups`,
 * `cancelSignup`) built `*[_type == "workshopSignup" && _id in [...]]` with NO
 * conference predicate, so an admin of one tenant could confirm another
 * tenant's signups by id — and the ids are client input.
 *
 * The same builder INTERPOLATED every filter into the GROQ source with
 * hand-rolled quoting, so a value containing a double quote escaped the string
 * literal and could rewrite the predicate, including the tenant predicate.
 */
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/proposal/data/sanity', () => ({ getWorkshops: vi.fn() }))

import { getAllWorkshopSignups } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('getAllWorkshopSignups — tenant scoping', () => {
  it('binds the conference predicate even on the ids-only path', async () => {
    await getAllWorkshopSignups({
      conferenceId: 'conf-1',
      signupIds: ['sg-1', 'sg-2'],
    })

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toMatchObject({
      conferenceId: 'conf-1',
      signupIds: ['sg-1', 'sg-2'],
    })
  })

  // MUTATION CHECK: delete the `if (!filters.conferenceId) return []` guard and
  // this fails — `scopedFetch` would throw, but the contract pinned here is
  // that NO query is issued for an unresolvable tenant.
  it('FAILS CLOSED on an unresolvable conference: no query, no signups', async () => {
    const signups = await getAllWorkshopSignups({
      conferenceId: '',
      signupIds: ['sg-1'],
    })

    expect(signups).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getAllWorkshopSignups — GROQ injection', () => {
  it('binds ids as a PARAMETER rather than splicing them into the query', async () => {
    // A crafted id that would have closed the string literal and appended its
    // own predicate under the old `_id in ["${id}"]` interpolation.
    const hostile = 'sg-1"] || _type == "workshopSignup" && ["x'

    await getAllWorkshopSignups({
      conferenceId: 'conf-1',
      signupIds: [hostile],
    })

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).not.toContain(hostile)
    expect(query).toContain('_id in $signupIds')
    expect(params.signupIds).toEqual([hostile])
  })

  it('binds status and workshopId as parameters', async () => {
    await getAllWorkshopSignups({
      conferenceId: 'conf-1',
      status: 'confirmed"] || ["',
      workshopId: 'ws-1"] || ["',
    })

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('status == $status')
    expect(query).toContain('workshop._ref == $workshopId')
    expect(query).not.toContain('|| ["')
    expect(params).toMatchObject({
      status: 'confirmed"] || ["',
      workshopId: 'ws-1"] || ["',
    })
  })
})
