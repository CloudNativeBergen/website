/**
 * @vitest-environment node
 *
 * generateBadgeCredential — embedded-proof credential shape.
 *
 * Two consumer-reported bugs are pinned here:
 * 1. proof.verificationMethod must be the dereferenceable keys URL (not an
 *    issuer-profile fragment) so the 1EdTech EmbeddedProofProbe can read the
 *    key document off the response root.
 * 2. credentialSubject.identifier[] must carry an emailAddress IdentityObject
 *    so displayers (Credly) can match badge ownership to a verified email.
 *
 * The generated credential is also validated against the official OB 3.0 JSON
 * schema (vendored, no network) and round-tripped through verifyCredential.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { createTestConfiguration } from '@/lib/badge/config'
import { validateCredential, verifyCredential } from '@/lib/openbadges'
import type { SignedCredential } from '@/lib/openbadges'
import { ed25519VerificationMethodUrl } from '@/lib/badge/verification-method'

const BASE = 'https://test.cloudnativedays.no'

describe('generateBadgeCredential - embedded proof', () => {
  let credential: SignedCredential

  beforeAll(async () => {
    const config = createTestConfiguration()
    const generated = await generateBadgeCredential(
      {
        speakerId: 'speaker-1',
        speakerName: 'Jane Doe',
        speakerEmail: 'Jane.Doe@Example.COM',
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
    credential = generated.credentialJson
  })

  it('pins proof.verificationMethod to the dereferenceable keys URL (no fragment)', () => {
    const vm = credential.proof[0].verificationMethod
    expect(vm).toBe(ed25519VerificationMethodUrl(BASE))
    expect(vm).toBe(`${BASE}/api/badge/keys/key-ed25519`)
    expect(vm).not.toContain('#')
  })

  it('emits an emailAddress IdentityObject in credentialSubject.identifier', () => {
    const identifier = credential.credentialSubject.identifier
    expect(Array.isArray(identifier)).toBe(true)
    expect(identifier).toHaveLength(1)
    expect(identifier![0]).toEqual({
      // type is the plain STRING "IdentityObject" per the OB 3.0 schema.
      type: 'IdentityObject',
      hashed: false,
      // plaintext, lowercased to match the normalized mailto: subject id.
      identityHash: 'jane.doe@example.com',
      identityType: 'emailAddress',
    })
  })

  it('keeps credentialSubject.id as the (normalized) mailto: URI', () => {
    expect(credential.credentialSubject.id).toBe('mailto:jane.doe@example.com')
  })

  it('validates against the official OpenBadges 3.0 JSON schema', () => {
    const result = validateCredential(credential)
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('round-trips through verifyCredential with the issuer public key', async () => {
    const publicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    expect(publicKey?.startsWith('z')).toBe(true)
    const ok = await verifyCredential(credential, publicKey!)
    expect(ok).toBe(true)
  })
})
