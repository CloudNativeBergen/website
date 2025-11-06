/**
 * Tests for Badge Key Endpoint
 * Validates proper Base58btc encoding for Multikey format
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { GET } from '@/app/api/badge/keys/[keyId]/route'
import bs58 from 'bs58'

describe('Badge Keys API', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BADGE_ISSUER_PUBLIC_KEY:
        '6c4cf79d3a8b5e2f1d0c9e7a4b6d8f2a5c1e9b7d4a8f6c2e5b9d1a7f3c8e4b6d',
      BADGE_ISSUER_URL: 'https://cloudnativebergen.no',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('GET /api/badge/keys/[keyId]', () => {
    it('should return public key in Multikey format with Base58btc encoding', async () => {
      const keyId = 'key-6c4cf79d'
      const mockRequest = new Request(
        `https://cloudnativebergen.no/api/badge/keys/${keyId}`,
      )
      const mockContext = {
        params: Promise.resolve({ keyId }),
      }

      const response = await GET(mockRequest, mockContext)
      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data).toHaveProperty('@context')
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('type', 'Multikey')
      expect(data).toHaveProperty('controller')
      expect(data).toHaveProperty('publicKeyMultibase')

      const { publicKeyMultibase } = data

      // Should start with 'z' (Base58btc multibase prefix)
      expect(publicKeyMultibase).toMatch(/^z/)

      // Should only contain valid Base58 characters (no 0, O, I, l, +, /, =, _)
      expect(publicKeyMultibase.substring(1)).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)

      // Should not contain invalid Base58 characters
      expect(publicKeyMultibase).not.toMatch(/[0OIl+/=_]/)

      // Verify it can be decoded
      const multikeyBytes = bs58.decode(publicKeyMultibase.substring(1))
      expect(multikeyBytes.length).toBeGreaterThan(2)

      // Should have Ed25519 multicodec prefix (0xed01)
      expect(multikeyBytes[0]).toBe(0xed)
      expect(multikeyBytes[1]).toBe(0x01)

      // Remaining bytes should be the public key (32 bytes for Ed25519)
      expect(multikeyBytes.length).toBe(34) // 2 bytes prefix + 32 bytes key
    })

    it('should return correct JSON-LD context and structure', async () => {
      const keyId = 'key-6c4cf79d'
      const mockRequest = new Request(
        `https://cloudnativebergen.no/api/badge/keys/${keyId}`,
      )
      const mockContext = {
        params: Promise.resolve({ keyId }),
      }

      const response = await GET(mockRequest, mockContext)
      const data = await response.json()

      expect(data['@context']).toEqual([
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/multikey/v1',
      ])
      expect(data.id).toBe(
        'https://cloudnativebergen.no/api/badge/keys/key-6c4cf79d',
      )
      expect(data.controller).toBe('https://cloudnativebergen.no')
    })

    it('should return 404 for non-matching key ID', async () => {
      const keyId = 'key-invalid123'
      const mockRequest = new Request(
        `https://cloudnativebergen.no/api/badge/keys/${keyId}`,
      )
      const mockContext = {
        params: Promise.resolve({ keyId }),
      }

      const response = await GET(mockRequest, mockContext)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data).toHaveProperty('error', 'Key not found')
    })

    it('should return 500 if public key not configured', async () => {
      delete process.env.BADGE_ISSUER_PUBLIC_KEY

      const keyId = 'key-6c4cf79d'
      const mockRequest = new Request(
        `https://cloudnativebergen.no/api/badge/keys/${keyId}`,
      )
      const mockContext = {
        params: Promise.resolve({ keyId }),
      }

      const response = await GET(mockRequest, mockContext)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data).toHaveProperty('error', 'Public key not configured')
    })

    it('should include proper CORS and caching headers', async () => {
      const keyId = 'key-6c4cf79d'
      const mockRequest = new Request(
        `https://cloudnativebergen.no/api/badge/keys/${keyId}`,
      )
      const mockContext = {
        params: Promise.resolve({ keyId }),
      }

      const response = await GET(mockRequest, mockContext)

      expect(response.headers.get('Content-Type')).toBe('application/ld+json')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET')
      expect(response.headers.get('Cache-Control')).toContain('public')
      expect(response.headers.get('Cache-Control')).toContain('immutable')
    })
  })

  describe('Base58btc encoding validation', () => {
    it('should produce valid Base58btc for various key lengths', () => {
      const testKeys = [
        '6c4cf79d3a8b5e2f1d0c9e7a4b6d8f2a5c1e9b7d4a8f6c2e5b9d1a7f3c8e4b6d',
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      ]

      testKeys.forEach((keyHex) => {
        const publicKeyBytes = Buffer.from(keyHex, 'hex')
        const ed25519Prefix = Buffer.from([0xed, 0x01])
        const multikeyBytes = Buffer.concat([ed25519Prefix, publicKeyBytes])
        const publicKeyMultibase = 'z' + bs58.encode(multikeyBytes)

        // Should start with 'z'
        expect(publicKeyMultibase[0]).toBe('z')

        // Should only contain valid Base58 characters
        expect(publicKeyMultibase.substring(1)).toMatch(
          /^[1-9A-HJ-NP-Za-km-z]+$/,
        )

        // Should be decodable
        const decoded = bs58.decode(publicKeyMultibase.substring(1))
        expect(decoded).toEqual(multikeyBytes)
      })
    })
  })
})
