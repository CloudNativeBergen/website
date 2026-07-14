/**
 * tRPC badge.verify — embedded Data Integrity Proof branch
 *
 * Mirrors the REST /api/badge/[badgeId]/verify route: structural validation is
 * run locally, and a malformed / tampered / multi-proof embedded badge returns
 * a clean `valid: false` response instead of bubbling up to a 500
 * (INTERNAL_SERVER_ERROR).
 */

import { generateBadgeCredential } from '@/lib/badge/generator'
import { createTestConfiguration } from '@/lib/badge/config'
import type { BadgeRecord } from '@/lib/badge/types'

vi.mock('@/lib/badge/sanity', () => ({
  getBadgeById: vi.fn(),
  listBadgesForConference: vi.fn(),
  listBadgesForSpeaker: vi.fn(),
  deleteBadge: vi.fn(),
}))

import { getBadgeById } from '@/lib/badge/sanity'
import { createAnonymousCaller } from '../../helpers/trpc'

const mockedGetBadgeById = vi.mocked(getBadgeById)

function badgeRecord(badgeJson: string): BadgeRecord {
  return {
    _id: 'badge-doc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    badgeId: 'test-badge-id',
    speaker: { _ref: 'speaker-1', _type: 'reference' },
    conference: { _ref: 'conference-1', _type: 'reference' },
    badgeType: 'speaker',
    issuedAt: '2026-01-01T00:00:00Z',
    badgeJson,
    emailSent: false,
  }
}

describe('tRPC badge.verify - embedded proof branch', () => {
  let credentialJsonString: string

  beforeAll(async () => {
    const config = createTestConfiguration()
    const generated = await generateBadgeCredential(
      {
        speakerId: 'speaker-1',
        speakerName: 'Jane Doe',
        speakerEmail: 'jane.doe@example.com',
        speakerSlug: 'jane-doe',
        conferenceId: 'conference-1',
        conferenceTitle: 'Test Conference 2026',
        conferenceYear: '2026',
        conferenceDate: 'June 15, 2026',
        badgeType: 'speaker',
        talkId: 'talk-1',
        talkTitle: 'Kubernetes at Scale',
      },
      config,
    )
    credentialJsonString = JSON.stringify(generated.credentialJson)
  })

  beforeEach(() => {
    mockedGetBadgeById.mockReset()
  })

  it('verifies a valid embedded-proof badge', async () => {
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(credentialJsonString),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(true)
    expect(result.signatureValid).toBe(true)
    expect(result.credential).not.toBeNull()
  })

  it('returns valid:false (not a 500) for a tampered embedded badge', async () => {
    const tampered = JSON.parse(credentialJsonString)
    tampered.name = 'Tampered Badge'
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(JSON.stringify(tampered)),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    // structural validity may hold, but the signature must not
    expect(result.signatureValid).toBe(false)
    expect(result.valid).toBe(false)
  })

  it('returns valid:false (not a 500) when the credential carries multiple proofs', async () => {
    // verifyCredential throws on a proof array with length != 1 BEFORE its
    // internal try/catch; this must be caught locally and reported not-valid.
    const multiProof = JSON.parse(credentialJsonString)
    multiProof.proof = [multiProof.proof[0], { ...multiProof.proof[0] }]
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(JSON.stringify(multiProof)),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
    expect(result.credential).toBeNull()
  })

  it('returns valid:false (not a 500) for malformed badgeJson', async () => {
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord('{ this is not valid json'),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
    expect(result.credential).toBeNull()
  })
})
