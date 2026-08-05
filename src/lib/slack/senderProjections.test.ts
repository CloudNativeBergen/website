/**
 * @vitest-environment node
 *
 * `organization` IS A LOAD-BEARING PROJECTION FIELD for every Slack sender.
 *
 * `resolveConferenceSlackToken` keys the bot token on `conference.organization`
 * and fails closed without it, and `postSlackMessage` has no env fallback to
 * paper over the gap. So a conference read whose projection is an EXPLICIT field
 * list — not a `{...}` spread — silently stops that surface's Slack posts with
 * no type error and no runtime error: the send just no-op-warns.
 *
 * Two such reads feed the sponsor CONTRACT-SIGNED notification, one per signing
 * path. These cases pin `organization` into both. Most other senders read
 * through `getConferenceForCurrentDomain` / `conference->{ ... }`, which spread
 * the whole document and cannot lose the field.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: vi.fn(), patch: vi.fn(), create: vi.fn() },
  clientRead: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { getSigningContract } from '@/lib/signing/sanity'
import { getSponsorForConference } from '@/lib/sponsor-crm/sanity'

/** The `conference->{ … }` sub-projection of a GROQ query, as written. */
function conferenceProjection(query: string): string {
  const start = query.indexOf('conference->{')
  expect(start).toBeGreaterThan(-1)
  return query.slice(start, query.indexOf('}', start))
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue(null)
})

describe('conference projections feeding Slack senders carry `organization`', () => {
  it('SIGNING_CONTRACT_QUERY projects it (public signing → contract-signed post)', async () => {
    await getSigningContract('token-1')
    const query = fetchMock.mock.calls[0][0] as string
    expect(conferenceProjection(query)).toContain('organization')
  })

  it('SPONSOR_FOR_CONFERENCE_FIELDS projects it (admin signature-status → contract-signed post)', async () => {
    await getSponsorForConference('sfc-1')
    const query = fetchMock.mock.calls[0][0] as string
    expect(conferenceProjection(query)).toContain('organization')
  })
})
