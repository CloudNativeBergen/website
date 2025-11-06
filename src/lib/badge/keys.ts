/**
 * Badge Key Management
 *
 * Pure functions for generating and validating badge verification keys
 * in W3C Multikey format for OpenBadges 3.0 compliance.
 */

import bs58 from 'bs58'
import { validateIssuerUrl } from './utils' /**
 * Error types for key operations
 */
export class KeyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyValidationError'
  }
}

export class KeyNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyNotFoundError'
  }
}

export class KeyConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyConfigurationError'
  }
}

/**
 * Multikey document structure
 */
export interface MultikeyDocument {
  '@context': string[]
  id: string
  type: 'Multikey'
  controller: string
  publicKeyMultibase: string
}

/**
 * Validate that a key ID matches the expected format and public key prefix
 */
export function validateKeyId(
  keyId: string,
  publicKeyHex: string,
): { valid: boolean; error?: string } {
  if (!keyId.startsWith('key-')) {
    return { valid: false, error: 'Key ID must start with "key-"' }
  }

  const expectedKeyPrefix = publicKeyHex.substring(0, 8)
  if (!keyId.includes(expectedKeyPrefix)) {
    return {
      valid: false,
      error: `Key ID does not match public key prefix: expected "${expectedKeyPrefix}"`,
    }
  }

  return { valid: true }
}

/**
 * Generate a Multikey document for an Ed25519 public key
 *
 * @param publicKeyHex - The public key as a hex string
 * @param keyId - The key identifier (e.g., "key-6c4cf79d")
 * @param issuerUrl - The issuer URL (e.g., "https://2025.cloudnativebergen.dev")
 * @returns A W3C Multikey format document
 */
export function generateMultikeyDocument(
  publicKeyHex: string,
  keyId: string,
  issuerUrl: string,
): MultikeyDocument {
  // Validate inputs
  if (!publicKeyHex || publicKeyHex.length !== 64) {
    throw new KeyValidationError(
      'Public key must be a 64-character hex string (32 bytes)',
    )
  }

  if (!keyId || !keyId.startsWith('key-')) {
    throw new KeyValidationError('Key ID must start with "key-"')
  }

  const urlValidation = validateIssuerUrl(issuerUrl)
  if (!urlValidation.valid) {
    throw new KeyValidationError(urlValidation.error || 'Invalid issuer URL')
  } // Convert hex to bytes
  const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')

  // Ed25519 multicodec prefix (0xed01)
  const ed25519Prefix = Buffer.from([0xed, 0x01])

  // Combine multicodec prefix with public key bytes
  const multikeyBytes = Buffer.concat([ed25519Prefix, publicKeyBytes])

  // Encode to Base58btc and add 'z' prefix (multibase format)
  const publicKeyMultibase = 'z' + bs58.encode(multikeyBytes)

  const fullKeyId = `${issuerUrl}/api/badge/keys/${keyId}`

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/multikey/v1',
    ],
    id: fullKeyId,
    type: 'Multikey',
    controller: issuerUrl,
    publicKeyMultibase,
  }
}

/**
 * Validate that a multibase-encoded public key is properly formatted
 */
export function validateMultibasePublicKey(publicKeyMultibase: string): {
  valid: boolean
  error?: string
} {
  // Must start with 'z' (Base58btc multibase prefix)
  if (!publicKeyMultibase.startsWith('z')) {
    return {
      valid: false,
      error: 'Multibase public key must start with "z" (Base58btc prefix)',
    }
  }

  // Must only contain valid Base58 characters (no 0, O, I, l)
  const base58Part = publicKeyMultibase.substring(1)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(base58Part)) {
    return {
      valid: false,
      error: 'Multibase public key contains invalid Base58 characters',
    }
  }

  // Try to decode it
  try {
    const decoded = bs58.decode(base58Part)

    // Should have Ed25519 multicodec prefix (0xed01) + 32 bytes = 34 bytes total
    if (decoded.length !== 34) {
      return {
        valid: false,
        error: `Expected 34 bytes (2 prefix + 32 key), got ${decoded.length}`,
      }
    }

    // Check Ed25519 multicodec prefix
    if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
      return {
        valid: false,
        error: 'Missing Ed25519 multicodec prefix (0xed01)',
      }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: `Failed to decode Base58: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Extract the Ed25519 public key bytes from a multibase-encoded key
 */
export function extractPublicKeyFromMultibase(
  publicKeyMultibase: string,
): Buffer {
  const validation = validateMultibasePublicKey(publicKeyMultibase)
  if (!validation.valid) {
    throw new KeyValidationError(validation.error || 'Invalid multibase key')
  }

  const decoded = bs58.decode(publicKeyMultibase.substring(1))
  // Skip the 2-byte multicodec prefix to get the raw public key
  return Buffer.from(decoded.slice(2))
}
