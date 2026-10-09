/**
 * @vitest-environment node
 *
 * `domainVerification.list` asks the workshop gate about the conference it
 * read, and only then lists each host's workshop sign-in standing (#1298). The
 * router and its tenancy run for real; the Sanity client, the gate and the
 * verification module are the boundaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The conference document as Sanity stores it. The router's query is RUN
 * against it with the real `groq-js` engine, so what the gate receives is what
 * the projection actually selects — not a fixture handed back whatever the
 * query says.
 */
const CONFERENCE_DOC = {
  _id: 'conference-1',
  _type: 'conference',
  title: 'CNDN 2026',
  domains: ['2026.cloudnativedays.no'],
  organization: { _ref: 'org-A', _type: 'reference' },
  ticketingProvider: 'checkin',
}
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) => {
      const { parse, evaluate } = await import('groq-js')
      return (
        await evaluate(parse(query), { dataset: [CONFERENCE_DOC], params })
      ).get()
    },
  },
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

      // The gate is asked about the conference as the query selects it:
      // owner and vendor.
      expect(workshopsEnabled).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: CONFERENCE_DOC.organization,
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
