/**
 * Tests for Badge Verification Logic
 *
 * Tests pure functions for verifying badge assertions and signatures
 */

import { describe, it, expect } from '@jest/globals'
import {
  extractProofFromAssertion,
  validateBadgeAssertion,
  parseBadgeJson,
  createVerificationResult,
  addVerificationStatus,
  validateProof,
  isMultibaseProof,
  isBase64Proof,
  BadgeVerificationError,
  type VerificationResult,
} from '@/lib/badge/verification'
import type { BadgeAssertion } from '@/lib/badge/types'

describe('Badge Verification Logic', () => {
  const validAssertion: BadgeAssertion = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: 'https://example.com/badge/123',
    type: ['VerifiableCredential', 'AchievementCredential'],
    name: 'Test Badge',
    credentialSubject: {
      id: 'mailto:test@example.com',
      type: ['AchievementSubject'],
      achievement: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        id: 'https://example.com/badge/123/achievement',
        type: ['Achievement'],
        name: 'Test Achievement',
        description: 'Test description',
        image: {
          id: 'https://example.com/image.png',
          type: 'Image',
        },
        criteria: {
          narrative: 'Test criteria',
        },
        issuer: {
          id: 'https://example.com',
          type: ['Profile'],
          name: 'Test Issuer',
          url: 'https://example.com',
        },
      },
    },
    issuer: {
      id: 'https://example.com',
      type: ['Profile'],
      name: 'Test Issuer',
      url: 'https://example.com',
    },
    validFrom: '2025-01-01T00:00:00Z',
    proof: [
      {
        type: 'DataIntegrityProof',
        created: '2025-01-01T00:00:00Z',
        verificationMethod: 'https://example.com/keys/key-123',
        cryptosuite: 'eddsa-rdfc-2022',
        proofPurpose: 'assertionMethod',
        proofValue: 'z58DXbmfGGTqqARJ...',
      },
    ],
  }

  describe('extractProofFromAssertion', () => {
    it('should extract proof value from valid assertion', () => {
      const { assertionWithoutProof, proofValue } =
        extractProofFromAssertion(validAssertion)

      expect(proofValue).toBe('z58DXbmfGGTqqARJ...')
      expect(assertionWithoutProof).not.toHaveProperty('proof')
      expect(assertionWithoutProof.id).toBe(validAssertion.id)
    })

    it('should return null proof value when no proof exists', () => {
      const { proof, ...assertionWithoutProof } = validAssertion
      const result = extractProofFromAssertion(
        assertionWithoutProof as BadgeAssertion,
      )

      expect(result.proofValue).toBeNull()
      expect(result.assertionWithoutProof).not.toHaveProperty('proof')
    })

    it('should return null when proof array is empty', () => {
      const assertionWithEmptyProof = {
        ...validAssertion,
        proof: [],
      }

      const result = extractProofFromAssertion(assertionWithEmptyProof)

      expect(result.proofValue).toBeNull()
    })

    it('should handle assertion with undefined proof', () => {
      const { proof, ...noProof } = validAssertion
      const result = extractProofFromAssertion(noProof as BadgeAssertion)

      expect(result.proofValue).toBeNull()
      expect(result.assertionWithoutProof).toEqual(noProof)
    })

    it('should use first proof when multiple proofs exist', () => {
      const multiProofAssertion = {
        ...validAssertion,
        proof: [
          {
            type: 'DataIntegrityProof',
            created: '2025-01-01T00:00:00Z',
            verificationMethod: 'https://example.com/keys/key-1',
            cryptosuite: 'eddsa-rdfc-2022',
            proofPurpose: 'assertionMethod',
            proofValue: 'zFirstProof',
          },
          {
            type: 'DataIntegrityProof',
            created: '2025-01-02T00:00:00Z',
            verificationMethod: 'https://example.com/keys/key-2',
            cryptosuite: 'eddsa-rdfc-2022',
            proofPurpose: 'assertionMethod',
            proofValue: 'zSecondProof',
          },
        ],
      }

      const result = extractProofFromAssertion(multiProofAssertion)

      expect(result.proofValue).toBe('zFirstProof')
    })
  })

  describe('validateBadgeAssertion', () => {
    it('should validate a correct badge assertion', () => {
      const result = validateBadgeAssertion(validAssertion)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject non-object input', () => {
      const result = validateBadgeAssertion('not an object')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Badge assertion must be an object')
    })

    it('should reject null input', () => {
      const result = validateBadgeAssertion(null)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Badge assertion must be an object')
    })

    it('should detect missing @context', () => {
      const { '@context': _, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid @context')
    })

    it('should detect missing id', () => {
      const { id, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid id')
    })

    it('should detect missing type', () => {
      const { type, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid type')
    })

    it('should detect missing VerifiableCredential type', () => {
      const invalid = {
        ...validAssertion,
        type: ['AchievementCredential'], // Missing VerifiableCredential
      }
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Type must include VerifiableCredential')
    })

    it('should detect missing AchievementCredential type', () => {
      const invalid = {
        ...validAssertion,
        type: ['VerifiableCredential'], // Missing AchievementCredential
      }
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Type must include AchievementCredential')
    })

    it('should detect missing credentialSubject', () => {
      const { credentialSubject, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid credentialSubject')
    })

    it('should detect missing issuer', () => {
      const { issuer, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid issuer')
    })

    it('should detect missing validFrom', () => {
      const { validFrom, ...invalid } = validAssertion
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing or invalid validFrom')
    })

    it('should collect multiple errors', () => {
      const invalid = {
        '@context': 'wrong', // Should be array
        id: 123, // Should be string
        type: 'wrong', // Should be array
      }
      const result = validateBadgeAssertion(invalid)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(3)
    })
  })

  describe('parseBadgeJson', () => {
    it('should parse valid badge JSON', () => {
      const json = JSON.stringify(validAssertion)
      const result = parseBadgeJson(json)

      expect(result.error).toBeNull()
      expect(result.assertion).toEqual(validAssertion)
    })

    it('should handle invalid JSON syntax', () => {
      const result = parseBadgeJson('{ invalid json')

      expect(result.assertion).toBeNull()
      expect(result.error).toContain('Failed to parse badge JSON')
    })

    it('should validate structure after parsing', () => {
      const invalid = { id: 'test' } // Missing required fields
      const json = JSON.stringify(invalid)
      const result = parseBadgeJson(json)

      expect(result.assertion).toBeNull()
      expect(result.error).toContain('Invalid badge structure')
    })

    it('should handle empty string', () => {
      const result = parseBadgeJson('')

      expect(result.assertion).toBeNull()
      expect(result.error).toContain('Failed to parse badge JSON')
    })

    it('should preserve all badge properties', () => {
      const json = JSON.stringify(validAssertion)
      const result = parseBadgeJson(json)

      expect(result.assertion).toHaveProperty('@context')
      expect(result.assertion).toHaveProperty('id')
      expect(result.assertion).toHaveProperty('type')
      expect(result.assertion).toHaveProperty('credentialSubject')
      expect(result.assertion).toHaveProperty('issuer')
      expect(result.assertion).toHaveProperty('validFrom')
      expect(result.assertion).toHaveProperty('proof')
    })
  })

  describe('createVerificationResult', () => {
    it('should create valid verification result', () => {
      const result = createVerificationResult(true)

      expect(result.valid).toBe(true)
      expect(result.signatureValid).toBe(true)
      expect(result.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(result.errors).toBeUndefined()
    })

    it('should create invalid verification result with errors', () => {
      const errors = ['Error 1', 'Error 2']
      const result = createVerificationResult(false, errors)

      expect(result.valid).toBe(false)
      expect(result.signatureValid).toBe(false)
      expect(result.errors).toEqual(errors)
    })

    it('should mark as valid when signature valid with no errors', () => {
      const result = createVerificationResult(true, [])

      expect(result.valid).toBe(true)
      expect(result.signatureValid).toBe(true)
    })

    it('should include timestamp in ISO format', () => {
      const result = createVerificationResult(true)
      const timestamp = new Date(result.verifiedAt)

      expect(timestamp.toISOString()).toBe(result.verifiedAt)
    })
  })

  describe('addVerificationStatus', () => {
    it('should add verification status to assertion', () => {
      const result = addVerificationStatus(validAssertion, true)

      expect(result.verified).toBe(true)
      expect(result.verificationStatus).toBeDefined()
      expect(result.verificationStatus.valid).toBe(true)
      expect(result.verificationStatus.signatureValid).toBe(true)
    })

    it('should preserve original assertion properties', () => {
      const result = addVerificationStatus(validAssertion, true)

      expect(result.id).toBe(validAssertion.id)
      expect(result.type).toEqual(validAssertion.type)
      expect(result.credentialSubject).toEqual(validAssertion.credentialSubject)
    })

    it('should include errors in verification status', () => {
      const errors = ['Signature mismatch']
      const result = addVerificationStatus(validAssertion, false, errors)

      expect(result.verified).toBe(false)
      expect(result.verificationStatus.valid).toBe(false)
      expect(result.verificationStatus.errors).toEqual(errors)
    })
  })

  describe('validateProof', () => {
    const validProof = {
      type: 'DataIntegrityProof',
      created: '2025-01-01T00:00:00Z',
      verificationMethod: 'https://example.com/keys/key-123',
      cryptosuite: 'eddsa-rdfc-2022',
      proofPurpose: 'assertionMethod',
      proofValue: 'z58DXbmfGGTqqARJ...',
    }

    it('should validate correct proof structure', () => {
      const result = validateProof(validProof)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject non-object proof', () => {
      const result = validateProof('not an object')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be an object')
    })

    it('should reject incorrect proof type', () => {
      const invalid = { ...validProof, type: 'WrongType' }
      const result = validateProof(invalid)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('DataIntegrityProof')
    })

    it('should reject incorrect cryptosuite', () => {
      const invalid = { ...validProof, cryptosuite: 'wrong-suite' }
      const result = validateProof(invalid)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('eddsa-rdfc-2022')
    })

    it('should reject missing proofValue', () => {
      const { proofValue, ...invalid } = validProof
      const result = validateProof(invalid)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('proofValue')
    })

    it('should reject missing verificationMethod', () => {
      const { verificationMethod, ...invalid } = validProof
      const result = validateProof(invalid)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('verificationMethod')
    })

    it('should reject incorrect proofPurpose', () => {
      const invalid = { ...validProof, proofPurpose: 'authentication' }
      const result = validateProof(invalid)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('assertionMethod')
    })
  })

  describe('isMultibaseProof', () => {
    it('should detect multibase proof format', () => {
      expect(isMultibaseProof('z58DXbmfGGTqqARJ...')).toBe(true)
      expect(isMultibaseProof('zABCDEF123456')).toBe(true)
    })

    it('should reject non-multibase formats', () => {
      expect(isMultibaseProof('ABC123==')).toBe(false)
      expect(isMultibaseProof('base64string')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isMultibaseProof('')).toBe(false)
    })
  })

  describe('isBase64Proof', () => {
    it('should detect base64 proof format', () => {
      expect(isBase64Proof('ABC123==')).toBe(true)
      expect(isBase64Proof('dGVzdA==')).toBe(true)
      expect(isBase64Proof('YWJjZGVm')).toBe(true)
    })

    it('should reject multibase format', () => {
      expect(isBase64Proof('z58DXbmfGGTqqARJ')).toBe(false)
    })

    it('should reject invalid base64 characters', () => {
      expect(isBase64Proof('invalid@#$')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isBase64Proof('')).toBe(false)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle full verification workflow', () => {
      // Parse JSON
      const json = JSON.stringify(validAssertion)
      const { assertion, error } = parseBadgeJson(json)

      expect(error).toBeNull()
      expect(assertion).toBeDefined()

      // Extract proof
      const { assertionWithoutProof, proofValue } = extractProofFromAssertion(
        assertion!,
      )

      expect(proofValue).toBeTruthy()
      expect(assertionWithoutProof).not.toHaveProperty('proof')

      // Validate proof
      const proofValidation = validateProof(assertion!.proof![0])
      expect(proofValidation.valid).toBe(true)

      // Add verification status
      const verified = addVerificationStatus(assertion!, true)

      expect(verified.verified).toBe(true)
      expect(verified.verificationStatus.valid).toBe(true)
    })

    it('should handle badges without proofs', () => {
      const { proof, ...noProof } = validAssertion
      const json = JSON.stringify(noProof)

      const { assertion, error } = parseBadgeJson(json)
      expect(error).toBeNull()

      const { proofValue } = extractProofFromAssertion(assertion!)
      expect(proofValue).toBeNull()

      const verified = addVerificationStatus(assertion!, false, [
        'No proof present',
      ])
      expect(verified.verified).toBe(false)
      expect(verified.verificationStatus.errors).toContain('No proof present')
    })
  })
})
