/**
 * Cryptographic Operations
 *
 * OpenBadges 3.0 supports two proof formats:
 * 1. Data Integrity Proofs (eddsa-rdfc-2022 cryptosuite) - JSON-LD embedded
 *    proofs, implemented with the Digital Bazaar reference stack
 *    (@digitalbazaar/vc + data-integrity + eddsa-rdfc-2022-cryptosuite).
 *    This is the format certified OB 3.0 displayers (e.g. Credly) verify.
 * 2. JWT Proofs (RFC7519/RFC7515) - RS256 Compact JWS for the 1EdTech
 *    OB30Inspector validator.
 */

import * as vc from '@digitalbazaar/vc'
import { DataIntegrityProof as DataIntegrityProofSuite } from '@digitalbazaar/data-integrity'
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey'
import { securityLoader } from '@digitalbazaar/security-document-loader'
import jsigs from 'jsonld-signatures'
import {
  SignJWT,
  jwtVerify,
  importJWK,
  importPKCS8,
  importSPKI,
  type JWK,
  type JWTPayload,
} from 'jose'
import { createPublicKey } from 'crypto'
import { hexToBytes, bytesToHex } from './encoding'
import { publicKeyToMultibase, didKeyToPublicKeyHex } from './keys'
import { SigningError, VerificationError, ConfigurationError } from './errors'
import obContext from './data/ob-v3p0-context-3.0.3.json'
import type {
  Credential,
  SignedCredential,
  SigningConfig,
  EmbeddedProofSigningConfig,
  DataIntegrityProof,
} from './types'

const OB_CONTEXT_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'

/**
 * Build a fully offline JSON-LD document loader.
 *
 * Digital Bazaar's securityLoader ships the W3C credentials v1/v2, DID and
 * security contexts and resolves did:key URIs locally. The official
 * OpenBadges 3.0 context is vendored (see ./data) so signing and verifying
 * our own credentials NEVER fetches documents over the network.
 *
 * @param staticDocuments - Additional documents (e.g. verification method
 *   documents) to serve statically by URL.
 */
function createDocumentLoader(
  staticDocuments?: Map<string, Record<string, unknown>>,
): (url: string) => Promise<unknown> {
  const loader = securityLoader()
  loader.addStatic(OB_CONTEXT_URL, obContext)
  if (staticDocuments) {
    for (const [url, document] of staticDocuments) {
      loader.addStatic(url, document)
    }
  }
  return loader.build()
}

function cleanHex(hex: string): string {
  return hex.replace(/^0x/, '').replace(/\s/g, '')
}

/**
 * Derive an Ed25519Multikey key pair from a 32-byte seed (64 hex characters).
 */
async function keyPairFromSeed(seedHex: string) {
  const seed = hexToBytes(cleanHex(seedHex))
  if (seed.length !== 32) {
    throw new ConfigurationError(
      'Ed25519 seed must be 32 bytes (64 hex characters)',
      { length: seed.length, expected: 32 },
    )
  }
  return Ed25519Multikey.generate({ seed })
}

/**
 * Derive the Multikey material (publicKeyMultibase, hex, did:key) from a
 * 32-byte Ed25519 seed. Used by the issuer profile endpoint and the key
 * generation script.
 */
export async function seedToMultikey(seedHex: string): Promise<{
  publicKeyMultibase: string
  publicKeyHex: string
  did: string
}> {
  const keyPair = await keyPairFromSeed(seedHex)
  const { publicKey } = await keyPair.export({ publicKey: true, raw: true })
  return {
    publicKeyMultibase: keyPair.publicKeyMultibase,
    publicKeyHex: bytesToHex(publicKey),
    did: `did:key:${keyPair.publicKeyMultibase}`,
  }
}

function validateEmbeddedSigningConfig(
  config: EmbeddedProofSigningConfig,
): void {
  if (!config.privateKey || typeof config.privateKey !== 'string') {
    throw new ConfigurationError(
      'Private key (Ed25519 seed) is required and must be a hex string',
      { hasPrivateKey: !!config.privateKey },
    )
  }

  if (cleanHex(config.privateKey).length !== 64) {
    throw new ConfigurationError(
      'Private key must be 32 bytes (64 hex characters)',
      { length: cleanHex(config.privateKey).length, expected: 64 },
    )
  }

  if (
    !config.verificationMethod ||
    typeof config.verificationMethod !== 'string'
  ) {
    throw new ConfigurationError('Verification method URL is required', {
      hasVerificationMethod: !!config.verificationMethod,
    })
  }

  if (!config.verificationMethod.startsWith('did:')) {
    try {
      new URL(config.verificationMethod)
    } catch {
      throw new ConfigurationError('Verification method must be a valid URL', {
        verificationMethod: config.verificationMethod,
      })
    }
  }
}

function validateSigningConfig(config: SigningConfig): void {
  if (!config.privateKey || typeof config.privateKey !== 'string') {
    throw new ConfigurationError(
      'Private key is required and must be a hex string',
      { hasPrivateKey: !!config.privateKey },
    )
  }

  if (!config.publicKey || typeof config.publicKey !== 'string') {
    throw new ConfigurationError(
      'Public key is required and must be a hex string',
      { hasPublicKey: !!config.publicKey },
    )
  }

  if (
    !config.verificationMethod ||
    typeof config.verificationMethod !== 'string'
  ) {
    throw new ConfigurationError('Verification method URL is required', {
      hasVerificationMethod: !!config.verificationMethod,
    })
  }

  const cleanedPrivateKey = config.privateKey
    .replace(/^0x/, '')
    .replace(/\s/g, '')
  const cleanedPublicKey = config.publicKey
    .replace(/^0x/, '')
    .replace(/\s/g, '')

  if (cleanedPrivateKey.length !== 64) {
    throw new ConfigurationError(
      'Private key must be 32 bytes (64 hex characters)',
      { length: cleanedPrivateKey.length, expected: 64 },
    )
  }

  if (cleanedPublicKey.length !== 64) {
    throw new ConfigurationError(
      'Public key must be 32 bytes (64 hex characters)',
      { length: cleanedPublicKey.length, expected: 64 },
    )
  }

  try {
    new URL(config.verificationMethod)
  } catch {
    throw new ConfigurationError('Verification method must be a valid URL', {
      verificationMethod: config.verificationMethod,
    })
  }
}

/**
 * Sign a credential with an embedded Data Integrity Proof
 * (eddsa-rdfc-2022 cryptosuite) using the Digital Bazaar reference stack.
 *
 * The proof is normalized to a single-element array to match the repo's
 * SignedCredential type and the OB 3.0 JSON schema.
 *
 * @param credential - The unsigned credential (evidence at the TOP level;
 *   the OB 3.0 context rejects evidence nested under achievement)
 * @param config - privateKey is the 32-byte Ed25519 seed as 64 hex chars;
 *   verificationMethod must dereference to a Multikey document whose
 *   controller equals the credential's issuer.id
 */
export async function signCredential(
  credential: Credential,
  config: EmbeddedProofSigningConfig,
): Promise<SignedCredential> {
  validateEmbeddedSigningConfig(config)

  try {
    const keyPair = await keyPairFromSeed(config.privateKey)

    if (config.publicKey) {
      const { publicKey } = await keyPair.export({
        publicKey: true,
        raw: true,
      })
      const derivedPublicKey = bytesToHex(publicKey)
      const providedPublicKey = cleanHex(config.publicKey).toLowerCase()
      if (derivedPublicKey !== providedPublicKey) {
        throw new SigningError('Public key does not match private key', {
          providedPublicKey,
          derivedPublicKey,
        })
      }
    }

    // The signer's id becomes the proof's verificationMethod
    keyPair.id = config.verificationMethod

    const suite = new DataIntegrityProofSuite({
      signer: keyPair.signer(),
      cryptosuite: eddsaRdfc2022CryptoSuite,
    })

    const signed = await vc.issue({
      credential: JSON.parse(JSON.stringify(credential)),
      suite,
      documentLoader: createDocumentLoader(),
    })

    // vc.issue emits a single proof object; normalize to an array
    const proof: DataIntegrityProof[] = Array.isArray(signed.proof)
      ? signed.proof
      : [signed.proof]

    return { ...signed, proof } as SignedCredential
  } catch (error) {
    if (error instanceof SigningError || error instanceof ConfigurationError) {
      throw error
    }
    throw new SigningError('Failed to sign credential', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

/**
 * Verify a credential's embedded Data Integrity Proof (eddsa-rdfc-2022)
 * using the Digital Bazaar reference stack with a fully offline loader.
 *
 * For HTTP(S) verification methods the Multikey document is constructed
 * locally from the supplied public key (hex or multibase) with
 * controller = issuer.id, so no network fetch is performed. did:key
 * verification methods are resolved locally by the loader (the supplied
 * public key is implied by the DID itself).
 *
 * @param credential - Signed credential with a proof array
 * @param publicKey - Ed25519 public key as 64 hex chars or multibase (z...)
 * @returns true when the proof verifies, false otherwise
 */
export async function verifyCredential(
  credential: SignedCredential,
  publicKey: string,
): Promise<boolean> {
  if (!publicKey || typeof publicKey !== 'string') {
    throw new VerificationError(
      'Public key is required and must be a hex string',
      { hasPublicKey: !!publicKey },
    )
  }

  if (
    !credential.proof ||
    !Array.isArray(credential.proof) ||
    credential.proof.length === 0
  ) {
    throw new VerificationError('Credential must have at least one proof', {
      hasProof: !!credential.proof,
    })
  }

  // We only ever issue a single proof. Reject proof sets: the type /
  // cryptosuite guards below only inspect proof[0], but vc.verifyCredential
  // would select whichever proof matches the suite, so a second proof could
  // slip past the gate. Binding to exactly one proof keeps the gate honest.
  if (credential.proof.length !== 1) {
    throw new VerificationError('Credential must have exactly one proof', {
      proofCount: credential.proof.length,
    })
  }

  const proof = credential.proof[0]

  if (proof.type !== 'DataIntegrityProof') {
    throw new VerificationError('Unsupported proof type', {
      proofType: proof.type,
      expected: 'DataIntegrityProof',
    })
  }

  if (proof.cryptosuite !== 'eddsa-rdfc-2022') {
    throw new VerificationError('Unsupported cryptosuite', {
      cryptosuite: proof.cryptosuite,
      expected: 'eddsa-rdfc-2022',
    })
  }

  try {
    const issuerId =
      typeof credential.issuer === 'object'
        ? credential.issuer.id
        : (credential.issuer as string)
    const verificationMethodId = proof.verificationMethod

    const staticDocuments = new Map<string, Record<string, unknown>>()
    let purpose
    if (verificationMethodId.startsWith('did:')) {
      // A did: verification method resolves its key locally from the DID
      // itself. That key must NOT be allowed to substitute for the trust
      // anchor: the `publicKey` argument is the sole root of trust. Decode
      // the did:key to its Ed25519 key and require it to equal the passed
      // key before allowing the DID-based resolution — otherwise an attacker
      // could self-sign with their own key under a did:key VM and have it
      // accepted against our key.
      const didKeyOnly = verificationMethodId.split('#')[0]
      let vmPublicKeyMultibase: string
      try {
        // Validates that this is an Ed25519 did:key and normalizes the key.
        vmPublicKeyMultibase = publicKeyToMultibase(
          didKeyToPublicKeyHex(didKeyOnly),
        )
      } catch {
        // Unsupported / malformed did: method — cannot bind to the trust
        // anchor, so refuse to trust it.
        return false
      }
      const trustedMultibase = publicKey.startsWith('z')
        ? publicKey
        : publicKeyToMultibase(publicKey)
      if (vmPublicKeyMultibase !== trustedMultibase) {
        // The DID's embedded key differs from the trusted public key: do NOT
        // let the DID resolve its own (untrusted) key.
        return false
      }
      purpose = new jsigs.purposes.AssertionProofPurpose()
    } else {
      const publicKeyMultibase = publicKey.startsWith('z')
        ? publicKey
        : publicKeyToMultibase(publicKey)
      staticDocuments.set(verificationMethodId, {
        '@context': 'https://w3id.org/security/multikey/v1',
        id: verificationMethodId,
        type: 'Multikey',
        controller: issuerId,
        publicKeyMultibase,
      })
      // Provide the controller document directly: the issuer authorizes the
      // verification method for assertions (mirrors the public issuer
      // profile served at /api/badge/issuer).
      purpose = new jsigs.purposes.AssertionProofPurpose({
        controller: {
          id: issuerId,
          assertionMethod: [verificationMethodId],
        },
      })
    }

    const result = await vc.verifyCredential({
      credential: JSON.parse(JSON.stringify(credential)),
      suite: new DataIntegrityProofSuite({
        cryptosuite: eddsaRdfc2022CryptoSuite,
      }),
      documentLoader: createDocumentLoader(staticDocuments),
      purpose,
    })

    return result.verified === true
  } catch {
    // Return false for invalid signatures or unresolvable documents
    return false
  }
}

/**
 * Convert Ed25519 private key (hex) to JWK format for JWT signing
 */
function privateKeyToJWK(privateKeyHex: string, publicKeyHex: string): JWK {
  // Remove 0x prefix if present
  const cleanPrivateKey = privateKeyHex.replace(/^0x/, '').replace(/\s/g, '')
  const cleanPublicKey = publicKeyHex.replace(/^0x/, '').replace(/\s/g, '')

  // Ed25519 keys in JWK format use base64url encoding
  const privateKeyBytes = hexToBytes(cleanPrivateKey)
  const publicKeyBytes = hexToBytes(cleanPublicKey)

  // Convert to base64url
  const d = Buffer.from(privateKeyBytes).toString('base64url')
  const x = Buffer.from(publicKeyBytes).toString('base64url')

  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
    d,
  }
}

/**
 * Convert Ed25519 public key (hex) to JWK format for JWT verification
 */
function publicKeyToJWK(publicKeyHex: string): JWK {
  const cleanPublicKey = publicKeyHex.replace(/^0x/, '').replace(/\s/g, '')
  const publicKeyBytes = hexToBytes(cleanPublicKey)
  const x = Buffer.from(publicKeyBytes).toString('base64url')

  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
  }
}

/**
 * Convert RSA public key (PEM) to JWK format for JWT verification
 * Extracts n (modulus) and e (exponent) from the public key
 * @internal - Used by issuer endpoint for exposing public key
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function rsaPublicKeyToJWK(publicKeyPem: string): JWK {
  const publicKey = createPublicKey(publicKeyPem)
  const jwk = publicKey.export({ format: 'jwk' })
  return jwk as JWK
}

/**
 * Sign a credential using JWT format (Compact JWS) with RS256
 * Returns the JWT as a string (this IS the signed credential)
 *
 * Per OpenBadges 3.0 spec section "JSON Web Token Proof Format":
 * - JOSE header includes: kid (verification method URL), jwk (public key), typ: "JWT", alg: "RS256"
 * - Payload includes entire credential plus iss, exp, nbf, jti
 * - Compact JWS format: base64url(header).base64url(payload).base64url(signature)
 *
 * CRITICAL VALIDATION REQUIREMENTS:
 * - Algorithm MUST be RS256 or ES256 for 1EdTech validator compliance
 * - EdDSA is NOT supported by the official 1EdTech OB30Inspector validator
 * - The kid URL MUST be a direct HTTP endpoint (no fragment identifiers)
 * - Fragment identifiers (#key-1) are stripped by HTTP clients and cause validation failures
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#external-proof-jwt-proof
 * @see https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/ExternalProofProbe.java#L54-57
 */
export async function signCredentialJWT(
  credential: Credential,
  config: SigningConfig,
): Promise<string> {
  try {
    // Check if we have RSA keys (PEM format) or Ed25519 keys (hex format)
    const isRSA =
      config.privateKey.includes('BEGIN') &&
      config.privateKey.includes('PRIVATE KEY')

    // Check if RSA-only mode is enforced
    const rsaOnly = process.env.BADGE_ISSUER_RSA_ONLY === 'true'

    if (rsaOnly && !isRSA) {
      throw new ConfigurationError(
        'BADGE_ISSUER_RSA_ONLY is enabled but RSA keys are not provided. ' +
          'JWT format requires RS256 algorithm for 1EdTech validator compliance. ' +
          'EdDSA/Ed25519 is NOT supported by the official validator. ' +
          'See: https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#rs256-requirement',
        {
          algorithm: 'EdDSA',
          supported: ['RS256', 'ES256'],
          rsaOnly,
        },
      )
    }

    let privateKey: CryptoKey
    let algorithm: string
    let publicKeyJwk: JWK | undefined

    if (isRSA) {
      // Use RS256 with RSA keys (OpenBadges 3.0 compliant)
      privateKey = await importPKCS8(config.privateKey, 'RS256')
      algorithm = 'RS256'

      // Extract public key JWK for header inclusion
      const publicKeyObj = createPublicKey(config.publicKey)
      publicKeyJwk = publicKeyObj.export({ format: 'jwk' }) as JWK

      // Ensure no private key material is exposed
      if (publicKeyJwk && 'd' in publicKeyJwk) {
        delete publicKeyJwk.d
        console.warn(
          'WARNING: Private key parameter (d) was present in JWK and has been removed. ' +
            'This should not happen. Check key export logic.',
        )
      }
    } else {
      // Fallback to EdDSA with Ed25519 keys (for backward compatibility)
      // WARNING: EdDSA is NOT supported by 1EdTech validator
      if (!rsaOnly) {
        console.warn(
          'WARNING: Using EdDSA algorithm for JWT signing. ' +
            'This is NOT supported by the 1EdTech OB30Inspector validator. ' +
            'Set BADGE_ISSUER_RSA_ONLY=true to enforce RS256. ' +
            'See: https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#rs256-requirement',
        )
      }

      validateSigningConfig(config)
      const jwk = privateKeyToJWK(config.privateKey, config.publicKey)
      privateKey = (await importJWK(jwk, 'EdDSA')) as CryptoKey
      algorithm = 'EdDSA'

      // Extract public key JWK (without private key 'd' parameter)
      publicKeyJwk = publicKeyToJWK(config.publicKey)
    }

    // Build JWT claims per OpenBadges 3.0 spec section 8.2.4.1
    // Extract issuer ID for registered claims
    const issuerId =
      typeof credential.issuer === 'string'
        ? credential.issuer
        : credential.issuer.id

    // Convert ISO 8601 dates to NumericDate (seconds since epoch)
    const nbf = Math.floor(new Date(credential.validFrom).getTime() / 1000)

    // Build JWT with required claims per spec
    const jwtBuilder = new SignJWT({
      ...credential, // All credential properties at top level (not wrapped in 'vc')
    })
      .setProtectedHeader({
        alg: algorithm,
        typ: 'JWT',
        kid: config.verificationMethod, // Verification method URL
        ...(publicKeyJwk && { jwk: publicKeyJwk }), // Include public key JWK for validator compatibility
      })
      .setIssuer(issuerId) // iss: issuer.id (required)
      .setJti(credential.id) // jti: credential id (required)
      .setNotBefore(nbf) // nbf: validFrom as NumericDate (required)
      .setSubject(credential.credentialSubject.id) // sub: credentialSubject.id (required)

    // exp: validUntil as NumericDate (required if validUntil exists)
    if (credential.validUntil) {
      const exp = Math.floor(new Date(credential.validUntil).getTime() / 1000)
      jwtBuilder.setExpirationTime(exp)
    }

    const jwt = await jwtBuilder.sign(privateKey)

    return jwt
  } catch (error) {
    if (error instanceof SigningError || error instanceof ConfigurationError) {
      throw error
    }
    throw new SigningError('Failed to sign credential as JWT', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

/**
 * Verify a JWT credential signature and extract the credential
 * Returns the decoded credential if valid, throws VerificationError if invalid
 * Supports both RS256 (RSA) and EdDSA (Ed25519) algorithms
 */
export async function verifyCredentialJWT(
  jwt: string,
  publicKey: string,
): Promise<Credential> {
  if (!publicKey || typeof publicKey !== 'string') {
    throw new VerificationError('Public key is required and must be a string', {
      hasPublicKey: !!publicKey,
    })
  }

  if (!jwt || typeof jwt !== 'string') {
    throw new VerificationError('JWT is required and must be a string', {
      hasJWT: !!jwt,
    })
  }

  try {
    // Check if we have RSA key (PEM format) or Ed25519 key (hex format)
    const isRSA =
      publicKey.includes('BEGIN') && publicKey.includes('PUBLIC KEY')

    let publicKeyObj: CryptoKey
    let algorithms: string[]

    if (isRSA) {
      // Use RS256 with RSA keys
      publicKeyObj = await importSPKI(publicKey, 'RS256')
      algorithms = ['RS256']
    } else {
      // Use EdDSA with Ed25519 keys
      const jwk = publicKeyToJWK(publicKey)
      publicKeyObj = (await importJWK(jwk, 'EdDSA')) as CryptoKey
      algorithms = ['EdDSA']
    }

    const { payload } = await jwtVerify(jwt, publicKeyObj, {
      algorithms,
    })

    // Per OpenBadges 3.0 spec: credential properties are at top level in payload
    // Validate required OpenBadges credential fields
    if (!payload['@context'] || !payload.type || !payload.id) {
      throw new VerificationError(
        'JWT payload missing required credential fields (@context, type, id)',
        { payload },
      )
    }

    // Remove registered JWT claims (iss, jti, sub, iat, exp, nbf, aud) to get clean credential
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { iss, jti, sub, iat, exp, nbf, aud, ...credential } =
      payload as JWTPayload & Credential

    return credential
  } catch (error) {
    if (error instanceof VerificationError) {
      throw error
    }
    throw new VerificationError('JWT verification failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}
