/**
 * OpenBadges 3.0 Specification Compliance Tests
 *
 * Validates that our implementation follows the official OpenBadges 3.0 spec:
 * - JWT structure (JOSE header, payload, signature)
 * - Credential structure (Achievement with creator, not issuer)
 * - Schema validation against official JSON schemas
 */

import { describe, it, expect } from '@jest/globals'
import { signCredentialJWT, verifyCredentialJWT } from '@/lib/openbadges/crypto'
import { createCredential } from '@/lib/openbadges/credential'
import { validateCredential } from '@/lib/openbadges/validator'
import type { CredentialConfig, SigningConfig } from '@/lib/openbadges/types'

describe('OpenBadges 3.0 Specification Compliance', () => {
  const mockSigningConfig: SigningConfig = {
    privateKey: 'a'.repeat(64), // 32-byte hex key
    publicKey: 'b'.repeat(64), // 32-byte hex key
    verificationMethod: 'https://example.com/issuer#key-1',
  }

  const mockCredentialConfig: CredentialConfig = {
    credentialId: 'https://example.com/credentials/123',
    name: 'Test Badge',
    issuer: {
      id: 'https://example.com/issuer',
      name: 'Test Issuer',
      url: 'https://example.com',
      email: 'issuer@example.com',
    },
    subject: {
      id: 'https://example.com/users/test',
      type: ['AchievementSubject'],
    },
    achievement: {
      id: 'https://example.com/achievements/test',
      name: 'Test Achievement',
      description: 'A test achievement',
      criteria: {
        narrative: 'Complete the test',
      },
      image: {
        id: 'https://example.com/images/badge.png',
        type: 'Image',
      },
    },
    validFrom: '2024-01-01T00:00:00Z',
  }

  describe('JWT Structure Compliance', () => {
    it('should create JWT with three parts separated by periods (Compact JWS)', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // JWT must be: base64url(header).base64url(payload).base64url(signature)
      const parts = jwt.split('.')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/) // base64url header
      expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/) // base64url payload
      expect(parts[2]).toMatch(/^[A-Za-z0-9_-]+$/) // base64url signature
    })

    it('should have JOSE header with required fields', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Decode JOSE header (first part)
      const [headerB64] = jwt.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8')
      const header = JSON.parse(headerJson)

      // Per spec: JOSE header must include alg, typ, kid
      expect(header).toHaveProperty('alg')
      expect(header.alg).toMatch(/^(RS256|EdDSA)$/)
      expect(header).toHaveProperty('typ', 'JWT')
      expect(header).toHaveProperty('kid', mockSigningConfig.verificationMethod)
    })

    it('should include credential at top level in JWT payload (not wrapped in vc)', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Decode payload (second part)
      const [, payloadB64] = jwt.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
      const payload = JSON.parse(payloadJson)

      // CRITICAL: Credential properties must be at top level, NOT in 'vc' wrapper
      expect(payload).not.toHaveProperty('vc')
      expect(payload).toHaveProperty('@context')
      expect(payload).toHaveProperty('type')
      expect(payload).toHaveProperty('id')
      expect(payload).toHaveProperty('credentialSubject')
      expect(payload).toHaveProperty('issuer')

      // JWT registered claims per spec section 8.2.4.1
      expect(payload).toHaveProperty('iss') // issuer.id (required)
      expect(payload).toHaveProperty('jti') // credential id (required)
      expect(payload).toHaveProperty('sub') // credentialSubject.id (required)
      expect(payload).toHaveProperty('nbf') // validFrom (required)
      // exp is optional (only if validUntil exists)

      // Verify claim values match spec
      expect(payload.iss).toBe(mockCredentialConfig.issuer.id)
      expect(payload.jti).toBe(mockCredentialConfig.credentialId)
      expect(payload.sub).toBe(mockCredentialConfig.subject.id)

      // nbf should be validFrom converted to NumericDate (seconds since epoch)
      const expectedNbf = Math.floor(
        new Date(mockCredentialConfig.validFrom).getTime() / 1000,
      )
      expect(payload.nbf).toBe(expectedNbf)
    })

    it('should have verifiable signature (JWS Signature)', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Signature verification should succeed
      const verified = await verifyCredentialJWT(
        jwt,
        mockSigningConfig.publicKey,
      )
      expect(verified).toBeDefined()
      expect(verified.id).toBe(credential.id)
    })
  })

  describe('Credential Structure Compliance', () => {
    it('should have Achievement with creator property (not issuer)', () => {
      const credential = createCredential(mockCredentialConfig)

      // Per OpenBadges 3.0 spec section B.1.1: Achievement uses "creator"
      expect(credential.credentialSubject.achievement).toHaveProperty('creator')
      expect(credential.credentialSubject.achievement).not.toHaveProperty(
        'issuer',
      )
    })

    it('should validate against official OpenBadges 3.0 AchievementCredential schema', () => {
      const credential = createCredential(mockCredentialConfig)

      // Validate against official JSON schema
      const result = validateCredential(credential)

      expect(result.valid).toBe(true)
      if (!result.valid) {
        console.error('Validation errors:', result.errors)
      }
    })

    it('should have correct @context for OpenBadges 3.0', () => {
      const credential = createCredential(mockCredentialConfig)

      // Per spec: @context must include credentials/v2 and ob/v3p0/context
      expect(credential['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(credential['@context']).toContain(
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      )
    })

    it('should have type array including VerifiableCredential and AchievementCredential', () => {
      const credential = createCredential(mockCredentialConfig)

      expect(credential.type).toContain('VerifiableCredential')
      expect(credential.type).toContain('AchievementCredential')
    })

    it('should have all required OpenBadges fields', () => {
      const credential = createCredential(mockCredentialConfig)

      // Required credential fields
      expect(credential).toHaveProperty('@context')
      expect(credential).toHaveProperty('id')
      expect(credential).toHaveProperty('type')
      expect(credential).toHaveProperty('issuer')
      expect(credential).toHaveProperty('validFrom')
      expect(credential).toHaveProperty('credentialSubject')

      // Required credentialSubject fields
      expect(credential.credentialSubject).toHaveProperty('id')
      expect(credential.credentialSubject).toHaveProperty('type')
      expect(credential.credentialSubject).toHaveProperty('achievement')

      // Required achievement fields
      const achievement = credential.credentialSubject.achievement
      expect(achievement).toHaveProperty('id')
      expect(achievement).toHaveProperty('type')
      expect(achievement).toHaveProperty('name')
      expect(achievement).toHaveProperty('description')
      expect(achievement).toHaveProperty('criteria')
      expect(achievement).toHaveProperty('image')
      expect(achievement).toHaveProperty('creator') // NOT 'issuer'

      // Required issuer/creator fields
      expect(credential.issuer).toHaveProperty('id')
      expect(credential.issuer).toHaveProperty('type')
      expect(credential.issuer).toHaveProperty('name')
      expect(achievement.creator).toHaveProperty('id')
      expect(achievement.creator).toHaveProperty('type')
      expect(achievement.creator).toHaveProperty('name')
    })
  })

  describe('JWT Payload vs Schema Validation', () => {
    it('should produce JWT payload that validates against AchievementCredential schema', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Decode payload
      const [, payloadB64] = jwt.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
      const payload = JSON.parse(payloadJson)

      // Remove JWT registered claims to get clean credential
      const { iss, jti, sub, iat, exp, nbf, aud, ...credentialFromJWT } =
        payload

      // Validate extracted credential against schema
      const result = validateCredential(credentialFromJWT)
      expect(result.valid).toBe(true)
      if (!result.valid) {
        console.error('JWT payload validation errors:', result.errors)
      }
    })
  })

  describe('Spec Section 8.2.4.1 - JWT Payload Format', () => {
    it('should include all required JWT claims per spec', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // Required claims per spec section 8.2.4.1
      expect(payload.iss).toBe(mockCredentialConfig.issuer.id) // issuer.id (required)
      expect(payload.jti).toBe(mockCredentialConfig.credentialId) // credential.id (required)
      expect(payload.sub).toBe(mockCredentialConfig.subject.id) // credentialSubject.id (required)

      // nbf: validFrom as NumericDate (required)
      const expectedNbf = Math.floor(
        new Date(mockCredentialConfig.validFrom).getTime() / 1000,
      )
      expect(payload.nbf).toBe(expectedNbf)
    })

    it('should include exp claim when validUntil is present', async () => {
      const configWithExpiry = {
        ...mockCredentialConfig,
        validUntil: '2025-12-31T23:59:59Z',
      }

      const credential = createCredential(configWithExpiry)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // exp: validUntil as NumericDate (required if validUntil exists)
      const expectedExp = Math.floor(
        new Date(configWithExpiry.validUntil!).getTime() / 1000,
      )
      expect(payload.exp).toBe(expectedExp)
    })

    it('should omit exp claim when validUntil is not present', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // exp is optional (only if validUntil exists)
      expect(payload).not.toHaveProperty('exp')
    })

    it('should not include iat claim (not in spec)', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // iat is NOT in the OpenBadges 3.0 spec, should not be present
      expect(payload).not.toHaveProperty('iat')
    })
  })

  describe('Spec Section 8.2.2 - Four Steps Compliance', () => {
    it('should follow all 4 steps: JOSE Header, JWT Payload, Signature, Compact JWS', async () => {
      const credential = createCredential(mockCredentialConfig)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Step 1: Create JOSE Header
      const [headerB64] = jwt.split('.')
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf8'),
      )
      expect(header).toHaveProperty('alg')
      expect(header).toHaveProperty('typ', 'JWT')

      // Step 2: Create JWT Payload from credential
      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )
      expect(payload).toHaveProperty('@context')
      expect(payload).toHaveProperty('credentialSubject')

      // Step 3: Compute signature (verified by successful verification)
      const verified = await verifyCredentialJWT(
        jwt,
        mockSigningConfig.publicKey,
      )
      expect(verified).toBeDefined()

      // Step 4: Encode as Compact JWS (three base64url parts)
      expect(jwt.split('.')).toHaveLength(3)
      expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    })
  })
})
