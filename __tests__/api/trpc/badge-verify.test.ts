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
  let credentialJwt: string

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
    credentialJwt = generated.credentialJwt
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
    // A proof set is a VERDICT on the credential (#859): verifyCredential
    // reports `invalid`/`proof-set` rather than throwing, so the router can
    // still hand back the credential it judged.
    const multiProof = JSON.parse(credentialJsonString)
    multiProof.proof = [multiProof.proof[0], { ...multiProof.proof[0] }]
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(JSON.stringify(multiProof)),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
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

/**
 * #859, tRPC edition. `badge.verify` is a PUBLIC procedure, and both of its
 * branches must distinguish "this badge is bad" from "we could not evaluate
 * it". The JWT branch is the one that matters most in practice: half the
 * issued badges are legacy JWT.
 *
 * Caught by an unresolved Copilot thread on #864, not by me — the bare
 * `catch { return { valid: false } }` predates the PR, but the PR is what made
 * `verifyCredentialJWT` throw TrustAnchorError into it.
 */
describe('tRPC badge.verify - a broken issuer key is not a verdict', () => {
  const ED_KEY = 'BADGE_ISSUER_ED25519_PUBLIC_KEY'
  const RSA_KEY = 'BADGE_ISSUER_RSA_PUBLIC_KEY'
  let savedEd: string | undefined
  let savedRsa: string | undefined
  let credentialJsonString: string
  let credentialJwt: string

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
    credentialJwt = generated.credentialJwt
  })

  beforeEach(() => {
    mockedGetBadgeById.mockReset()
    savedEd = process.env[ED_KEY]
    savedRsa = process.env[RSA_KEY]
  })

  afterEach(() => {
    if (savedEd === undefined) delete process.env[ED_KEY]
    else process.env[ED_KEY] = savedEd
    if (savedRsa === undefined) delete process.env[RSA_KEY]
    else process.env[RSA_KEY] = savedRsa
  })

  it('LEGACY JWT: does not report a genuine badge invalid when the RSA key is unusable', async () => {
    mockedGetBadgeById.mockResolvedValue({ badge: badgeRecord(credentialJwt) })
    process.env[RSA_KEY] =
      '-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----\n'

    const caller = createAnonymousCaller()

    // It must FAIL the call, not answer with a verdict.
    await expect(
      caller.badge.verify({ badgeId: 'test-badge-id' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('LEGACY JWT: STILL verifies a genuine badge when the key is fine', async () => {
    mockedGetBadgeById.mockResolvedValue({ badge: badgeRecord(credentialJwt) })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(true)
    expect(result.signatureValid).toBe(true)
  })

  it('LEGACY JWT: STILL reports a tampered badge as invalid, not as a failure', async () => {
    // The counterweight. If TrustAnchorError handling leaked into the generic
    // catch, a forged JWT would raise PRECONDITION_FAILED instead of a verdict.
    const [header, payload] = credentialJwt.split('.')
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(`${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAA`),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
  })

  it('EMBEDDED: does not report a genuine badge invalid when the Ed25519 key is corrupt', async () => {
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(credentialJsonString),
    })
    process.env[ED_KEY] = savedEd!.slice(0, 20)

    const caller = createAnonymousCaller()

    await expect(
      caller.badge.verify({ badgeId: 'test-badge-id' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('EMBEDDED: STILL reports a tampered badge as invalid, not as a failure', async () => {
    const tampered = JSON.parse(credentialJsonString)
    tampered.name = 'Tampered Badge'
    mockedGetBadgeById.mockResolvedValue({
      badge: badgeRecord(JSON.stringify(tampered)),
    })

    const caller = createAnonymousCaller()
    const result = await caller.badge.verify({ badgeId: 'test-badge-id' })

    expect(result.valid).toBe(false)
    expect(result.signatureValid).toBe(false)
  })
})
