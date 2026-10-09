/**
 * @vitest-environment node
 *
 * `domainVerification.list` hands `listConferenceDomainViews` the conference
 * it read, with what the workshop gate needs (#1298). The router, its tenancy
 * and its GROQ run for real; the verification module is the boundary.
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

const listConferenceDomainViews = vi.fn<
  (conference: unknown) => Promise<unknown[]>
>(async () => [])
vi.mock('@/lib/domain-verification', () => ({
  listConferenceDomainViews: (conference: unknown) =>
    listConferenceDomainViews(conference),
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
  it('lists the views for the conference as the query selects it: id, normalised domains, owner and vendor', async () => {
    await caller().list()

    // The gate inside `listConferenceDomainViews` reads owner and vendor; a
    // projection that dropped them would switch workshops off for everyone.
    expect(listConferenceDomainViews).toHaveBeenCalledWith({
      _id: 'conference-1',
      domains: ['2026.cloudnativedays.no'],
      organization: CONFERENCE_DOC.organization,
      ticketingProvider: 'checkin',
    })
  })
})
