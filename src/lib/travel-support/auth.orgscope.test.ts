/**
 * @vitest-environment node
 *
 * B3 (#642) — travel-support authorization (which guards BANKING PII) must scope
 * the organizer grant to the request's OWN org, not the deprecated global
 * `isOrganizer` flag. Before the fix `hasAccess = isOrganizer || owner` trusted
 * the global flag, so an organizer of ANY org could read/modify another tenant's
 * banking details. These pin: cross-tenant organizer denied, same-org granted,
 * owner unaffected, and self-approval still blocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getByIdMock = vi.fn()
vi.mock('./sanity', () => ({
  getTravelSupportById: (...a: unknown[]) => getByIdMock(...a),
}))
vi.mock('@/lib/speaker/sanity', () => ({ getSpeaker: vi.fn() }))
vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: { isTestMode: false },
}))

import {
  verifyTravelSupportOwnership,
  authorizeTravelSupportOperation,
} from './auth'

// An org-A request owned by speaker sp-owner.
const orgADoc = () => ({
  _id: 'ts-A',
  status: 'submitted',
  speaker: { _id: 'sp-owner', name: 'Owner', email: 'o@x.test' },
  conference: { _id: 'conf-A', name: 'Conf A' },
  conferenceOrgId: 'org-A',
  expenses: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getByIdMock.mockResolvedValue({ travelSupport: orgADoc(), error: null })
})

const orgA = { _id: 'a-admin', name: 'A Admin', organizerOrgIds: ['org-A'] }
const orgB = {
  _id: 'b-admin',
  name: 'B Admin',
  isOrganizer: true,
  organizerOrgIds: ['org-B'],
}
const owner = { _id: 'sp-owner', name: 'Owner', organizerOrgIds: [] }

describe('verifyTravelSupportOwnership — org-scoped (B3)', () => {
  it('GRANTS a same-org organizer', async () => {
    const r = await verifyTravelSupportOwnership('ts-A', orgA)
    expect(r.hasAccess).toBe(true)
    expect(r.isOrganizer).toBe(true)
  })

  it('DENIES a cross-tenant organizer (org-B) reaching org-A banking PII', async () => {
    const r = await verifyTravelSupportOwnership('ts-A', orgB)
    expect(r.hasAccess).toBe(false)
    expect(r.isOrganizer).toBe(false)
  })

  it('GRANTS the owner regardless of org membership', async () => {
    const r = await verifyTravelSupportOwnership('ts-A', owner)
    expect(r.hasAccess).toBe(true)
    expect(r.isOrganizer).toBe(false)
  })
})

describe('authorizeTravelSupportOperation — approve (B3)', () => {
  it('DENIES a cross-tenant organizer approving (NOT_FOUND/FORBIDDEN, never authorized)', async () => {
    const r = await authorizeTravelSupportOperation('ts-A', orgB, 'approve')
    expect(r.authorized).toBe(false)
  })

  it('lets a same-org organizer approve another speaker’s request', async () => {
    const r = await authorizeTravelSupportOperation('ts-A', orgA, 'approve')
    expect(r.authorized).toBe(true)
  })

  it('blocks a same-org organizer approving their OWN request', async () => {
    getByIdMock.mockResolvedValueOnce({
      travelSupport: {
        ...orgADoc(),
        speaker: { _id: 'a-admin', name: 'A Admin', email: 'a@x.test' },
      },
      error: null,
    })
    const r = await authorizeTravelSupportOperation('ts-A', orgA, 'approve')
    expect(r.authorized).toBe(false)
  })

  it('DENIES a legacy token (global isOrganizer, no organizerOrgIds)', async () => {
    // The legacy-token bridge is gone (#642). The global `isOrganizer` flag is
    // not org-scoped — it is true for an organizer of ANY org — so bridging it
    // granted organizer rights on every tenant. Such a token is now an ordinary
    // non-organizer until the holder signs in again and re-mints org claims.
    const legacy = { _id: 'legacy', name: 'Legacy', isOrganizer: true }
    const r = await authorizeTravelSupportOperation('ts-A', legacy, 'approve')
    expect(r.authorized).toBe(false)
  })
})
