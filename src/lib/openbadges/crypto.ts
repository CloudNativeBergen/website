/**
 * Cryptographic Operations
 *
 * OpenBadges 3.0 supports two proof formats:
 * 1. Data Integrity Proofs (eddsa-rdfc-2022 cryptosuite) - JSON-LD based
 * 2. JWT Proofs (RFC7519/RFC7515) - Better cross-implementation compatibility
 *
 * JWT format is recommended for maximum validator compatibility.
 */

import * as ed25519 from '@noble/ed25519'
import * as jsonld from 'jsonld'
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
import {
  hexToBytes,
  bytesToHex,
  encodeMultibase,
  decodeMultibase,
  stringToBytes,
} from './encoding'
import { SigningError, VerificationError, ConfigurationError } from './errors'
import type {
  Credential,
  SignedCredential,
  SigningConfig,
  DataIntegrityProof,
} from './types'

type JsonLdContext = Record<string, unknown>

/**
 * Custom document loader for JSON-LD contexts
 * Provides local contexts to avoid network fetches during canonicalization
 *
 * NOTE: Cross-implementation verification limitations
 * Different OpenBadges implementations may use different JSON-LD processors,
 * which can produce slightly different canonical N-Quads even with identical
 * contexts. This is a known challenge in JSON-LD signature verification.
 * Our implementation follows W3C Data Integrity and OpenBadges 3.0 specs,
 * and badges verify correctly with our own verifier. However, external
 * validators may produce different results due to library differences.
 */
const customDocumentLoader = async (url: string) => {
  const LOCAL_CONTEXTS: Record<string, JsonLdContext> = {
    'https://www.w3.org/ns/credentials/v2': {
      '@context': {
        id: '@id',
        type: '@type',
        VerifiableCredential:
          'https://www.w3.org/2018/credentials#VerifiableCredential',
        credentialSubject:
          'https://www.w3.org/2018/credentials#credentialSubject',
        issuer: 'https://www.w3.org/2018/credentials#issuer',
        validFrom: 'https://www.w3.org/2018/credentials#validFrom',
        DataIntegrityProof: 'https://w3id.org/security#DataIntegrityProof',
        verificationMethod: 'https://w3id.org/security#verificationMethod',
        proofPurpose: 'https://w3id.org/security#proofPurpose',
        assertionMethod: 'https://w3id.org/security#assertionMethod',
        cryptosuite: 'https://w3id.org/security#cryptosuite',
        created: 'http://purl.org/dc/terms/created',
      },
    },
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': {
      '@context': {
        Profile: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Profile',
        Achievement:
          'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Achievement',
        AchievementSubject:
          'https://purl.imsglobal.org/spec/vc/ob/vocab.html#AchievementSubject',
        Criteria: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Criteria',
        Evidence: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Evidence',
        Image: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Image',
        OpenBadgeCredential:
          'https://purl.imsglobal.org/spec/vc/ob/vocab.html#OpenBadgeCredential',
        achievement:
          'https://purl.imsglobal.org/spec/vc/ob/vocab.html#achievement',
        narrative: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#narrative',
        image: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#image',
        name: 'https://schema.org/name',
        description: 'https://schema.org/description',
        url: 'https://schema.org/url',
        email: 'https://schema.org/email',
        caption: 'https://schema.org/caption',
      },
    },
  }

  if (LOCAL_CONTEXTS[url]) {
    return {
      contextUrl: undefined,
      documentUrl: url,
      document: LOCAL_CONTEXTS[url],
    }
  }

  // Fallback: return empty context for unknown URLs
  return {
    contextUrl: undefined,
    documentUrl: url,
    document: { '@context': {} },
  }
}

/**
 * Canonicalize JSON-LD data using RDF Dataset Canonicalization (URDNA2015)
 * This is required for eddsa-rdfc-2022 cryptosuite compliance
 */
async function canonicalizeData(data: unknown): Promise<string> {
  if (typeof data !== 'object' || data === null) {
    throw new SigningError('Data must be an object', { data })
  }
  try {
    // Use jsonld.canonize (URDNA2015) returning N-Quads with custom document loader
    // Disable safe mode to allow custom document loader (safe option not in types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (jsonld.canonize as any)(
      data as Record<string, unknown>,
      {
        algorithm: 'URDNA2015',
        format: 'application/n-quads',
        documentLoader: customDocumentLoader,
        safe: false,
      },
    )
    return result as string
  } catch (error) {
    throw new SigningError('Failed to canonicalize JSON-LD data', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

/**
 * Canonicalize credential and proof separately per eddsa-rdfc-2022
 * Returns canonical N-Quads for both document (without proof) and proof (without proofValue)
 */
async function canonicalizeForProof(
  credential: Credential,
  proof: Omit<DataIntegrityProof, 'proofValue'>,
) {
  const unsigned: Record<string, unknown> = { ...credential }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { proof: _ignore, ...withoutProof } = unsigned

  const canonicalDoc = await canonicalizeData(withoutProof)

  // Per W3C Data Integrity spec, proof must be canonicalized with proper @context
  // Wrap the proof in a document with the credentials v2 context so JSON-LD
  // processor can properly interpret the proof terms during canonicalization
  const proofWithContext = {
    '@context': 'https://www.w3.org/ns/credentials/v2',
    ...proof,
  }
  const canonicalProof = await canonicalizeData(proofWithContext)

  return { canonicalDoc, canonicalProof }
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
 * Sign a credential using Ed25519 with eddsa-rdfc-2022 cryptosuite
 */
export async function signCredential(
  credential: Credential,
  config: SigningConfig,
): Promise<SignedCredential> {
  validateSigningConfig(config)

  try {
    const privateKey = hexToBytes(config.privateKey)
    const publicKey = hexToBytes(config.publicKey)

    const derivedPublicKey = await ed25519.getPublicKeyAsync(privateKey)
    if (bytesToHex(derivedPublicKey) !== bytesToHex(publicKey)) {
      throw new SigningError('Public key does not match private key', {
        providedPublicKey: bytesToHex(publicKey),
        derivedPublicKey: bytesToHex(derivedPublicKey),
      })
    }

    const baseProof: Omit<DataIntegrityProof, 'proofValue'> = {
      type: 'DataIntegrityProof',
      created: new Date().toISOString(),
      verificationMethod: config.verificationMethod,
      cryptosuite: 'eddsa-rdfc-2022',
      proofPurpose: 'assertionMethod',
    }

    const { canonicalDoc, canonicalProof } = await canonicalizeForProof(
      credential,
      baseProof,
    )

    const message = stringToBytes(canonicalDoc + canonicalProof)

    const signature = await ed25519.signAsync(message, privateKey)
    const proofValue = encodeMultibase(signature)

    const fullProof: DataIntegrityProof = { ...baseProof, proofValue }

    return { ...credential, proof: [fullProof] }
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
 * Verify a credential's cryptographic signature using eddsa-rdfc-2022
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

  try {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { proof: _proofArr, ...unsigned } = credential
    const baseProof: Omit<DataIntegrityProof, 'proofValue'> = {
      type: 'DataIntegrityProof',
      created: proof.created,
      verificationMethod: proof.verificationMethod,
      cryptosuite: proof.cryptosuite,
      proofPurpose: proof.proofPurpose,
    }
    const { canonicalDoc, canonicalProof } = await canonicalizeForProof(
      unsigned as Credential,
      baseProof,
    )
    const message = stringToBytes(canonicalDoc + canonicalProof)
    const signature = decodeMultibase(proof.proofValue)
    const publicKeyBytes = hexToBytes(publicKey)
    return await ed25519.verifyAsync(signature, message, publicKeyBytes)
  } catch (error) {
    if (error instanceof VerificationError) {
      throw error
    }

    // Return false for invalid signatures
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
