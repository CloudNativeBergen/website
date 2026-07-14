/**
 * Embedded Data Integrity Proof Tests (eddsa-rdfc-2022)
 *
 * Covers the Digital Bazaar-backed signing pipeline:
 * - seed-derived key sign -> verify round trip with a fully offline loader
 * - evidence at the credential top level (OB 3.0 schema + signing)
 * - proof normalized to a single-element array
 * - baked SVG extract -> verify round trip
 * - mailto: recipient emails lowercased in credentialSubject.id
 */

import {
  createCredential,
  signCredential,
  verifyCredential,
  validateCredential,
  seedToMultikey,
  bakeBadge,
  extractBadge,
  ConfigurationError,
  VerificationError,
} from '@/lib/openbadges'
import type { CredentialConfig } from '@/lib/openbadges'

const TEST_SEED =
  '4f7d2c1a9b3e5d806142f3a8c5b7e9d0112233445566778899aabbccddeeff00'

const BASE_URL = 'https://example.com'
const ISSUER_ID = `${BASE_URL}/api/badge/issuer`
const VERIFICATION_METHOD = `${ISSUER_ID}#key-ed25519`

const CREDENTIAL_CONFIG: CredentialConfig = {
  credentialId: `${BASE_URL}/api/badge/test-badge-1`,
  name: 'Speaker Badge for Test Conference 2026',
  issuer: {
    id: ISSUER_ID,
    name: 'Test Conference Org',
    url: BASE_URL,
    email: 'badges@example.com',
    description: 'Test issuer',
  },
  subject: {
    id: 'mailto:Speaker.Name@Example.COM',
    type: ['AchievementSubject'],
  },
  achievement: {
    id: `${BASE_URL}/api/badge/test-badge-1/achievement`,
    name: 'Speaker at Test Conference 2026',
    description: 'Recognizes a speaker at Test Conference 2026.',
    criteria: {
      narrative: 'Presented a talk at Test Conference 2026.',
    },
    image: {
      id: `${BASE_URL}/api/badge/test-badge-1/image`,
      type: 'Image',
    },
  },
  evidence: [
    {
      id: `${BASE_URL}/speaker/jane-doe`,
      type: ['Evidence'],
      name: 'Jane Doe Speaker Profile',
      description: 'Public speaker profile',
    },
  ],
  validFrom: '2026-01-01T00:00:00Z',
}

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#0f766e"/></svg>'

describe('Embedded proof - credential shape', () => {
  it('places evidence at the credential top level, not under achievement', () => {
    const credential = createCredential(CREDENTIAL_CONFIG)

    expect(credential.evidence).toHaveLength(1)
    expect(credential.evidence![0].id).toBe(`${BASE_URL}/speaker/jane-doe`)
    expect(credential.credentialSubject.achievement).not.toHaveProperty(
      'evidence',
    )
  })

  it('lowercases mailto: recipient emails in credentialSubject.id', () => {
    const credential = createCredential(CREDENTIAL_CONFIG)

    expect(credential.credentialSubject.id).toBe(
      'mailto:speaker.name@example.com',
    )
  })

  it('leaves non-mailto subject ids untouched', () => {
    const credential = createCredential({
      ...CREDENTIAL_CONFIG,
      subject: { id: 'did:example:Recipient', type: ['AchievementSubject'] },
    })

    expect(credential.credentialSubject.id).toBe('did:example:Recipient')
  })

  it('passes OB 3.0 schema validation with top-level evidence', () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const result = validateCredential(credential)

    expect(result.valid).toBe(true)
  })
})

describe('Embedded proof - seed-derived key material', () => {
  it('derives stable Multikey material from the seed', async () => {
    const first = await seedToMultikey(TEST_SEED)
    const second = await seedToMultikey(TEST_SEED)

    expect(first.publicKeyMultibase).toBe(second.publicKeyMultibase)
    expect(first.publicKeyMultibase).toMatch(/^z6Mk/)
    expect(first.publicKeyHex).toMatch(/^[0-9a-f]{64}$/)
    expect(first.did).toBe(`did:key:${first.publicKeyMultibase}`)
  })

  it('rejects seeds that are not 32 bytes', async () => {
    await expect(seedToMultikey('abcd')).rejects.toThrow()
  })
})

describe('Embedded proof - sign and verify round trip', () => {
  it('signs with the seed and verifies with the derived public key (offline)', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    // Proof is normalized to a single-element array
    expect(Array.isArray(signed.proof)).toBe(true)
    expect(signed.proof).toHaveLength(1)
    expect(signed.proof[0].type).toBe('DataIntegrityProof')
    expect(signed.proof[0].cryptosuite).toBe('eddsa-rdfc-2022')
    expect(signed.proof[0].proofPurpose).toBe('assertionMethod')
    expect(signed.proof[0].verificationMethod).toBe(VERIFICATION_METHOD)
    expect(signed.proof[0].proofValue).toMatch(/^z/)

    // Evidence survives signing at the top level
    expect(signed.evidence).toHaveLength(1)

    // Schema validation of the signed credential
    expect(validateCredential(signed).valid).toBe(true)

    // Verify with the multibase public key derived from the seed
    const { publicKeyMultibase, publicKeyHex } = await seedToMultikey(TEST_SEED)
    await expect(verifyCredential(signed, publicKeyMultibase)).resolves.toBe(
      true,
    )
    // Hex form of the same key also verifies
    await expect(verifyCredential(signed, publicKeyHex)).resolves.toBe(true)
  })

  it('fails verification with a different public key', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    const otherSeed = 'ab'.repeat(32)
    const { publicKeyMultibase } = await seedToMultikey(otherSeed)
    await expect(verifyCredential(signed, publicKeyMultibase)).resolves.toBe(
      false,
    )
  })

  it('fails verification when the credential is tampered with', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    const tampered = {
      ...signed,
      name: 'Organizer Badge for Someone Else',
    }

    const { publicKeyMultibase } = await seedToMultikey(TEST_SEED)
    await expect(verifyCredential(tampered, publicKeyMultibase)).resolves.toBe(
      false,
    )
  })

  it('rejects a public key mismatch at signing time', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const { publicKeyHex } = await seedToMultikey('ab'.repeat(32))

    await expect(
      signCredential(credential, {
        privateKey: TEST_SEED,
        publicKey: publicKeyHex,
        verificationMethod: VERIFICATION_METHOD,
      }),
    ).rejects.toThrow('Public key does not match private key')
  })

  it('rejects invalid seeds and verification methods with ConfigurationError', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)

    await expect(
      signCredential(credential, {
        privateKey: 'not-hex',
        verificationMethod: VERIFICATION_METHOD,
      }),
    ).rejects.toThrow(ConfigurationError)

    await expect(
      signCredential(credential, {
        privateKey: TEST_SEED,
        verificationMethod: 'not-a-url',
      }),
    ).rejects.toThrow(ConfigurationError)
  })
})

describe('Embedded proof - trust anchor is the passed public key', () => {
  it('rejects a forged did:key credential when verified with OUR key', async () => {
    // Attacker crafts a credential whose issuer.id is OUR issuer, but points
    // the proof's verificationMethod at THEIR own did:key and self-signs it.
    const attackerSeed = 'cd'.repeat(32)
    const attacker = await seedToMultikey(attackerSeed)
    const attackerVm = `did:key:${attacker.publicKeyMultibase}#${attacker.publicKeyMultibase}`

    const credential = createCredential(CREDENTIAL_CONFIG) // issuer = OUR issuer
    const forged = await signCredential(credential, {
      privateKey: attackerSeed,
      verificationMethod: attackerVm,
    })

    // The forged credential is internally self-consistent: it verifies against
    // the attacker's OWN key...
    await expect(
      verifyCredential(forged, attacker.publicKeyMultibase),
    ).resolves.toBe(true)

    // ...but MUST NOT verify against our trusted key. The did:key embedded in
    // the proof must never substitute for the passed public key.
    const { publicKeyMultibase: ourKey } = await seedToMultikey(TEST_SEED)
    await expect(verifyCredential(forged, ourKey)).resolves.toBe(false)
  })

  it('rejects a credential carrying more than one proof', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    const multiProof = {
      ...signed,
      proof: [signed.proof[0], { ...signed.proof[0] }],
    }

    const { publicKeyMultibase } = await seedToMultikey(TEST_SEED)
    await expect(
      verifyCredential(multiProof, publicKeyMultibase),
    ).rejects.toThrow(VerificationError)
  })
})

describe('Embedded proof - baked SVG round trip', () => {
  it('bakes, extracts and verifies the embedded-proof credential', async () => {
    const credential = createCredential(CREDENTIAL_CONFIG)
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    const baked = bakeBadge(SVG, signed)
    expect(baked).toContain('<openbadges:credential>')
    expect(baked).toContain('<![CDATA[')
    // Embedded-proof baking must NOT use the JWT verify attribute
    expect(baked).not.toContain('verify=')

    const extracted = extractBadge(baked)
    if (typeof extracted === 'string') {
      throw new Error('Expected embedded-proof credential, got JWT')
    }

    expect(extracted).toEqual(signed)

    const { publicKeyMultibase } = await seedToMultikey(TEST_SEED)
    await expect(verifyCredential(extracted, publicKeyMultibase)).resolves.toBe(
      true,
    )
  })

  it('round-trips and still verifies when a speaker-controlled field contains a CDATA terminator', async () => {
    // A malicious/careless speaker name embeds the literal `]]>` (and markup).
    // Naively baked into <![CDATA[...]]> it would close the section early,
    // breaking extraction and injecting <script> into the downloaded SVG.
    const hostileName = 'Foo]]><script>alert(1)</script>'
    const credential = createCredential({
      ...CREDENTIAL_CONFIG,
      name: hostileName,
    })
    const signed = await signCredential(credential, {
      privateKey: TEST_SEED,
      verificationMethod: VERIFICATION_METHOD,
    })

    const baked = bakeBadge(SVG, signed)

    // The escape must produce adjacent CDATA sections, and the raw `]]>` must
    // never appear followed by injected markup outside a CDATA section.
    expect(baked).toContain(']]]]><![CDATA[>')
    expect(baked).not.toContain('Foo]]><script>')

    const extracted = extractBadge(baked)
    if (typeof extracted === 'string') {
      throw new Error('Expected embedded-proof credential, got JWT')
    }

    // Byte-identical recovery of the signed credential (object equality).
    expect(extracted).toEqual(signed)
    expect(extracted.name).toBe(hostileName)

    // Signature is intact after the transport-only escape round trip.
    const { publicKeyMultibase } = await seedToMultikey(TEST_SEED)
    await expect(verifyCredential(extracted, publicKeyMultibase)).resolves.toBe(
      true,
    )
  })
})
