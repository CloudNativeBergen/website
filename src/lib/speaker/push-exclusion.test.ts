import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security regression test for issue #444 (HIGH — information disclosure).
 *
 * The speaker Sanity document carries `pushSubscriptions` (push endpoint URLs +
 * the `p256dh`/`auth` crypto keys) and `pushPreferences`. Several general
 * speaker projections use a bare `...` spread, which would otherwise copy those
 * secrets into every result that flows to organizers (`speaker.admin.search`
 * via `getSpeakers`/`getOrganizers`) and the public speakers page
 * (`getSpeakers`). Only the push server code (`src/lib/push/sanity.ts`, keyed by
 * speaker id) may read them.
 *
 * These assertions run against the actual query strings the functions send to
 * Sanity (the mock does not execute GROQ), pinning the null-override so the
 * fields can never silently reappear in a shared projection.
 */

const fetchMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    create: vi.fn(),
    patch: vi.fn(),
  },
  speakerImageUrl: vi.fn(),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('@/lib/profile/github', () => ({
  verifiedEmails: vi.fn().mockResolvedValue({ error: null, emails: [] }),
}))

import { EXCLUDE_PUSH_FIELDS } from '@/lib/sanity/helpers'
import {
  getSpeaker,
  getSpeakers,
  getOrganizers,
  getOrganizersByConference,
} from './sanity'

/** The single query string the function under test sent to Sanity. */
function capturedQuery(): string {
  expect(fetchMock).toHaveBeenCalled()
  return String(fetchMock.mock.calls[0][0])
}

/** Every query that spreads the speaker doc must null the push secrets out. */
function expectPushFieldsExcluded(query: string) {
  expect(query).toContain('"pushSubscriptions": null')
  expect(query).toContain('"pushPreferences": null')
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('web-push field exclusion (#444)', () => {
  it('EXCLUDE_PUSH_FIELDS nulls both sensitive fields', () => {
    expect(EXCLUDE_PUSH_FIELDS).toContain('"pushSubscriptions": null')
    expect(EXCLUDE_PUSH_FIELDS).toContain('"pushPreferences": null')
  })

  it('getSpeakers (public speakers page + admin.search) excludes push fields', async () => {
    await getSpeakers('conf-1')
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getOrganizers (admin.search) excludes push fields', async () => {
    await getOrganizers()
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getOrganizersByConference excludes push fields', async () => {
    await getOrganizersByConference('conf-1')
    expectPushFieldsExcluded(capturedQuery())
  })

  it('getSpeaker (single speaker) excludes push fields', async () => {
    fetchMock.mockResolvedValue({})
    await getSpeaker('spk-1')
    expectPushFieldsExcluded(capturedQuery())
  })
})
