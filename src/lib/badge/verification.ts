/**
 * Badge Verification Logic
 *
 * Pure functions for verifying badge assertions and signatures
 * Separated from Next.js routes for testability
 */

import type { BadgeAssertion } from './types'

/**
 * Error types for verification operations
 */
export class BadgeVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadgeVerificationError'
  }
}

export class BadgeNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadgeNotFoundError'
  }
}

/**
 * Verification result structure
 */
export interface VerificationResult {
  valid: boolean
  signatureValid: boolean
  verifiedAt: string
  errors?: string[]
}

/**
 * Enhanced badge assertion with verification status
 */
export interface VerifiedBadgeAssertion extends BadgeAssertion {
  verified: boolean
  verificationStatus: VerificationResult
}

/**
 * Extract proof from badge assertion for signature verification
 * Returns the assertion without proof and the proof value
 */
export function extractProofFromAssertion(assertion: BadgeAssertion): {
  assertionWithoutProof: Omit<BadgeAssertion, 'proof'>
  proofValue: string | null
} {
  if (!assertion.proof || assertion.proof.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { proof, ...assertionWithoutProof } = assertion
    return {
      assertionWithoutProof,
      proofValue: null,
    }
  }

  // Get the first proof (OB 3.0 uses array but typically has one proof)
  const firstProof = assertion.proof[0]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { proof, ...assertionWithoutProof } = assertion

  return {
    assertionWithoutProof,
    proofValue: firstProof?.proofValue || null,
  }
}

/**
 * Validate badge assertion structure
 */
export function validateBadgeAssertion(assertion: unknown): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!assertion || typeof assertion !== 'object') {
    return {
      valid: false,
      errors: ['Badge assertion must be an object'],
    }
  }

  const a = assertion as Partial<BadgeAssertion>

  // Check required fields
  if (!a['@context'] || !Array.isArray(a['@context'])) {
    errors.push('Missing or invalid @context')
  }

  if (!a.id || typeof a.id !== 'string') {
    errors.push('Missing or invalid id')
  }

  if (!a.type || !Array.isArray(a.type)) {
    errors.push('Missing or invalid type')
  } else {
    if (!a.type.includes('VerifiableCredential')) {
      errors.push('Type must include VerifiableCredential')
    }
    if (!a.type.includes('AchievementCredential')) {
      errors.push('Type must include AchievementCredential')
    }
  }

  if (!a.credentialSubject || typeof a.credentialSubject !== 'object') {
    errors.push('Missing or invalid credentialSubject')
  }

  if (!a.issuer || typeof a.issuer !== 'object') {
    errors.push('Missing or invalid issuer')
  }

  if (!a.validFrom || typeof a.validFrom !== 'string') {
    errors.push('Missing or invalid validFrom')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Parse badge JSON string safely
 */
export function parseBadgeJson(badgeJson: string): {
  assertion: BadgeAssertion | null
  error: string | null
} {
  try {
    const parsed = JSON.parse(badgeJson)

    const validation = validateBadgeAssertion(parsed)
    if (!validation.valid) {
      return {
        assertion: null,
        error: `Invalid badge structure: ${validation.errors.join(', ')}`,
      }
    }

    return {
      assertion: parsed as BadgeAssertion,
      error: null,
    }
  } catch (error) {
    return {
      assertion: null,
      error: `Failed to parse badge JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Create a verification result object
 */
export function createVerificationResult(
  signatureValid: boolean,
  errors: string[] = [],
): VerificationResult {
  return {
    valid: errors.length === 0,
    signatureValid,
    verifiedAt: new Date().toISOString(),
    ...(errors.length > 0 && { errors }),
  }
}

/**
 * Add verification status to a badge assertion
 */
export function addVerificationStatus(
  assertion: BadgeAssertion,
  signatureValid: boolean,
  errors: string[] = [],
): VerifiedBadgeAssertion {
  return {
    ...assertion,
    verified: signatureValid,
    verificationStatus: createVerificationResult(signatureValid, errors),
  }
}

/**
 * Validate proof structure
 */
export function validateProof(proof: unknown): {
  valid: boolean
  error?: string
} {
  if (!proof || typeof proof !== 'object') {
    return { valid: false, error: 'Proof must be an object' }
  }

  const p = proof as Record<string, unknown>

  if (!p.type || p.type !== 'DataIntegrityProof') {
    return { valid: false, error: 'Proof type must be DataIntegrityProof' }
  }

  if (!p.cryptosuite || p.cryptosuite !== 'eddsa-rdfc-2022') {
    return { valid: false, error: 'Cryptosuite must be eddsa-rdfc-2022' }
  }

  if (!p.proofValue || typeof p.proofValue !== 'string') {
    return { valid: false, error: 'Missing or invalid proofValue' }
  }

  if (!p.verificationMethod || typeof p.verificationMethod !== 'string') {
    return { valid: false, error: 'Missing or invalid verificationMethod' }
  }

  if (!p.proofPurpose || p.proofPurpose !== 'assertionMethod') {
    return { valid: false, error: 'proofPurpose must be assertionMethod' }
  }

  return { valid: true }
}

/**
 * Check if a proof value is in multibase format (starts with 'z')
 */
export function isMultibaseProof(proofValue: string): boolean {
  return proofValue.startsWith('z')
}

/**
 * Check if a proof value is in legacy base64 format
 */
export function isBase64Proof(proofValue: string): boolean {
  // Base64 characters: A-Z, a-z, 0-9, +, /, =
  return /^[A-Za-z0-9+/]+=*$/.test(proofValue) && !proofValue.startsWith('z')
}
