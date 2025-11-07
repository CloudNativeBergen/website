import { describe, it, expect } from '@jest/globals'
import { generateMultikeyDocument, generateKeyId } from '@/lib/openbadges'

// A 32-byte (64 hex chars) dummy Ed25519 public key
const PUBLIC_KEY =
  '1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d'

describe('OpenBadges controller validation', () => {
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
