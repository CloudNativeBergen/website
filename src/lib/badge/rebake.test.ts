/**
 * @vitest-environment node
 *
 * Rebake round-trip + tenant scoping. Sanity and generation are mocked so the
 * test pins BEHAVIOUR, not I/O:
 *   - the badge is patched IN PLACE (same badgeId / verificationUrl / issuedAt),
 *   - the current generatorVersion is stamped,
 *   - the regenerated artifacts differ from the stored ones,
 *   - a cross-tenant badge is denied without generating or patching anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BADGE_GENERATOR_VERSION } from './version'

const getBadgeByIdMock = vi.fn()
const patchBadgeArtifactsMock = vi.fn()
const uploadBadgeSVGAssetMock = vi.fn()
const generateBadgeArtifactsMock = vi.fn()
const createBadgeConfigurationMock = vi.fn()
const resolveAcceptedTalkMock = vi.fn()
const getConferenceMock = vi.fn()

vi.mock('./sanity', () => ({
  getBadgeById: (...a: unknown[]) => getBadgeByIdMock(...a),
  patchBadgeArtifacts: (...a: unknown[]) => patchBadgeArtifactsMock(...a),
  uploadBadgeSVGAsset: (...a: unknown[]) => uploadBadgeSVGAssetMock(...a),
}))
vi.mock('./artifacts', async (importOriginal) => ({
  // Keep the REAL pure derivation; mock only the generation I/O boundary.
  ...(await importOriginal<typeof import('./artifacts')>()),
  generateBadgeArtifacts: (...a: unknown[]) => generateBadgeArtifactsMock(...a),
}))
vi.mock('./config', () => ({
  createBadgeConfiguration: (...a: unknown[]) =>
    createBadgeConfigurationMock(...a),
}))
vi.mock('./issuance', () => ({
  resolveAcceptedTalk: (...a: unknown[]) => resolveAcceptedTalkMock(...a),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))
vi.mock('@/lib/time', () => ({
  formatConferenceDateForBadge: () => 'JAN 1, 2025',
}))

import { rebakeBadge } from './rebake'

const ISSUED_AT = '2024-01-15T10:00:00.000Z'
const OLD_JSON = JSON.stringify({ proof: [{ verificationMethod: 'old#frag' }] })
const NEW_CREDENTIAL = {
  proof: [{ verificationMethod: 'https://x/api/badge/keys/key-ed25519' }],
}

function storedBadge(overrides?: Record<string, unknown>) {
  return {
    _id: 'doc-1',
    badgeId: 'bid-1',
    badgeType: 'speaker',
    issuedAt: ISSUED_AT,
    verificationUrl: 'https://x/badge/bid-1',
    // absent generatorVersion ⇒ v1 (the pre-#655 target)
    badgeJson: OLD_JSON,
    speaker: {
      _id: 'sp-1',
      name: 'Ada Lovelace',
      email: 'ada@x.test',
      slug: 'ada',
    },
    conference: { _id: 'conf-A', title: 'X Conf', startDate: '2025-01-01' },
    emailSent: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createBadgeConfigurationMock.mockResolvedValue({ baseUrl: 'https://x' })
  resolveAcceptedTalkMock.mockResolvedValue({
    talkId: 't-1',
    talkTitle: 'Analytical Engine',
  })
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-A', title: 'X Conf', startDate: '2025-01-01' },
    domain: 'x',
    error: null,
  })
  generateBadgeArtifactsMock.mockResolvedValue({
    credentialJson: NEW_CREDENTIAL,
    credentialJwt: 'new.jwt.value',
    badgeId: 'bid-1',
    bakedSvg: '<svg>new</svg>',
    verificationUrl: 'https://x/badge/bid-1',
  })
  uploadBadgeSVGAssetMock.mockResolvedValue({ assetId: 'asset-new' })
  patchBadgeArtifactsMock.mockImplementation(async (_badgeId, patch) => ({
    badge: {
      ...storedBadge(),
      badgeJson: patch.badgeJson,
      badgeJwt: patch.badgeJwt,
      generatorVersion: patch.generatorVersion,
    },
  }))
})

describe('rebakeBadge — round trip', () => {
  it('preserves badgeId + issuedAt while re-minting the credential', async () => {
    getBadgeByIdMock.mockResolvedValue({ badge: storedBadge() })

    const res = await rebakeBadge({ badgeId: 'bid-1', conferenceId: 'conf-A' })

    expect(res.success).toBe(true)

    // Generation was asked to PRESERVE the identity: same badgeId + the stored
    // issuedAt as validFrom (so the achievement date does not shift).
    const [, , options] = generateBadgeArtifactsMock.mock.calls[0]
    expect(options).toEqual({ badgeId: 'bid-1', validFrom: ISSUED_AT })

    // The doc is patched IN PLACE (same badgeId) with the current version and
    // the NEW artifacts.
    const [patchedBadgeId, patch] = patchBadgeArtifactsMock.mock.calls[0]
    expect(patchedBadgeId).toBe('bid-1')
    expect(patch.generatorVersion).toBe(BADGE_GENERATOR_VERSION)
    expect(patch.badgeJson).toBe(JSON.stringify(NEW_CREDENTIAL))
    expect(patch.badgeJwt).toBe('new.jwt.value')
    expect(patch.bakedSvgAssetId).toBe('asset-new')

    // The regenerated artifacts differ from what was stored.
    expect(patch.badgeJson).not.toBe(OLD_JSON)
  })

  it('returns the updated badge stamped at the current version, URL unchanged', async () => {
    getBadgeByIdMock.mockResolvedValue({ badge: storedBadge() })

    const res = await rebakeBadge({ badgeId: 'bid-1', conferenceId: 'conf-A' })

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.badge.generatorVersion).toBe(BADGE_GENERATOR_VERSION)
    expect(res.badge.badgeId).toBe('bid-1')
    expect(res.badge.verificationUrl).toBe('https://x/badge/bid-1')
    expect(res.badge.issuedAt).toBe(ISSUED_AT)
  })

  it('skips the talk query for organizer badges', async () => {
    getBadgeByIdMock.mockResolvedValue({
      badge: storedBadge({ badgeType: 'organizer' }),
    })

    await rebakeBadge({ badgeId: 'bid-1', conferenceId: 'conf-A' })

    expect(resolveAcceptedTalkMock).not.toHaveBeenCalled()
  })
})

describe('rebakeBadge — tenant scoping', () => {
  it('DENIES a badge that belongs to another conference (cross-tenant)', async () => {
    getBadgeByIdMock.mockResolvedValue({
      badge: storedBadge({
        conference: { _id: 'conf-B', title: 'Other', startDate: '2025-01-01' },
      }),
    })

    const res = await rebakeBadge({ badgeId: 'bid-1', conferenceId: 'conf-A' })

    expect(res).toMatchObject({ success: false, reason: 'forbidden' })
    // Nothing was generated or written for a cross-tenant badge.
    expect(generateBadgeArtifactsMock).not.toHaveBeenCalled()
    expect(patchBadgeArtifactsMock).not.toHaveBeenCalled()
  })

  it('reports not_found for a missing badge', async () => {
    // Absent badge WITHOUT a read error — a failed read is 'error', not
    // 'not_found' (a transient Sanity failure must never read as missing).
    getBadgeByIdMock.mockResolvedValue({ badge: undefined })

    const res = await rebakeBadge({ badgeId: 'nope', conferenceId: 'conf-A' })

    expect(res).toMatchObject({ success: false, reason: 'not_found' })
    expect(generateBadgeArtifactsMock).not.toHaveBeenCalled()
  })

  it('reports error (not not_found) for a failed badge read', async () => {
    getBadgeByIdMock.mockResolvedValue({ error: new Error('sanity down') })

    const res = await rebakeBadge({ badgeId: 'b-1', conferenceId: 'conf-A' })

    expect(res).toMatchObject({ success: false, reason: 'error' })
    expect(generateBadgeArtifactsMock).not.toHaveBeenCalled()
  })
})
