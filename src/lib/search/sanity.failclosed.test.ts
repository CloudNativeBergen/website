/**
 * @vitest-environment node
 *
 * `searchUnified` REFUSES TO RUN WITHOUT A TENANT KEY.
 *
 * The waist above it (`adminProcedure`) already denies a request whose org does
 * not resolve, so in production this branch should be unreachable. It is pinned
 * anyway because the failure it prevents is not "an error" but a SILENT one: the
 * sponsor root filter is `organization._ref == $orgId`, and a query issued with
 * `$orgId` unbound does not error — GROQ compares against `null` and the
 * behaviour becomes a property of the data rather than of the code. The two
 * sponsor readers this replaces (`searchSponsors`, `getAllSponsors`) each refuse
 * for exactly this reason.
 *
 * The assertion is on the FETCH NEVER HAPPENING, not on the return value: a
 * function that queries and then discards has still billed the quota and still
 * answered "does this tenant exist".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(async () => ({ speakers: [], proposals: [], sponsors: [] })),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
}))

import { searchUnified } from './sanity'

const EMPTY = { proposals: [], sponsors: [], speakers: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('searchUnified without a resolved tenant', () => {
  it('issues NO query when the org id is empty', async () => {
    const result = await searchUnified({
      query: 'kubernetes',
      conferenceId: 'conf-1',
      orgId: '',
    })

    expect(h.fetch).not.toHaveBeenCalled()
    expect(result).toEqual(EMPTY)
  })

  it('issues NO query when the conference id is empty', async () => {
    const result = await searchUnified({
      query: 'kubernetes',
      conferenceId: '',
      orgId: 'org-1',
    })

    expect(h.fetch).not.toHaveBeenCalled()
    expect(result).toEqual(EMPTY)
  })

  it('issues NO query for a blank search term', async () => {
    const result = await searchUnified({
      query: '   ',
      conferenceId: 'conf-1',
      orgId: 'org-1',
    })

    expect(h.fetch).not.toHaveBeenCalled()
    expect(result).toEqual(EMPTY)
  })

  it('DOES query once every input is present — so the cases above fail on the guard, not on a broken stub', async () => {
    await searchUnified({
      query: 'kubernetes',
      conferenceId: 'conf-1',
      orgId: 'org-1',
    })

    expect(h.fetch).toHaveBeenCalledTimes(1)
  })
})
