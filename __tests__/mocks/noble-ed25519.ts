/**
 * Mock for @noble/ed25519
 *
 * Provides Ed25519 cryptographic operations using Node.js crypto module.
 * This mock is necessary because @noble/ed25519 v3 is pure ESM.
 */

import { randomBytes, createHash } from 'crypto'

// Known test key pairs (from test fixtures)
const TEST_KEY_PAIRS = new Map<string, string>([
  // From openbadges.test.ts
  [
    '31875f663f58ee90686db580f0df732535b808674ac27f1d88f8cbd4e18ba52f',
    '1804a6dd081c492ebb051d2ec9e00d6563c7c4434efd0e888eceb0b1be93b4b7',
  ],
  // From crypto-multibase.test.ts (old badge system)
  [
    'd6e2f676b1c106ffe56b08424a77b5590d8a19cb119ecb35a005b1b4baa570d2',
    '36f594e8fc805ad04bbc0718bdb053cff38c13b4b296c3dbe42f8aad9f2016e2',
  ],
])

/**
 * Generate a public key from a private key
 */
export async function getPublicKeyAsync(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  // Convert to hex to check if it's a known test key
  const privateKeyHex = Buffer.from(privateKey).toString('hex')

  // If it's a known test key, return the matching public key
  if (TEST_KEY_PAIRS.has(privateKeyHex)) {
    const publicKeyHex = TEST_KEY_PAIRS.get(privateKeyHex)!
    return new Uint8Array(Buffer.from(publicKeyHex, 'hex'))
  }

  // Otherwise, deterministically derive from private key using hash
  const hash = createHash('sha256').update(Buffer.from(privateKey)).digest()
  return new Uint8Array(hash)
}

/**
 * Sign a message with a private key
 */
export async function signAsync(
  message: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  // Create a deterministic signature based on the message and private key
  // Hash message and private key together to create signature
  const combined = Buffer.concat([
    Buffer.from(message),
    Buffer.from(privateKey),
  ])
  const hash = createHash('sha512').update(combined).digest()

  // Ed25519 signatures are 64 bytes
  return new Uint8Array(hash)
}

/**
 * Verify a signature
 */
export async function verifyAsync(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  // Validate input formats
  if (
    signature.length !== 64 ||
    publicKey.length !== 32 ||
    message.length === 0
  ) {
    return false
  }

  // To properly verify, we need to recreate the signature
  // But we don't have the private key. We can derive it back from the public key
  // if it's a known test key
  const publicKeyHex = Buffer.from(publicKey).toString('hex')

  let privateKey: Uint8Array | null = null
  for (const [privHex, pubHex] of TEST_KEY_PAIRS.entries()) {
    if (pubHex === publicKeyHex) {
      privateKey = new Uint8Array(Buffer.from(privHex, 'hex'))
      break
    }
  }

  if (!privateKey) {
    // Unknown key, cannot verify - assume invalid
    return false
  }

  // Recreate the signature with the same algorithm as signAsync
  const combined = Buffer.concat([
    Buffer.from(message),
    Buffer.from(privateKey),
  ])
  const expectedSignature = createHash('sha512').update(combined).digest()

  // Compare signatures
  return Buffer.compare(Buffer.from(signature), expectedSignature) === 0
}

/**
 * Generate a random private key
 */
export async function keygenAsync(): Promise<Uint8Array> {
  return randomBytes(32)
}

// Sync versions (not used in our code but exported for compatibility)
export const getPublicKey = (privateKey: Uint8Array): Uint8Array => {
  throw new Error(
    'Sync getPublicKey not supported in mock - use getPublicKeyAsync',
  )
}

export const sign = (
  message: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array => {
  throw new Error('Sync sign not supported in mock - use signAsync')
}

export const verify = (
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean => {
  throw new Error('Sync verify not supported in mock - use verifyAsync')
}

export const keygen = (): Uint8Array => {
  throw new Error('Sync keygen not supported in mock - use keygenAsync')
}

// Export empty objects for Point, utils, etc, hashes
export const Point = {}
export const utils = {}
export const etc = {}
export const hashes = {}
