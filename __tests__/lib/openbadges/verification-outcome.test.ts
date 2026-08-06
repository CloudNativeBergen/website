/**
 * #859. `verifyCredential` returned a `boolean`, and its catch arm returned
 * `false`. A boolean cannot say "I could not evaluate this", so a malformed
 * key or a missing env var was indistinguishable from "this credential is
 * forged" — served to Credly, the 1EdTech validator and LinkedIn importers,
 * and cached by them for an hour.
 *
 * The classification is the whole fix, so these tests pin every failure mode
 * individually. The rule they encode:
 *
 *   indeterminate  <=  the TRUST ANCHOR (our key) is unusable
 *   invalid        <=  anything determined by the credential bytes
 *
 * The asymmetry is deliberate. Credential bytes are presenter-controlled: if a
 * hostile credential could push us into `indeterminate`, a forger would have a
 * button that suppresses the negative verdict. Our own key is not something a
 * presenter can touch, so it is the only safe source of "we don't know".
 */

import {
  createCredential,
  signCredential,
  signCredentialJWT,
  verifyCredential,
  verifyCredentialJWT,
  seedToMultikey,
  TrustAnchorError,
  VerificationError,
} from '@/lib/openbadges'
import type { CredentialConfig, SignedCredential } from '@/lib/openbadges'

const TEST_SEED =
  '4f7d2c1a9b3e5d806142f3a8c5b7e9d0112233445566778899aabbccddeeff00'
const BASE_URL = 'https://example.com'
const ISSUER_ID = `${BASE_URL}/api/badge/issuer`
const VERIFICATION_METHOD = `${BASE_URL}/api/badge/keys/key-ed25519`

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
    id: 'mailto:speaker.name@example.com',
    type: ['AchievementSubject'],
  },
  achievement: {
    id: `${BASE_URL}/api/badge/test-badge-1/achievement`,
    name: 'Speaker at Test Conference 2026',
    description: 'Recognizes a speaker at Test Conference 2026.',
    criteria: { narrative: 'Presented a talk at Test Conference 2026.' },
    image: {
      id: `${BASE_URL}/api/badge/test-badge-1/image`,
      type: 'Image',
    },
  },
  validFrom: '2026-01-01T00:00:00Z',
}

let signed: SignedCredential
let ourKeyMultibase: string
let ourKeyHex: string

beforeAll(async () => {
  signed = await signCredential(createCredential(CREDENTIAL_CONFIG), {
    privateKey: TEST_SEED,
    verificationMethod: VERIFICATION_METHOD,
  })
  const key = await seedToMultikey(TEST_SEED)
  ourKeyMultibase = key.publicKeyMultibase
  ourKeyHex = key.publicKeyHex
})

describe('verifyCredential: a genuine badge verifies', () => {
  it('accepts the multibase form of the issuer key', async () => {
    expect(await verifyCredential(signed, ourKeyMultibase)).toEqual({
      status: 'verified',
    })
  })

  it('accepts the hex form of the same key', async () => {
    expect(await verifyCredential(signed, ourKeyHex)).toEqual({
      status: 'verified',
    })
  })
})

/**
 * OUR configuration is broken. None of these say anything about the badge, so
 * none of them may produce a verdict.
 */
describe('verifyCredential: an unusable trust anchor is indeterminate', () => {
  const unusableKeys: Array<[string, string]> = [
    // The literal rotation accident: the env var was cleared.
    ['an empty string', ''],
    // Truncated during a copy/paste out of a secrets manager.
    ['a truncated multibase key', 'z6MkttqCZq2u9Jc1jvuUSffPwukNMKNY'],
    // Base58 excludes 0/O/I/l, so a mangled key often is not even base58.
    ['a multibase key with non-base58 characters', 'z6Mk0OIl++++'],
    // The multicodec prefix says this is not Ed25519.
    ['a multibase key that is not an Ed25519 Multikey', 'z2DrjgbFY1sr'],
    // Hex, but not 32 bytes.
    ['a short hex key', 'deadbeef'],
    // Right length, wrong alphabet.
    ['a 64-character string that is not hex', 'g'.repeat(64)],
    // Someone pasted the RSA PEM into the Ed25519 variable.
    ['a PEM public key in the Ed25519 slot', '-----BEGIN PUBLIC KEY-----'],
  ]

  it.each(unusableKeys)(
    'reports indeterminate, not invalid, for %s',
    async (_label, key) => {
      const outcome = await verifyCredential(signed, key)

      expect(outcome.status).toBe('indeterminate')
      // The bug, stated as an assertion: a genuine badge must never be called
      // forged because OUR key is broken.
      expect(outcome.status).not.toBe('invalid')
    },
  )

  it('names a missing key separately from a corrupt one', async () => {
    expect(await verifyCredential(signed, '')).toMatchObject({
      status: 'indeterminate',
      reason: 'missing-trust-anchor',
    })
    expect(
      await verifyCredential(signed, 'z6MkttqCZq2u9Jc1jvuUSffPwukNMKNY'),
    ).toMatchObject({
      status: 'indeterminate',
      reason: 'unusable-trust-anchor',
    })
  })

  it('treats a non-string key as missing rather than crashing', async () => {
    expect(
      await verifyCredential(signed, undefined as unknown as string),
    ).toMatchObject({ status: 'indeterminate', reason: 'missing-trust-anchor' })
  })

  /**
   * The honest limit. A trust anchor that is well-formed but simply WRONG is
   * indistinguishable from a bad signature from inside this function — there
   * is no second anchor to check it against — so it still reports `invalid`.
   * Detectable corruption (truncation, wrong alphabet, wrong codec, empty)
   * covers the realistic rotation accidents; substituting one valid Ed25519
   * key for another does not.
   */
  it('DOCUMENTED LIMIT: a valid-but-wrong key is still reported invalid', async () => {
    const { publicKeyMultibase: someoneElsesKey } = await seedToMultikey(
      'ab'.repeat(32),
    )

    expect(await verifyCredential(signed, someoneElsesKey)).toMatchObject({
      status: 'invalid',
      reason: 'signature-mismatch',
    })
  })
})

/**
 * The other direction — the one that makes the tests above mean something.
 * Everything a presenter controls stays a verdict.
 */
describe('verifyCredential: credential-caused failures stay verdicts', () => {
  it('reports a tampered credential as invalid', async () => {
    const tampered = { ...signed, name: 'Organizer Badge for Someone Else' }

    expect(await verifyCredential(tampered, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
    })
  })

  it('reports a corrupted proofValue as invalid', async () => {
    const corrupted = {
      ...signed,
      proof: [{ ...signed.proof[0], proofValue: 'zAAAAAAAAAAAAAAAAAAAA' }],
    }

    expect(await verifyCredential(corrupted, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
    })
  })

  it('reports a missing proof as invalid/no-proof', async () => {
    const { proof: _proof, ...unsigned } = signed

    expect(
      await verifyCredential(unsigned as SignedCredential, ourKeyMultibase),
    ).toMatchObject({ status: 'invalid', reason: 'no-proof' })
  })

  it('reports an empty proof array as invalid/no-proof', async () => {
    expect(
      await verifyCredential({ ...signed, proof: [] }, ourKeyMultibase),
    ).toMatchObject({ status: 'invalid', reason: 'no-proof' })
  })

  it('reports a proof set as invalid/proof-set', async () => {
    const multiProof = {
      ...signed,
      proof: [signed.proof[0], { ...signed.proof[0] }],
    }

    expect(await verifyCredential(multiProof, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'proof-set',
    })
  })

  it('reports an unsupported proof type as invalid, NOT indeterminate', async () => {
    // proof.type is presenter-chosen. If "we do not implement that" were
    // indeterminate, a forger could pick an exotic type to dodge the verdict.
    const other = {
      ...signed,
      proof: [{ ...signed.proof[0], type: 'Ed25519Signature2020' }],
    } as unknown as SignedCredential

    expect(await verifyCredential(other, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'unsupported-proof-type',
    })
  })

  it('reports an unsupported cryptosuite as invalid, NOT indeterminate', async () => {
    const other = {
      ...signed,
      proof: [{ ...signed.proof[0], cryptosuite: 'ecdsa-rdfc-2019' }],
    } as unknown as SignedCredential

    expect(await verifyCredential(other, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'unsupported-cryptosuite',
    })
  })

  it('reports a foreign did:key verification method as invalid', async () => {
    const attackerSeed = 'cd'.repeat(32)
    const attacker = await seedToMultikey(attackerSeed)
    const forged = await signCredential(createCredential(CREDENTIAL_CONFIG), {
      privateKey: attackerSeed,
      verificationMethod: `did:key:${attacker.publicKeyMultibase}#${attacker.publicKeyMultibase}`,
    })

    expect(await verifyCredential(forged, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'untrusted-verification-method',
    })
  })

  it('reports a malformed did: verification method as invalid', async () => {
    const bogus = {
      ...signed,
      proof: [
        { ...signed.proof[0], verificationMethod: 'did:example:not-a-key' },
      ],
    }

    expect(await verifyCredential(bogus, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'untrusted-verification-method',
    })
  })

  it('reports a credential naming an unresolvable context as invalid', async () => {
    // The loader is fully offline; the DB stack reports this as a failed
    // proof rather than throwing. Either way it is the credential's doing.
    const badContext = {
      ...signed,
      '@context': ['https://example.invalid/nope.jsonld'],
    }

    expect(
      await verifyCredential(
        badContext as unknown as SignedCredential,
        ourKeyMultibase,
      ),
    ).toMatchObject({ status: 'invalid' })
  })

  it('routes an unexpected throw to invalid/malformed-credential', async () => {
    // A non-string verificationMethod blows up on `.startsWith` inside the
    // try. That catch-all used to `return false`; it must stay a verdict and
    // must never be laundered into "we could not tell".
    const hostile = {
      ...signed,
      proof: [{ ...signed.proof[0], verificationMethod: null }],
    } as unknown as SignedCredential

    expect(await verifyCredential(hostile, ourKeyMultibase)).toMatchObject({
      status: 'invalid',
      reason: 'malformed-credential',
    })
  })

  it('never returns indeterminate for any credential-shaped input', async () => {
    const hostileVariants: SignedCredential[] = [
      { ...signed, proof: [] } as SignedCredential,
      { ...signed, proof: 'not-an-array' } as unknown as SignedCredential,
      { ...signed, issuer: undefined } as unknown as SignedCredential,
      { ...signed, credentialSubject: null } as unknown as SignedCredential,
      {
        ...signed,
        proof: [{ ...signed.proof[0], verificationMethod: '' }],
      } as SignedCredential,
    ]

    for (const variant of hostileVariants) {
      const outcome = await verifyCredential(variant, ourKeyMultibase)
      expect(outcome.status).not.toBe('indeterminate')
    }
  })
})

/**
 * The legacy JWT path (RS256, still how the 1EdTech validator reads our
 * badges) collapsed the same way: an unusable key threw the very same
 * VerificationError as a forged signature, and the route cached the result.
 */
describe('verifyCredentialJWT: an unusable key is not a bad signature', () => {
  let jwt: string

  beforeAll(async () => {
    jwt = await signCredentialJWT(createCredential(CREDENTIAL_CONFIG), {
      privateKey: TEST_SEED,
      publicKey: ourKeyHex,
      verificationMethod: VERIFICATION_METHOD,
    })
  })

  it('verifies the genuine JWT with the genuine key', async () => {
    const credential = await verifyCredentialJWT(jwt, ourKeyHex)
    expect(credential.id).toBe(CREDENTIAL_CONFIG.credentialId)
  })

  it('throws TrustAnchorError for a PEM that will not parse', async () => {
    // jose accepts this PEM and only fails later inside jwtVerify — wearing
    // the disguise of a bad signature. The key must be parsed eagerly.
    const brokenPem =
      '-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----\n'

    await expect(verifyCredentialJWT(jwt, brokenPem)).rejects.toThrow(
      TrustAnchorError,
    )
  })

  it('throws TrustAnchorError for a corrupt Ed25519 hex key', async () => {
    await expect(
      verifyCredentialJWT(jwt, ourKeyHex.slice(0, 40)),
    ).rejects.toThrow(TrustAnchorError)
  })

  /**
   * The counterweight: with a usable key, a tampered JWT is still a verdict.
   *
   * NOTE ON REACH: `jose` is aliased to `__tests__/mocks/jose.ts` suite-wide,
   * so this asserts the CLASSIFICATION (verdict vs non-answer), not Ed25519
   * mathematics. That is the part #859 is about; real signature checking is
   * covered by the Data Integrity tests above, which use the unmocked
   * Digital Bazaar stack.
   */
  it('STILL throws VerificationError for a genuinely bad signature', async () => {
    const [header, payload] = jwt.split('.')
    const forged = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAA`

    await expect(verifyCredentialJWT(forged, ourKeyHex)).rejects.toThrow(
      VerificationError,
    )
    await expect(verifyCredentialJWT(forged, ourKeyHex)).rejects.not.toThrow(
      TrustAnchorError,
    )
  })
})
