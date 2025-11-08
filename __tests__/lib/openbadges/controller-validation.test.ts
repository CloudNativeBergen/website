import { describe, it, expect } from '@jest/globals'
import {
  generateMultikeyDocument,
  generateKeyId,
  publicKeyToDidKey,
  generateDidKeyMultikeyDocument,
} from '@/lib/openbadges'

// A 32-byte (64 hex chars) dummy Ed25519 public key
const PUBLIC_KEY =
  '1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d'

describe('OpenBadges controller validation', () => {
  describe('HTTP(S) controllers', () => {
    it('accepts valid issuer profile controller', () => {
      const keyId = generateKeyId(PUBLIC_KEY)
      const controller = 'https://example.dev/api/badge/issuer'
      const doc = generateMultikeyDocument(PUBLIC_KEY, keyId, controller)
      expect(doc.controller).toBe(controller)
    })

    it('rejects bare domain without issuer path', () => {
      const keyId = generateKeyId(PUBLIC_KEY)
      expect(() =>
        generateMultikeyDocument(PUBLIC_KEY, keyId, 'https://example.dev'),
      ).toThrow(/issuer profile endpoint/)
    })
  })

  describe('DID-based controllers', () => {
    it('generates valid did:key from public key', () => {
      const didKey = publicKeyToDidKey(PUBLIC_KEY)
      expect(didKey).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/)
    })

    it('generates Multikey document with did:key controller', () => {
      const doc = generateDidKeyMultikeyDocument(PUBLIC_KEY)
      expect(doc.controller).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/)
      expect(doc.id).toMatch(
        /^did:key:z[1-9A-HJ-NP-Za-km-z]+#z[1-9A-HJ-NP-Za-km-z]+$/,
      )
      expect(doc.type).toBe('Multikey')
      expect(doc.publicKeyMultibase).toMatch(/^z[1-9A-HJ-NP-Za-km-z]+$/)
    })

    it('accepts did:key as controller in generateMultikeyDocument', () => {
      const keyId = generateKeyId(PUBLIC_KEY)
      const didKey = publicKeyToDidKey(PUBLIC_KEY)
      const doc = generateMultikeyDocument(PUBLIC_KEY, keyId, didKey)
      expect(doc.controller).toBe(didKey)
      expect(doc.controller).toMatch(/^did:key:/)
    })
  })
})
