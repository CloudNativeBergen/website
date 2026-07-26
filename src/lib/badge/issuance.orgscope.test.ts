/**
 * @vitest-environment node
 *
 * E11 (#642) — an ORGANIZER badge must only be issuable to someone who organizes
 * a conference IN THIS conference's org. Before the fix the eligibility gate read
 * the DEPRECATED GLOBAL `speaker.isOrganizer` (true for an organizer of ANY org),
 * so an org-A admin could mint an org-A organizer badge for an org-B-only
 * organizer. These pin: cross-tenant recipient rejected; same-org recipient
 * passes the eligibility gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const getSpeakerMock = vi.fn()
const checkBadgeExistsMock = vi.fn()
const getConferenceMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: (...a: unknown[]) => getSpeakerMock(...a),
}))
vi.mock('./sanity', () => ({
  checkBadgeExists: (...a: unknown[]) => checkBadgeExistsMock(...a),
  createBadge: vi.fn(),
  uploadBadgeSVGAsset: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))
// Unused-before-return generation deps — inert stubs.
vi.mock('./generator', () => ({ generateBadgeCredential: vi.fn() }))
vi.mock('./config', () => ({ createBadgeConfiguration: vi.fn() }))
vi.mock('./svg', () => ({ generateBadgeSVG: vi.fn() }))
vi.mock('@/lib/openbadges', () => ({ bakeBadge: vi.fn() }))
vi.mock('@/lib/time', () => ({
  formatConferenceDateForBadge: vi.fn(),
  getCurrentDateTime: vi.fn(),
}))

import { issueBadgeForSpeaker } from './issuance'

// fetch is called twice for the org check: (1) orgRef of the conference,
// (2) count of the recipient's org-scoped organizer membership.
function mockOrgCheck({
  orgRef,
  isMember,
}: {
  orgRef: string | null
  isMember: boolean
}) {
  fetchMock.mockReset()
  fetchMock.mockResolvedValueOnce(orgRef) // conference → organization._ref
  fetchMock.mockResolvedValueOnce(isMember) // count(...) > 0
}

beforeEach(() => {
  vi.clearAllMocks()
  checkBadgeExistsMock.mockResolvedValue({ exists: false })
  getSpeakerMock.mockResolvedValue({
    speaker: { _id: 'sp-x', name: 'Pat', email: 'pat@x.test', slug: 'pat' },
    err: null,
  })
  // Force a distinct later failure so a recipient who PASSES the org-scoped
  // eligibility gate is provable without mocking the whole issuance pipeline.
  getConferenceMock.mockResolvedValue({
    error: new Error('boom'),
    conference: null,
  })
})

describe('issueBadgeForSpeaker — organizer badge org scoping (E11)', () => {
  it('REJECTS a recipient who does not organize this conference’s org', async () => {
    mockOrgCheck({ orgRef: 'org-A', isMember: false })
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'organizer',
      conferenceId: 'conf-A',
      isDevelopment: false,
    })
    expect(res).toEqual({
      success: false,
      error: 'Not eligible: Pat is not an organizer',
    })
  })

  it('FAILS CLOSED when the conference has no resolvable org', async () => {
    mockOrgCheck({ orgRef: null, isMember: true })
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'organizer',
      conferenceId: 'conf-A',
      isDevelopment: false,
    })
    expect(res).toMatchObject({
      success: false,
      error: expect.stringContaining('not an organizer'),
    })
  })

  it('PASSES the eligibility gate for a same-org organizer (fails later, not on eligibility)', async () => {
    mockOrgCheck({ orgRef: 'org-A', isMember: true })
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'organizer',
      conferenceId: 'conf-A',
      isDevelopment: false,
    })
    // Got past the organizer gate → the next step (conference load) is where it
    // stops, NOT the eligibility check.
    expect(res).toEqual({ success: false, error: 'Conference not found' })
  })
})
