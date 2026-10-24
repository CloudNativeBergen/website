/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cached: { conference: null, error: null } as {
    conference: Record<string, unknown> | null
    error: Error | null
  },
  live: { conference: null, error: null } as {
    conference: Record<string, unknown> | null
    error: Error | null
  },
  read: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.read,
}))

import { liveConferenceInOrg } from './tenant'

const CACHED = {
  _id: 'conf-A',
  organization: { _ref: 'org-A' },
  endDate: '2026-10-27',
}
/** The live document: Settings just moved the end date. */
const LIVE = { ...CACHED, endDate: '2026-10-28' }

beforeEach(() => {
  h.read.mockReset()
  h.read.mockImplementation(async (opts?: { uncached?: boolean }) =>
    opts?.uncached ? h.live : h.cached,
  )
  h.cached = { conference: CACHED, error: null }
  h.live = { conference: LIVE, error: null }
})

describe('liveConferenceInOrg', () => {
  it('returns the LIVE document of the domain’s conference, in the organization', async () => {
    expect(await liveConferenceInOrg('org-A')).toEqual(LIVE)
  })

  it('refuses without an organization, reading nothing', async () => {
    expect(await liveConferenceInOrg(null)).toBeNull()
    expect(h.read).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the tenant read failed',
      () => (h.cached = { conference: CACHED, error: new Error('cdn') }),
    ],
    [
      'the domain has no conference',
      () => (h.cached = { conference: null, error: null }),
    ],
    [
      'the live read failed',
      () => (h.live = { conference: LIVE, error: new Error('timeout') }),
    ],
    [
      'the live read names another conference',
      () => (h.live = { conference: { ...LIVE, _id: 'conf-B' }, error: null }),
    ],
    [
      'the conference moved to another organization',
      () =>
        (h.live = {
          conference: { ...LIVE, organization: { _ref: 'org-B' } },
          error: null,
        }),
    ],
  ])('refuses when %s', async (_, arrange) => {
    arrange()
    expect(await liveConferenceInOrg('org-A')).toBeNull()
  })
})
