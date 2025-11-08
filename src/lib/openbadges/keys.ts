/**
 * Key Management
 *
 * Ed25519 key management and W3C Multikey document generation for OpenBadges 3.0.
 */

import { hexToBytes, encodeBase58, decodeBase58, bytesToHex } from './encoding'
import { KeyFormatError, ConfigurationError } from './errors'
import type { MultikeyDocument } from './types'

/**
 * Ed25519 multicodec prefix (0xed01)
 */
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])

/**
 * Validate Ed25519 public key format
 * @throws {KeyFormatError} if key is invalid
 */
export function validatePublicKey(publicKeyHex: string): void {
  if (!publicKeyHex || typeof publicKeyHex !== 'string') {
    throw new KeyFormatError('Public key must be a non-empty string', {
      received: typeof publicKeyHex,
    })
  }

  const cleaned = publicKeyHex.replace(/^0x/, '').replace(/\s/g, '')

  if (cleaned.length !== 64) {
    throw new KeyFormatError(
      'Ed25519 public key must be 32 bytes (64 hex characters)',
      { length: cleaned.length, expected: 64 },
    )
  }

  // Validate hex characters
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new KeyFormatError('Public key contains invalid hex characters', {
      key: publicKeyHex,
    })
  }
}

/**
 * Generate key ID from public key
 * Uses first 8 hex characters as identifier
 */
export function generateKeyId(publicKeyHex: string): string {
  validatePublicKey(publicKeyHex)
  const cleaned = publicKeyHex.replace(/^0x/, '').replace(/\s/g, '')
  return `key-${cleaned.substring(0, 8)}`
}

/**
 * Validate key ID matches public key
 * @throws {KeyFormatError} if key ID doesn't match public key
 */
export function validateKeyId(keyId: string, publicKeyHex: string): void {
  if (!keyId || typeof keyId !== 'string') {
    throw new KeyFormatError('Key ID must be a non-empty string', {
      received: typeof keyId,
    })
  }

  if (!keyId.startsWith('key-')) {
    throw new KeyFormatError('Key ID must start with "key-" prefix', { keyId })
  }

  const expectedKeyId = generateKeyId(publicKeyHex)
  if (keyId !== expectedKeyId) {
    throw new KeyFormatError('Key ID does not match public key', {
      keyId,
      expectedKeyId,
    })
  }
}

/**
 * Convert Ed25519 public key to multibase format
 * Adds Ed25519 multicodec prefix and encodes as base58btc with 'z' prefix
 */
export function publicKeyToMultibase(publicKeyHex: string): string {
  validatePublicKey(publicKeyHex)

  // Convert hex to bytes
  const publicKeyBytes = hexToBytes(publicKeyHex)

  // Combine multicodec prefix with public key bytes
  const multikeyBytes = Buffer.concat([
    ED25519_MULTICODEC_PREFIX,
    Buffer.from(publicKeyBytes),
  ])

  // Encode to base58btc with 'z' prefix
  return 'z' + encodeBase58(multikeyBytes)
}

/**
 * Generate did:key URI from Ed25519 public key
 * Creates a W3C DID using the multibase-encoded public key
 *
 * @param publicKeyHex - The Ed25519 public key as hex string
 * @returns did:key URI
 * @throws {KeyFormatError} if key is invalid
 *
 * @example
 * ```ts
 * const didKey = publicKeyToDidKey('1804a6dd...')
 * // => 'did:key:z6Mkf5rG...'
 * ```
 */
export function publicKeyToDidKey(publicKeyHex: string): string {
  return `did:key:${publicKeyToMultibase(publicKeyHex)}`
}

/**
 * Generate a W3C Multikey document with did:key controller
 * Creates a self-describing cryptographic key document for OpenBadges 3.0
 *
 * @param publicKeyHex - The Ed25519 public key as hex string
 * @returns W3C Multikey document with did:key controller
 * @throws {KeyFormatError} if key format is invalid
 *
 * @example
 * ```ts
 * const multikeyDoc = generateDidKeyMultikeyDocument('1804a6dd...')
 * // Returns:
 * // {
 * //   '@context': [...],
 * //   id: 'did:key:z6Mkf5rG...#z6Mkf5rG...',
 * //   type: 'Multikey',
 * //   controller: 'did:key:z6Mkf5rG...',
 * //   publicKeyMultibase: 'z6Mkf5rG...'
 * // }
 * ```
 */
export function generateDidKeyMultikeyDocument(
  publicKeyHex: string,
): MultikeyDocument {
  validatePublicKey(publicKeyHex)

  const didKey = publicKeyToDidKey(publicKeyHex)
  const keyFragment = publicKeyToMultibase(publicKeyHex)
  const keyId = `${didKey}#${keyFragment}`

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/multikey/v1',
    ],
    id: keyId,
    type: 'Multikey',
    controller: didKey,
    publicKeyMultibase: keyFragment,
  }
}

/**
 * Extract public key hex from did:key URI
 * Decodes the multibase-encoded key and removes the Ed25519 multicodec prefix
 *
 * @param didKey - The did:key URI (e.g., 'did:key:z6Mkf5rG...')
 * @returns Public key as hex string
 * @throws {KeyFormatError} if did:key format is invalid
 *
 * @example
 * ```ts
 * const publicKeyHex = didKeyToPublicKeyHex('did:key:z6Mkf5rG...')
 * // => '1804a6dd...'
 * ```
 */
export function didKeyToPublicKeyHex(didKey: string): string {
  if (!didKey || typeof didKey !== 'string') {
    throw new KeyFormatError('DID key must be a non-empty string', {
      received: typeof didKey,
    })
  }

  if (!didKey.startsWith('did:key:z')) {
    throw new KeyFormatError(
      'DID key must start with "did:key:z" (multibase format)',
      { didKey },
    )
  }

  // Extract the multibase part (after 'did:key:')
  const multibaseKey = didKey.substring(8) // Remove 'did:key:'

  // Decode from base58btc (remove 'z' prefix first)
  const multikeyBytes = decodeBase58(multibaseKey.substring(1))

  // Verify Ed25519 multicodec prefix (0xed01)
  if (
    multikeyBytes.length < 2 ||
    multikeyBytes[0] !== 0xed ||
    multikeyBytes[1] !== 0x01
  ) {
    throw new KeyFormatError('DID key does not use Ed25519 multicodec prefix', {
      prefix: multikeyBytes.slice(0, 2),
      expected: [0xed, 0x01],
    })
  }

  // Extract public key bytes (skip 2-byte prefix)
  const publicKeyBytes = multikeyBytes.slice(2)

  if (publicKeyBytes.length !== 32) {
    throw new KeyFormatError('Ed25519 public key must be 32 bytes', {
      length: publicKeyBytes.length,
      expected: 32,
    })
  }

  // Convert to hex
  return bytesToHex(publicKeyBytes)
}

/**
 * Validate URL format
 * @throws {ConfigurationError} if URL is invalid
 */
function validateUrl(url: string, fieldName: string): void {
  if (!url || typeof url !== 'string') {
    throw new ConfigurationError(`${fieldName} must be a non-empty string`, {
      received: typeof url,
    })
  }

  // Support both HTTP(S) and DID URIs
  if (url.startsWith('did:')) {
    // Basic DID validation
    if (!/^did:[a-z0-9]+:.+$/.test(url)) {
      throw new ConfigurationError(`${fieldName} must be a valid DID URI`, {
        url,
      })
    }
    return
  }

  // Standard HTTP(S) URL validation
  try {
    new URL(url)
  } catch {
    throw new ConfigurationError(
      `${fieldName} must be a valid URL or DID URI`,
      { url },
    )
  }
}

/**
 * Generate a W3C Multikey document for an Ed25519 public key
 *
 * @param publicKeyHex - The Ed25519 public key as hex string
 * @param keyId - The key identifier (e.g., "key-1804a6dd")
 * @param controller - The controller URL (issuer profile URL) or DID URI
 * @returns W3C Multikey document
 * @throws {KeyFormatError} if key format is invalid
 * @throws {ConfigurationError} if parameters are invalid
 */
export function generateMultikeyDocument(
  publicKeyHex: string,
  keyId: string,
  controller: string,
): MultikeyDocument {
  // Validate inputs
  validatePublicKey(publicKeyHex)
  validateKeyId(keyId, publicKeyHex)
  validateUrl(controller, 'Controller URL')

  // If controller is HTTP(S), enforce issuer profile endpoint pattern
  // If controller is did:key, skip path validation
  if (!controller.startsWith('did:')) {
    try {
      const url = new URL(controller)
      const expectedPath = '/api/badge/issuer'
      if (!url.pathname.endsWith(expectedPath)) {
        throw new ConfigurationError(
          'Controller URL must point to issuer profile endpoint or be a DID URI',
          { controller, expectedSuffix: expectedPath },
        )
      }
    } catch (e) {
      if (e instanceof ConfigurationError) throw e
      throw new ConfigurationError('Invalid controller URL', { controller })
    }

    // Generate multibase-encoded public key
    const publicKeyMultibase = publicKeyToMultibase(publicKeyHex)

    // Derive base origin for key document if controller is issuer profile
    // Controller must end with /api/badge/issuer (enforced above)
    const baseOrigin = controller.replace(/\/api\/badge\/issuer$/, '')
    const keyIdUrl = `${baseOrigin}/api/badge/keys/${keyId}`

    return {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/multikey/v1',
      ],
      id: keyIdUrl,
      type: 'Multikey',
      controller,
      publicKeyMultibase,
    }
  }

  // DID-based controller: use did:key format
  const didKey = controller
  const keyFragment = publicKeyToMultibase(publicKeyHex)
  const keyIdUrl = `${didKey}#${keyFragment}`

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/multikey/v1',
    ],
    id: keyIdUrl,
    type: 'Multikey',
    controller: didKey,
    publicKeyMultibase: keyFragment,
  }
}
