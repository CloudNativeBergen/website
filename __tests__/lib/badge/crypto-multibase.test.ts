/**
 * Tests for Badge Cryptography - Multibase Format
 * Validates that signatures use proper Base58btc multibase encoding
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
  signBadgeData,
  verifyBadgeSignature,
  getVerificationMethod,
} from '@/lib/badge/crypto'
import bs58 from 'bs58'

describe('Badge Crypto - Multibase Format', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      // Valid Ed25519 key pair (generated using scripts/generate-badge-keys.ts)
      BADGE_ISSUER_PRIVATE_KEY:
        'd6e2f676b1c106ffe56b08424a77b5590d8a19cb119ecb35a005b1b4baa570d2',
      BADGE_ISSUER_PUBLIC_KEY:
        '36f594e8fc805ad04bbc0718bdb053cff38c13b4b296c3dbe42f8aad9f2016e2',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('signBadgeData', () => {
    it('should return signature in multibase format', async () => {
      const testData = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential'],
        id: 'https://example.com/badge/123',
      }

      const signature = await signBadgeData(testData)

      // Should start with 'z' (base58btc multibase prefix)
      expect(signature).toMatch(/^z/)

      // Should only contain valid Base58 characters (no 0, O, I, l)
      expect(signature.substring(1)).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)

      // Should not contain invalid Base58 characters
      expect(signature).not.toMatch(/[0OIl]/)

      // Should not contain Base64-specific characters
      expect(signature).not.toMatch(/[+/=_]/)
    })

    it('should produce decodable Base58btc signatures', async () => {
      const testData = {
        test: 'data',
        number: 123,
      }

      const signature = await signBadgeData(testData)

      // Should be decodable as Base58
      expect(() => {
        const decoded = bs58.decode(signature.substring(1))
        expect(decoded.length).toBe(64) // Ed25519 signatures are 64 bytes
      }).not.toThrow()
    })

    it('should produce consistent signatures for same data', async () => {
      const testData = { foo: 'bar', baz: 123 }

      const sig1 = await signBadgeData(testData)
      const sig2 = await signBadgeData(testData)

      // Ed25519 signatures are deterministic
      expect(sig1).toBe(sig2)
      expect(sig1).toMatch(/^z/)

      // Should be verifiable
      expect(await verifyBadgeSignature(testData, sig1)).toBe(true)
    })
  })

  describe('verifyBadgeSignature', () => {
    it('should verify valid multibase signatures', async () => {
      const testData = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential'],
      }

      const signature = await signBadgeData(testData)
      const isValid = await verifyBadgeSignature(testData, signature)

      expect(isValid).toBe(true)
    })

    it('should reject invalid multibase signatures', async () => {
      const testData = { test: 'data' }
      const invalidSignature = 'z' + 'A'.repeat(87) // Invalid signature

      const isValid = await verifyBadgeSignature(testData, invalidSignature)

      expect(isValid).toBe(false)
    })

    it('should reject signatures for tampered data', async () => {
      const originalData = { test: 'original' }
      const tamperedData = { test: 'tampered' }

      const signature = await signBadgeData(originalData)
      const isValid = await verifyBadgeSignature(tamperedData, signature)

      expect(isValid).toBe(false)
    })

    it('should handle backwards compatibility with base64 signatures', async () => {
      // Simulate old base64 signature format
      const testData = { test: 'data' }
      const base64Signature =
        'flrYfxmdLA03JLJKAEiGDZjwNyki5QSlNR5O03nHd/prCD9xDWuikMEg5OoeaLZAWtnsa2D0rAnnrwlrcrMrCA=='

      // Should not throw, though verification may fail (we don't have the right key)
      const isValid = await verifyBadgeSignature(testData, base64Signature)

      // The function should handle base64 format without throwing
      expect(typeof isValid).toBe('boolean')
    })

    it('should verify complete badge assertion', async () => {
      const assertion = {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        id: 'https://cloudnativebergen.no/api/badge/test-123',
        type: ['VerifiableCredential', 'AchievementCredential'],
        credentialSubject: {
          id: 'mailto:test@example.com',
          type: ['AchievementSubject'],
          achievement: {
            id: 'https://cloudnativebergen.no/achievement/speaker',
            type: ['Achievement'],
            name: 'Speaker Badge',
          },
        },
        issuer: {
          id: 'https://cloudnativebergen.no',
          type: ['Profile'],
          name: 'Cloud Native Bergen',
        },
        validFrom: '2025-11-06T00:00:00Z',
      }

      const signature = await signBadgeData(assertion)
      const isValid = await verifyBadgeSignature(assertion, signature)

      expect(signature).toMatch(/^z/)
      expect(isValid).toBe(true)
    })
  })

  describe('multibase format validation', () => {
    it('should produce signatures with valid multibase structure', async () => {
      const testData = { test: 'multibase' }
      const signature = await signBadgeData(testData)

      // Extract the Base58 part (without 'z' prefix)
      const base58Part = signature.substring(1)

      // Should decode to 64 bytes (Ed25519 signature length)
      const decoded = bs58.decode(base58Part)
      expect(decoded.length).toBe(64)

      // Should be a Uint8Array or Buffer
      expect(decoded).toBeInstanceOf(Uint8Array)
    })

    it('should not contain URL-unsafe characters', async () => {
      const testData = { url: 'https://example.com/path?query=value' }
      const signature = await signBadgeData(testData)

      // Base58btc should not have URL-unsafe characters
      expect(signature).not.toMatch(/[+/=]/)
      expect(signature).not.toMatch(/\s/)
    })

    it('should be consistent with verification method format', () => {
      const verificationMethod = getVerificationMethod(['cloudnativebergen.no'])

      // Verification method should use the same domain and key format
      expect(verificationMethod).toMatch(
        /^https:\/\/cloudnativebergen\.no\/api\/badge\/keys\/key-[a-f0-9]+$/,
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty objects', async () => {
      const emptyData = {}
      const signature = await signBadgeData(emptyData)

      expect(signature).toMatch(/^z/)

      const isValid = await verifyBadgeSignature(emptyData, signature)
      expect(isValid).toBe(true)
    })

    it('should handle nested objects', async () => {
      const nestedData = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      }

      const signature = await signBadgeData(nestedData)
      expect(signature).toMatch(/^z/)

      const isValid = await verifyBadgeSignature(nestedData, signature)
      expect(isValid).toBe(true)
    })

    it('should handle arrays in data', async () => {
      const dataWithArrays = {
        items: [1, 2, 3],
        nested: [{ a: 1 }, { b: 2 }],
      }

      const signature = await signBadgeData(dataWithArrays)
      expect(signature).toMatch(/^z/)

      const isValid = await verifyBadgeSignature(dataWithArrays, signature)
      expect(isValid).toBe(true)
    })

    it('should handle Unicode characters', async () => {
      const unicodeData = {
        name: 'Hans Kristian Flåtten',
        emoji: '🎉',
        chinese: '你好',
      }

      const signature = await signBadgeData(unicodeData)
      expect(signature).toMatch(/^z/)

      const isValid = await verifyBadgeSignature(unicodeData, signature)
      expect(isValid).toBe(true)
    })
  })
})
