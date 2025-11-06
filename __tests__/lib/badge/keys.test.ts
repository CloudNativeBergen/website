/**
 * Tests for Badge Key Management
 *
 * Tests the pure functions for generating and validating badge verification keys
 */

import { describe, it, expect } from '@jest/globals'
import bs58 from 'bs58'
import {
  generateMultikeyDocument,
  validateKeyId,
  validateMultibasePublicKey,
  extractPublicKeyFromMultibase,
  KeyValidationError,
  type MultikeyDocument,
} from '@/lib/badge/keys'

describe('Badge Key Management', () => {
  const testPublicKeyHex =
    '6c4cf79d3a8b5e2f1d0c9e7a4b6d8f2a5c1e9b7d4a8f6c2e5b9d1a7f3c8e4b6d'
  const testKeyId = 'key-6c4cf79d'
  const testIssuerUrl = 'https://2025.cloudnativebergen.dev'

  describe('validateKeyId', () => {
    it('should validate a correctly formatted key ID', () => {
      const result = validateKeyId(testKeyId, testPublicKeyHex)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject key ID without "key-" prefix', () => {
      const result = validateKeyId('invalid-6c4cf79d', testPublicKeyHex)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must start with "key-"')
    })

    it('should reject key ID that does not match public key prefix', () => {
      const result = validateKeyId('key-abcd1234', testPublicKeyHex)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('does not match public key prefix')
    })

    it('should validate key ID with full public key hex', () => {
      const keyId = `key-${testPublicKeyHex}`
      const result = validateKeyId(keyId, testPublicKeyHex)
      expect(result.valid).toBe(true)
    })
  })

  describe('generateMultikeyDocument', () => {
    it('should generate a valid Multikey document', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      expect(doc).toHaveProperty('@context')
      expect(doc['@context']).toContain('https://www.w3.org/ns/credentials/v2')
      expect(doc['@context']).toContain('https://w3id.org/security/multikey/v1')

      expect(doc.type).toBe('Multikey')
      expect(doc.controller).toBe(testIssuerUrl)
      expect(doc.id).toBe(`${testIssuerUrl}/api/badge/keys/${testKeyId}`)
      expect(doc.publicKeyMultibase).toMatch(/^z/)
    })

    it('should throw error for invalid public key hex length', () => {
      expect(() => {
        generateMultikeyDocument('invalid', testKeyId, testIssuerUrl)
      }).toThrow(KeyValidationError)
      expect(() => {
        generateMultikeyDocument('invalid', testKeyId, testIssuerUrl)
      }).toThrow('64-character hex string')
    })

    it('should throw error for invalid key ID', () => {
      expect(() => {
        generateMultikeyDocument(testPublicKeyHex, 'invalid', testIssuerUrl)
      }).toThrow(KeyValidationError)
      expect(() => {
        generateMultikeyDocument(testPublicKeyHex, 'invalid', testIssuerUrl)
      }).toThrow('must start with "key-"')
    })

    it('should throw error for invalid issuer URL', () => {
      expect(() => {
        generateMultikeyDocument(testPublicKeyHex, testKeyId, 'not-a-url')
      }).toThrow(KeyValidationError)
      expect(() => {
        generateMultikeyDocument(testPublicKeyHex, testKeyId, 'not-a-url')
      }).toThrow('http://')
    })

    it('should generate consistent output for same inputs', () => {
      const doc1 = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )
      const doc2 = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      expect(doc1).toEqual(doc2)
    })

    it('should handle different issuer URLs correctly', () => {
      const doc1 = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        'https://2025.cloudnativebergen.dev',
      )
      const doc2 = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        'https://2026.cloudnativebergen.dev',
      )

      expect(doc1.controller).not.toBe(doc2.controller)
      expect(doc1.id).not.toBe(doc2.id)
      expect(doc1.publicKeyMultibase).toBe(doc2.publicKeyMultibase) // Same key
    })
  })

  describe('validateMultibasePublicKey', () => {
    it('should validate a properly formatted multibase key', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )
      const result = validateMultibasePublicKey(doc.publicKeyMultibase)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject key without "z" prefix', () => {
      const result = validateMultibasePublicKey('a' + 'A'.repeat(50))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must start with "z"')
    })

    it('should reject key with invalid Base58 characters', () => {
      const result = validateMultibasePublicKey('z0OIl+/=_') // Invalid chars
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid Base58 characters')
    })

    it('should reject key with incorrect length', () => {
      const result = validateMultibasePublicKey('z' + '1'.repeat(10)) // Too short
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Expected 34 bytes')
    })

    it('should reject key without Ed25519 multicodec prefix', () => {
      // Create a 34-byte buffer with wrong prefix (should be 0xed01)
      const wrongPrefix = Buffer.concat([
        Buffer.from([0x00, 0x00]), // Wrong prefix
        Buffer.from(testPublicKeyHex, 'hex'), // Valid 32-byte key
      ])
      const badKey = 'z' + bs58.encode(wrongPrefix)

      const result = validateMultibasePublicKey(badKey)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('multicodec prefix')
    })
  })

  describe('extractPublicKeyFromMultibase', () => {
    it('should extract public key bytes from multibase encoding', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )
      const extracted = extractPublicKeyFromMultibase(doc.publicKeyMultibase)

      expect(extracted).toBeInstanceOf(Buffer)
      expect(extracted.length).toBe(32) // Ed25519 public key is 32 bytes
      expect(extracted.toString('hex')).toBe(testPublicKeyHex)
    })

    it('should throw error for invalid multibase key', () => {
      expect(() => {
        extractPublicKeyFromMultibase('invalid')
      }).toThrow(KeyValidationError)
    })

    it('should handle various valid public keys', () => {
      const testKeys = [
        '6c4cf79d3a8b5e2f1d0c9e7a4b6d8f2a5c1e9b7d4a8f6c2e5b9d1a7f3c8e4b6d',
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      ]

      testKeys.forEach((keyHex) => {
        const doc = generateMultikeyDocument(keyHex, testKeyId, testIssuerUrl)
        const extracted = extractPublicKeyFromMultibase(doc.publicKeyMultibase)
        expect(extracted.toString('hex')).toBe(keyHex)
      })
    })
  })

  describe('Multikey format compliance', () => {
    it('should generate Base58btc encoded keys', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      // Should start with 'z' (Base58btc multibase prefix)
      expect(doc.publicKeyMultibase[0]).toBe('z')

      // Should only contain valid Base58 characters
      const base58Part = doc.publicKeyMultibase.substring(1)
      expect(base58Part).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
    })

    it('should include Ed25519 multicodec prefix', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      // Extract and verify the multicodec prefix
      const extracted = extractPublicKeyFromMultibase(doc.publicKeyMultibase)
      expect(extracted.length).toBe(32) // Confirms prefix was stripped correctly
    })

    it('should match W3C Multikey specification structure', () => {
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      // Required fields per W3C spec
      expect(doc).toHaveProperty('@context')
      expect(doc).toHaveProperty('id')
      expect(doc).toHaveProperty('type')
      expect(doc).toHaveProperty('controller')
      expect(doc).toHaveProperty('publicKeyMultibase')

      // Context must include both required contexts
      expect(Array.isArray(doc['@context'])).toBe(true)
      expect(doc['@context'].length).toBeGreaterThanOrEqual(2)

      // Type must be exactly 'Multikey'
      expect(doc.type).toBe('Multikey')

      // Controller and ID must be valid URLs
      expect(doc.controller).toMatch(/^https?:\/\//)
      expect(doc.id).toMatch(/^https?:\/\//)
    })
  })

  describe('Error handling', () => {
    it('should provide clear error messages for validation failures', () => {
      const result1 = validateKeyId('invalid', testPublicKeyHex)
      expect(result1.error).toBeDefined()
      expect(result1.error).toContain('key-')

      const result2 = validateMultibasePublicKey('invalid')
      expect(result2.error).toBeDefined()
      expect(result2.error).toContain('start with "z"')
    })

    it('should throw typed errors for generation failures', () => {
      let error: Error | undefined

      try {
        generateMultikeyDocument('short', testKeyId, testIssuerUrl)
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeInstanceOf(KeyValidationError)
      expect(error?.name).toBe('KeyValidationError')
    })
  })

  describe('Integration scenarios', () => {
    it('should work with the full key generation and validation flow', () => {
      // Generate document
      const doc = generateMultikeyDocument(
        testPublicKeyHex,
        testKeyId,
        testIssuerUrl,
      )

      // Validate key ID
      const keyValidation = validateKeyId(testKeyId, testPublicKeyHex)
      expect(keyValidation.valid).toBe(true)

      // Validate multibase encoding
      const multibaseValidation = validateMultibasePublicKey(
        doc.publicKeyMultibase,
      )
      expect(multibaseValidation.valid).toBe(true)

      // Extract and verify key
      const extractedKey = extractPublicKeyFromMultibase(doc.publicKeyMultibase)
      expect(extractedKey.toString('hex')).toBe(testPublicKeyHex)

      // Verify document structure
      expect(doc.id).toContain(testKeyId)
      expect(doc.controller).toBe(testIssuerUrl)
    })

    it('should handle edge cases in key IDs', () => {
      const edgeCaseKeyIds = [
        'key-6c4cf79d', // Minimum prefix
        `key-${testPublicKeyHex}`, // Full key as ID
        'key-6c4cf79d-extra-info', // With suffix
      ]

      edgeCaseKeyIds.forEach((keyId) => {
        const result = validateKeyId(keyId, testPublicKeyHex)
        expect(result.valid).toBe(true)
      })
    })

    it('should work with different conference domains', () => {
      const domains = [
        'https://2025.cloudnativebergen.dev',
        'https://2026.cloudnativebergen.dev',
        'https://cloudnativebergen.no',
      ]

      domains.forEach((domain) => {
        const doc = generateMultikeyDocument(
          testPublicKeyHex,
          testKeyId,
          domain,
        )
        expect(doc.controller).toBe(domain)
        expect(doc.id).toContain(domain)

        // Key should be the same regardless of domain
        const extracted = extractPublicKeyFromMultibase(doc.publicKeyMultibase)
        expect(extracted.toString('hex')).toBe(testPublicKeyHex)
      })
    })
  })
})
