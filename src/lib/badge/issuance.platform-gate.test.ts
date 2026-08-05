/**
 * @vitest-environment node
 *
 * PLATFORM-ORG TRIPWIRE (Phase 0, RunKonf/platform#46). Badge credentials are
 * signed with ONE GLOBAL key pair shared by every tenant, and issued Open Badge
 * bytes verify PERMANENTLY on platforms we do not control — a badge minted for a
 * second tenant on the global keys could never be un-issued. The full per-tenant
 * signing rework is deferred until a second tenant is about to issue; this gate
 * makes that deferral SAFE by refusing any non-platform org at the issuance
 * chokepoint (`issueBadgeForSpeaker`, inherited by `issue` + `bulkIssue`).
 *
 * These pin the standing bar: a non-platform org is REFUSED; the platform org
 * still passes the gate (no regression); an unresolvable platform org id FAILS
 * CLOSED. Each assertion targets the exact refusal string so the sabotage check
 * (delete the guard → the refusal test fails) is meaningful.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const getSpeakerMock = vi.fn()
const checkBadgeExistsMock = vi.fn()
const getConferenceMock = vi.fn()
const getPlatformOrgIdMock = vi.fn()
const createBadgeMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/authz/platform', () => ({
  getPlatformOrgId: (...a: unknown[]) => getPlatformOrgIdMock(...a),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: (...a: unknown[]) => getSpeakerMock(...a),
}))
vi.mock('./sanity', () => ({
  checkBadgeExists: (...a: unknown[]) => checkBadgeExistsMock(...a),
  createBadge: (...a: unknown[]) => createBadgeMock(...a),
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

const PLATFORM_ORG = 'org-platform'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  checkBadgeExistsMock.mockResolvedValue({ exists: false })
  getSpeakerMock.mockResolvedValue({
    speaker: { _id: 'sp-x', name: 'Pat', email: 'pat@x.test', slug: 'pat' },
    err: null,
  })
  // Force a distinct LATER failure so a caller who PASSES the platform gate is
  // provable without mocking the whole issuance pipeline: if we reach the
  // conference load, the gate did not refuse.
  getConferenceMock.mockResolvedValue({
    error: new Error('boom'),
    conference: null,
  })
})

describe('issueBadgeForSpeaker — platform-org tripwire (platform#46)', () => {
  it('(a) FAILS CLOSED when the issuing-org lookup THROWS — structured refusal, not a throw, no badge', async () => {
    getPlatformOrgIdMock.mockResolvedValue(PLATFORM_ORG)
    // A Sanity service/network/timeout/auth error rejecting the lookup must not
    // escape the structured-return contract (single 500 / bulk abort mid-batch).
    fetchMock.mockRejectedValueOnce(new Error('sanity unavailable'))
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'speaker',
      conferenceId: 'conf-platform',
      isDevelopment: false,
    })
    expect(res).toEqual({
      success: false,
      error:
        'Badge issuance is unavailable: the issuing organization could not be resolved — see RunKonf/platform#46',
    })
    // No badge is ever minted on the error path.
    expect(createBadgeMock).not.toHaveBeenCalled()
  })

  it('(b) FAILS CLOSED when the issuing org is unresolvable (null) — unavailable message, not per-tenant-keys', async () => {
    getPlatformOrgIdMock.mockResolvedValue(PLATFORM_ORG)
    // Unknown conferenceId, or a conference missing its organization ref.
    fetchMock.mockResolvedValueOnce(null)
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'speaker',
      conferenceId: 'conf-unknown',
      isDevelopment: false,
    })
    expect(res).toEqual({
      success: false,
      error:
        'Badge issuance is unavailable: the issuing organization could not be resolved — see RunKonf/platform#46',
    })
    expect(createBadgeMock).not.toHaveBeenCalled()
  })

  it('(c) REFUSES a RESOLVED non-platform org, naming per-tenant keys and platform#46', async () => {
    getPlatformOrgIdMock.mockResolvedValue(PLATFORM_ORG)
    fetchMock.mockResolvedValueOnce('org-tenant-B') // issuing conference → org
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'speaker',
      conferenceId: 'conf-B',
      isDevelopment: false,
    })
    expect(res).toEqual({
      success: false,
      error:
        'Badge issuance for this organization requires per-tenant signing keys — see RunKonf/platform#46',
    })
  })

  it('(d) does NOT refuse the PLATFORM org — the gate is passed (no regression)', async () => {
    getPlatformOrgIdMock.mockResolvedValue(PLATFORM_ORG)
    fetchMock.mockResolvedValueOnce(PLATFORM_ORG) // issuing conference → platform org
    fetchMock.mockResolvedValueOnce(true) // speaker branch: has accepted talk
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'speaker',
      conferenceId: 'conf-platform',
      isDevelopment: false,
    })
    // Past the platform gate AND the speaker-eligibility gate; stops at the
    // conference load (mocked to error), NOT at the tripwire.
    expect(res).toEqual({ success: false, error: 'Conference not found' })
  })

  it('FAILS CLOSED when the platform org id cannot be resolved', async () => {
    getPlatformOrgIdMock.mockResolvedValue(null) // PLATFORM_ORG_ID unset / blank
    const res = await issueBadgeForSpeaker({
      speakerId: 'sp-x',
      badgeType: 'speaker',
      conferenceId: 'conf-platform',
      isDevelopment: false,
    })
    expect(res).toEqual({
      success: false,
      error:
        'Badge issuance is unavailable: the platform organization could not be resolved — see RunKonf/platform#46',
    })
    // The issuing-org lookup must never run once the guard input is unresolvable.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
