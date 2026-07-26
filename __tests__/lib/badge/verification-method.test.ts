/**
 * @vitest-environment node
 *
 * Embedded-proof verification-method helpers. The 1EdTech EmbeddedProofProbe
 * dereferences proof.verificationMethod and reads controller/publicKeyMultibase
 * off the RESPONSE ROOT, so the proof must point at a dereferenceable keys URL
 * that returns a bare Multikey — not an issuer-profile fragment. These pin the
 * URL shape, the bare Multikey document, and the back-compat accept-list.
 */
import { describe, it, expect } from 'vitest'
import {
  ED25519_KEY_ID,
  ed25519VerificationMethodUrl,
  legacyEd25519VerificationMethod,
  baseUrlFromIssuerId,
  acceptedEd25519VerificationMethods,
  buildEd25519MultikeyDocument,
} from '@/lib/badge/verification-method'

const BASE = 'https://cloudnativedays.no'
const ISSUER_ID = `${BASE}/api/badge/issuer`
const KEY_DOC_URL = `${BASE}/api/badge/keys/key-ed25519`
const PUBLIC_KEY_MULTIBASE = 'z6MkfExampleExampleExampleExampleExampleExample'

describe('verification-method helpers', () => {
  it('exposes the key id and dereferenceable URL (no fragment)', () => {
    expect(ED25519_KEY_ID).toBe('key-ed25519')
    expect(ed25519VerificationMethodUrl(BASE)).toBe(KEY_DOC_URL)
    expect(ed25519VerificationMethodUrl(BASE)).not.toContain('#')
  })

  it('tolerates a trailing slash on the base URL', () => {
    expect(ed25519VerificationMethodUrl(`${BASE}/`)).toBe(KEY_DOC_URL)
  })

  it('builds the legacy issuer-profile fragment and recovers the base URL', () => {
    expect(legacyEd25519VerificationMethod(ISSUER_ID)).toBe(
      `${ISSUER_ID}#key-ed25519`,
    )
    expect(baseUrlFromIssuerId(ISSUER_ID)).toBe(BASE)
  })

  it('accepts BOTH the current URL and the legacy fragment for a given issuer', () => {
    expect(acceptedEd25519VerificationMethods(ISSUER_ID)).toEqual([
      KEY_DOC_URL,
      `${ISSUER_ID}#key-ed25519`,
    ])
  })

  it('does NOT accept a foreign / did:key verification method', () => {
    const accepted = acceptedEd25519VerificationMethods(ISSUER_ID)
    expect(accepted).not.toContain(
      'did:key:z6MkvRQ7bnwBVzwozkkbasYzntpfnWJBsHfB1EfWFeFErgoy#z6MkvRQ7bnwBVzwozkkbasYzntpfnWJBsHfB1EfWFeFErgoy',
    )
    expect(accepted).not.toContain(
      'https://evil.example/api/badge/keys/key-ed25519',
    )
  })

  it('builds a bare Multikey document with controller + publicKeyMultibase at the root', () => {
    const doc = buildEd25519MultikeyDocument(BASE, PUBLIC_KEY_MULTIBASE)
    // Exactly the members the EmbeddedProofProbe reads off the root.
    expect(doc).toEqual({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: KEY_DOC_URL,
      type: 'Multikey',
      controller: ISSUER_ID,
      publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
    })
    // The probe does getString("controller") / getString("publicKeyMultibase")
    // on the response root — both MUST be present there (the NPE otherwise).
    expect(typeof doc.controller).toBe('string')
    expect(typeof doc.publicKeyMultibase).toBe('string')
  })
})

describe('acceptedEd25519VerificationMethods — malformed issuer ids', () => {
  it('returns an empty accept-list (untrusted, not a throw) for missing/non-string ids', () => {
    expect(acceptedEd25519VerificationMethods(undefined)).toEqual([])
    expect(acceptedEd25519VerificationMethods(null)).toEqual([])
    expect(acceptedEd25519VerificationMethods('')).toEqual([])
  })
})
