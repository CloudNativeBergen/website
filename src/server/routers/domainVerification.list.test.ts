/**
 * @vitest-environment node
 *
 * `domainVerification.list` asks the workshop gate about the conference it
 * read, and only then lists each host's workshop sign-in standing (#1298). The
 * router and its tenancy run for real; the Sanity client, the gate and the
 * verification module are the boundaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const CONFERENCE = {
  domains: ['2026.cloudnativedays.no'],
  organization: { _ref: 'org-A', _type: 'reference' },
  ticketingProvider: 'checkin',
}
const fetch = vi.fn(async () => CONFERENCE)
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: () => fetch() },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conference-1', organization: { _ref: 'org-A' } },
    error: null,
  }),
}))

const workshopsEnabled = vi.fn<(conference: unknown) => Promise<boolean>>(
  async () => true,
)
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: (conference: unknown) =>
    workshopsEnabled(conference),
}))

const listDomainVerificationViews = vi.fn<
  (...args: unknown[]) => Promise<unknown[]>
>(async () => [])
vi.mock('@/lib/domain-verification', () => ({
  listDomainVerificationViews: (...args: unknown[]) =>
    listDomainVerificationViews(...args),
  syncDomainVerifications: vi.fn(),
  getDomainVerification: vi.fn(),
  recheckDomainRecord: vi.fn(),
  toDomainVerificationView: vi.fn(),
}))

vi.mock('@/lib/workshop/redirect-uris', () => ({
  scheduleRedirectUriReconcile: vi.fn(),
}))

import { domainVerificationRouter } from './domainVerification'
import type { Context } from '../trpc'

function caller() {
  const speaker = { _id: 'admin-1', organizerOrgIds: ['org-A'] }
  const session = { speaker, user: { email: 'admin@x.test' } }
  return domainVerificationRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('domainVerification.list', () => {
  it.each([[true], [false]])(
    'lists the sign-in standing exactly when the gate says workshops are %s',
    async (enabled) => {
      workshopsEnabled.mockResolvedValue(enabled)
      await caller().list()

      // The gate is asked about the conference as read: owner and vendor.
      expect(workshopsEnabled).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: CONFERENCE.organization,
          ticketingProvider: 'checkin',
        }),
      )
      expect(listDomainVerificationViews).toHaveBeenCalledWith(
        'conference-1',
        ['2026.cloudnativedays.no'],
        { workshops: enabled },
      )
    },
  )
})
