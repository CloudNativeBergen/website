import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TENANCY REGRESSIONS for the travel-support reads (#616, batch A2).
 *
 * `travelSupport` carries the speaker's BANKING DETAILS. `getAllTravelSupport`
 * used to take an OPTIONAL `conferenceId` and degrade to
 * `*[_type == "travelSupport"]` when it was falsy — every tenant's speakers'
 * bank account numbers. The unknown-host path made that reachable:
 * `getConferenceForCurrentDomain()` returns a truthy `{}` for an unknown host,
 * so the router's `if (!conference)` never fired and `conference._id` was
 * `undefined`.
 *
 * Each test asserts BOTH that the fail-closed path returns nothing AND that it
 * issues no query at all.
 */
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(),
  organizationField: () => ({}),
}))

import {
  getAllTravelSupport,
  getSpeakersRequiringTravelSupport,
} from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('getAllTravelSupport — banking PII must never go global', () => {
  it('binds the conference predicate into the read', async () => {
    await getAllTravelSupport('conf-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('never emits the unscoped `*[_type == "travelSupport"]` root filter', async () => {
    await getAllTravelSupport('conf-1')

    const [query] = fetchMock.mock.calls[0]
    // The root filter must LEAD with the tenant predicate, not `_type`.
    expect(query).toMatch(/\*\[\s*conference\._ref == \$conferenceId/)
  })

  // MUTATION CHECK (verified): deleting the `if (!conferenceId)` guard does NOT
  // make this fail — `scopedFetch` throws on an empty scope before reaching the
  // client, so the read is closed by TWO independent layers. What DOES fail if
  // the read is reverted to the old `conferenceId ? scoped : global` ternary is
  // `expect(fetchMock).not.toHaveBeenCalled()`, because the global branch issues
  // a real query. That is the regression this pins.
  it('FAILS CLOSED on an unresolvable conference: no query, no records', async () => {
    const { travelSupports, error } = await getAllTravelSupport(
      undefined as unknown as string,
    )

    expect(travelSupports).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on an empty-string conference id', async () => {
    const { travelSupports, error } = await getAllTravelSupport('')

    expect(travelSupports).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getSpeakersRequiringTravelSupport — scoped at the ROOT filter', () => {
  it('roots the read at the conference’s talks, not a global speaker sweep', async () => {
    await getSpeakersRequiringTravelSupport('conf-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('_type == "talk"')
    // The old shape swept every tenant's funding-flagged speakers.
    expect(query).not.toContain('"requires-funding" in flags')
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('keeps only speakers flagged as requiring funding, grouped by person', async () => {
    fetchMock
      .mockResolvedValueOnce([
        {
          _id: 't1',
          title: 'Talk One',
          speakers: [
            {
              _id: 'spk-1',
              name: 'A',
              email: 'a@x',
              flags: ['requires-funding'],
            },
            { _id: 'spk-2', name: 'B', email: 'b@x', flags: [] },
          ],
        },
        {
          _id: 't2',
          title: 'Talk Two',
          speakers: [
            {
              _id: 'spk-1',
              name: 'A',
              email: 'a@x',
              flags: ['requires-funding'],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([{ speakerId: 'spk-1' }])

    const { speakers, error } =
      await getSpeakersRequiringTravelSupport('conf-1')

    expect(error).toBeNull()
    expect(speakers).toHaveLength(1)
    expect(speakers[0]).toMatchObject({
      _id: 'spk-1',
      hasSubmitted: true,
    })
    expect(speakers[0].confirmedTalks.map((t) => t._id)).toEqual(['t1', 't2'])
  })

  it('FAILS CLOSED on an unresolvable conference: no query, no speakers', async () => {
    const { speakers, error } = await getSpeakersRequiringTravelSupport('')

    expect(speakers).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
