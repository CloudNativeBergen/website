/**
 * Cryptographic Operations
 *
 * Ed25519 signing and verification for OpenBadges 3.0 Data Integrity Proofs.
 * Uses eddsa-rdfc-2022 cryptosuite with multibase-encoded signatures.
 */

import * as ed25519 from '@noble/ed25519'
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

/**
 * Canonicalize data for signing/verification
 * Uses JSON stringify with sorted keys as per RDF canonicalization
 */
function canonicalizeData(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    throw new SigningError('Data must be an object', { data })
  }

  return JSON.stringify(
    data,
    Object.keys(data as Record<string, unknown>).sort(),
  )
}

/**
 * Validate signing configuration
 * @throws {ConfigurationError} if config is invalid
 */
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

  // Validate key lengths (Ed25519 keys are 32 bytes = 64 hex chars)
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

  // Validate verification method URL format
  try {
    new URL(config.verificationMethod)
  } catch {
    throw new ConfigurationError('Verification method must be a valid URL', {
      verificationMethod: config.verificationMethod,
    })
  }
}

/**
 * Sign a credential using Ed25519
 * Returns a signed credential with DataIntegrityProof
 *
 * @param credential - The unsigned credential to sign
 * @param config - Signing configuration with keys and verification method
 * @returns Signed credential with proof array
 * @throws {SigningError} if signing fails
 */
export async function signCredential(
  credential: Credential,
  config: SigningConfig,
): Promise<SignedCredential> {
  // Validate configuration
  validateSigningConfig(config)

  try {
    // Convert keys from hex
    const privateKey = hexToBytes(config.privateKey)
    const publicKey = hexToBytes(config.publicKey)

    // Verify that the public key matches the private key
    const derivedPublicKey = await ed25519.getPublicKeyAsync(privateKey)
    if (bytesToHex(derivedPublicKey) !== bytesToHex(publicKey)) {
      throw new SigningError('Public key does not match private key', {
        providedPublicKey: bytesToHex(publicKey),
        derivedPublicKey: bytesToHex(derivedPublicKey),
      })
    }

    // Canonicalize the credential for signing
    const canonicalData = canonicalizeData(credential)
    const message = stringToBytes(canonicalData)

    // Sign with Ed25519
    const signature = await ed25519.signAsync(message, privateKey)

    // Encode signature as multibase (base58btc with 'z' prefix)
    const proofValue = encodeMultibase(signature)

    // Create Data Integrity Proof
    const proof: DataIntegrityProof = {
      type: 'DataIntegrityProof',
      created: new Date().toISOString(),
      verificationMethod: config.verificationMethod,
      cryptosuite: 'eddsa-rdfc-2022',
      proofPurpose: 'assertionMethod',
      proofValue,
    }

    // Return signed credential with proof array
    return {
      ...credential,
      proof: [proof],
    }
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
 * Verify a credential's signature
 *
 * @param credential - The signed credential to verify
 * @param publicKey - The Ed25519 public key as hex string
 * @returns True if signature is valid, false otherwise
 * @throws {VerificationError} if verification process fails (not if signature is invalid)
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
    // Get the first proof (OB 3.0 allows multiple proofs)
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

    // Extract credential without proof for verification
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { proof: _proof, ...credentialWithoutProof } = credential

    // Canonicalize the credential (same as signing)
    const canonicalData = canonicalizeData(credentialWithoutProof)
    const message = stringToBytes(canonicalData)

    // Decode signature from multibase
    const signature = decodeMultibase(proof.proofValue)

    // Convert public key from hex
    const publicKeyBytes = hexToBytes(publicKey)

    // Verify with Ed25519
    const isValid = await ed25519.verifyAsync(
      signature,
      message,
      publicKeyBytes,
    )

    return isValid
  } catch (error) {
    if (error instanceof VerificationError) {
      throw error
    }

    // Return false for invalid signatures
    return false
  }
}
