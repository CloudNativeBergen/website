/**
 * Badge Cryptography Module
 *
 * Handles Ed25519 key management and cryptographic signing for OpenBadges v3.0
 * Data Integrity Proofs. Uses @noble/ed25519 for Vercel edge runtime compatibility.
 */

import * as ed25519 from '@noble/ed25519'
import bs58 from 'bs58'
import {
  hexToBytes,
  bytesToHex,
  canonicalizeData,
  buildIssuerUrl,
  getKeyIdFromPublicKey,
} from './utils'

/**
 * Get the private key from environment variables
 */
function getPrivateKey(): Uint8Array {
  const privateKeyHex = process.env.BADGE_ISSUER_PRIVATE_KEY

  if (!privateKeyHex) {
    throw new Error(
      'BADGE_ISSUER_PRIVATE_KEY environment variable is not set. ' +
        'Generate a key pair using generateKeyPair() and set it in your .env file.',
    )
  }

  try {
    return hexToBytes(privateKeyHex)
  } catch (error) {
    throw new Error(
      `Invalid BADGE_ISSUER_PRIVATE_KEY format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get the public key from environment variables
 */
function getPublicKey(): Uint8Array {
  const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY

  if (!publicKeyHex) {
    throw new Error(
      'BADGE_ISSUER_PUBLIC_KEY environment variable is not set. ' +
        'Generate a key pair using generateKeyPair() and set it in your .env file.',
    )
  }

  try {
    return hexToBytes(publicKeyHex)
  } catch (error) {
    throw new Error(
      `Invalid BADGE_ISSUER_PUBLIC_KEY format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Get the issuer URL from conference domains
 * @deprecated Use buildIssuerUrl from utils.ts
 */
export function getIssuerUrl(conferenceDomains?: string[]): string {
  return buildIssuerUrl(conferenceDomains)
}

/**
 * Sign badge data using Ed25519
 * Returns multibase-encoded signature for Data Integrity Proof
 */
export async function signBadgeData(data: unknown): Promise<string> {
  const privateKey = getPrivateKey()

  // Canonicalize the data (stringify with sorted keys)
  const canonicalData = canonicalizeData(data)
  const message = new TextEncoder().encode(canonicalData)

  // Sign with Ed25519
  const signature = await ed25519.signAsync(message, privateKey)

  // Convert to multibase format (base58btc with 'z' prefix)
  // Required by eddsa-rdfc-2022 cryptosuite
  return 'z' + bs58.encode(Buffer.from(signature))
}

/**
 * Verify a badge signature
 */
export async function verifyBadgeSignature(
  data: unknown,
  signatureMultibase: string,
): Promise<boolean> {
  try {
    const publicKey = getPublicKey()

    // Canonicalize the data
    const canonicalData = canonicalizeData(data)
    const message = new TextEncoder().encode(canonicalData)

    // Decode signature from multibase format (base58btc with 'z' prefix)
    // or fallback to base64 for backwards compatibility
    let signature: Uint8Array
    if (signatureMultibase.startsWith('z')) {
      signature = Uint8Array.from(bs58.decode(signatureMultibase.substring(1)))
    } else {
      // Fallback for old base64 format
      signature = Buffer.from(signatureMultibase, 'base64')
    }

    // Verify with Ed25519
    return await ed25519.verifyAsync(signature, message, publicKey)
  } catch (error) {
    console.error('Badge signature verification failed:', error)
    return false
  }
}

/**
 * Get the verification method identifier for Data Integrity Proof
 */
export function getVerificationMethod(conferenceDomains?: string[]): string {
  const issuerUrl = buildIssuerUrl(conferenceDomains)
  const publicKeyHex = bytesToHex(getPublicKey())
  const keyId = getKeyIdFromPublicKey(publicKeyHex)

  // Return verification method as a resolvable URL to the public key endpoint
  // Format: {issuerUrl}/api/badge/keys/{keyId}
  // This URL resolves to a JSON-LD document containing the public key in Multikey format
  return `${issuerUrl}/api/badge/keys/${keyId}`
}
