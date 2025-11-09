/**
 * Golden Data Round-Trip Tests
 *
 * Validates that our implementation can:
 * 1. Parse and validate the official OpenBadges 3.0 spec example
 * 2. Recreate an equivalent credential structure
 * 3. Sign and verify credentials in JWT format
 */

import { createCredential } from '@/lib/openbadges/credential'
import { validateCredential } from '@/lib/openbadges/validator'
import { signCredentialJWT, verifyCredentialJWT } from '@/lib/openbadges/crypto'
import type {
  CredentialConfig,
  SigningConfig,
  Credential,
} from '@/lib/openbadges/types'
import goldenPayload from '@/lib/openbadges/data/credential-jwt-body.json'

describe('Golden Data Round-Trip - Create and Validate', () => {
  // Mock signing config using Ed25519 keys (32-byte hex)
  const mockSigningConfig: SigningConfig = {
    privateKey: 'a'.repeat(64), // 32-byte hex key
    publicKey: 'b'.repeat(64), // 32-byte hex key
    verificationMethod: 'https://example.com/issuer#key-1',
  }

  describe('Parse and Validate Golden Data', () => {
    it('should successfully validate the golden credential', () => {
      // Remove JWT claims to get pure credential
      const { iss, jti, sub, ...credential } = goldenPayload as any

      const result = validateCredential(credential as Credential)

      if (!result.valid) {
        console.error(
          'Validation errors:',
          JSON.stringify(result.errors, null, 2),
        )
      }

      expect(result.valid).toBe(true)
    })

    it('should validate golden credential has all required fields', () => {
      expect(goldenPayload).toHaveProperty('@context')
      expect(goldenPayload).toHaveProperty('id')
      expect(goldenPayload).toHaveProperty('type')
      expect(goldenPayload).toHaveProperty('credentialSubject')
      expect(goldenPayload).toHaveProperty('issuer')
      expect(goldenPayload).toHaveProperty('validFrom')
    })

    it('should confirm golden credential uses creator (not issuer) in Achievement', () => {
      const achievement = goldenPayload.credentialSubject.achievement
      expect(achievement).toHaveProperty('creator')
      expect(achievement).not.toHaveProperty('issuer')
    })
  })

  describe('Recreate Equivalent Credential', () => {
    it('should create a credential matching golden structure', () => {
      const config: CredentialConfig = {
        credentialId: 'https://cloudnativebergen.no/credentials/test-123',
        name: 'Cloud Native Bergen Conference 2025 Attendee',
        issuer: {
          id: 'https://cloudnativebergen.no/issuer',
          name: 'Cloud Native Bergen',
          url: 'https://cloudnativebergen.no',
          email: 'hello@cloudnativebergen.no',
          description:
            'Cloud Native Bergen is a community for cloud native enthusiasts.',
          image: {
            id: 'https://cloudnativebergen.no/logo.png',
            type: 'Image',
          },
        },
        subject: {
          id: 'did:example:test-subject',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://cloudnativebergen.no/achievements/conference-2025',
          name: 'Conference 2025 Attendee',
          description: 'Attended Cloud Native Bergen Conference 2025',
          criteria: {
            narrative:
              'Attended the full day conference and participated in sessions.',
          },
          image: {
            id: 'https://cloudnativebergen.no/badges/conference-2025.png',
            type: 'Image',
          },
        },
        validFrom: '2025-03-15T09:00:00Z',
        validUntil: '2025-12-31T23:59:59Z',
      }

      const credential = createCredential(config)

      // Validate structure matches OpenBadges 3.0 spec
      expect(credential).toHaveProperty('@context')
      expect(credential['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(credential['@context']).toContain(
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      )

      expect(credential.type).toContain('VerifiableCredential')
      expect(credential.type).toContain('AchievementCredential')

      expect(credential.id).toBe(config.credentialId)
      expect(credential.name).toBe(config.name)
      expect(credential.validFrom).toBe(config.validFrom)
      expect(credential.validUntil).toBe(config.validUntil)

      // Verify issuer structure
      expect(credential.issuer.id).toBe(config.issuer.id)
      expect(credential.issuer.name).toBe(config.issuer.name)
      expect(credential.issuer.url).toBe(config.issuer.url)

      // Verify credentialSubject structure
      expect(credential.credentialSubject.id).toBe(config.subject.id)
      expect(credential.credentialSubject.type).toEqual(config.subject.type)

      // Verify achievement structure with creator
      const achievement = credential.credentialSubject.achievement
      expect(achievement.id).toBe(config.achievement.id)
      expect(achievement.name).toBe(config.achievement.name)
      expect(achievement.description).toBe(config.achievement.description)
      expect(achievement.criteria.narrative).toBe(
        config.achievement.criteria.narrative,
      )

      // CRITICAL: Achievement uses creator (not issuer)
      expect(achievement).toHaveProperty('creator')
      expect(achievement).not.toHaveProperty('issuer')
      expect(achievement.creator.id).toBe(config.issuer.id)
    })

    it('should create credential that validates against official schema', () => {
      const config: CredentialConfig = {
        credentialId: 'https://example.com/credentials/456',
        name: 'Test Badge',
        issuer: {
          id: 'https://example.com/issuer',
          name: 'Test Issuer',
          url: 'https://example.com',
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

      const credential = createCredential(config)
      const result = validateCredential(credential)

      if (!result.valid) {
        console.error(
          'Validation errors:',
          JSON.stringify(result.errors, null, 2),
        )
      }

      expect(result.valid).toBe(true)
    })
  })

  describe('JWT Round-Trip - Sign and Verify', () => {
    it('should create, sign, and verify a credential as JWT', async () => {
      const config: CredentialConfig = {
        credentialId: 'https://cloudnativebergen.no/credentials/jwt-test',
        name: 'JWT Test Badge',
        issuer: {
          id: 'https://cloudnativebergen.no/issuer',
          name: 'Cloud Native Bergen',
          url: 'https://cloudnativebergen.no',
        },
        subject: {
          id: 'did:example:jwt-test',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://cloudnativebergen.no/achievements/jwt-test',
          name: 'JWT Test Achievement',
          description: 'Testing JWT signing',
          criteria: {
            narrative: 'Complete JWT test',
          },
          image: {
            id: 'https://cloudnativebergen.no/badges/jwt-test.png',
            type: 'Image',
          },
        },
        validFrom: '2025-01-01T00:00:00Z',
        validUntil: '2025-12-31T23:59:59Z',
      }

      // Create credential
      const credential = createCredential(config)

      // Sign as JWT
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      // Verify JWT structure (3 parts separated by periods)
      const parts = jwt.split('.')
      expect(parts).toHaveLength(3)

      // Decode and verify payload
      const [headerB64, payloadB64] = parts
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf8'),
      )
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // Verify JOSE header
      expect(header).toHaveProperty('alg')
      expect(header).toHaveProperty('typ', 'JWT')
      expect(header).toHaveProperty('kid', mockSigningConfig.verificationMethod)

      // Verify JWT payload has credential at top level (not in vc wrapper)
      expect(payload).not.toHaveProperty('vc')
      expect(payload).toHaveProperty('@context')
      expect(payload).toHaveProperty('credentialSubject')

      // Verify JWT claims per OpenBadges 3.0 spec section 8.2.4.1
      expect(payload.iss).toBe(credential.issuer.id)
      expect(payload.jti).toBe(credential.id)
      expect(payload.sub).toBe(credential.credentialSubject.id)
      expect(payload.nbf).toBeDefined()

      // nbf should match validFrom
      const expectedNbf = Math.floor(
        new Date(credential.validFrom).getTime() / 1000,
      )
      expect(payload.nbf).toBe(expectedNbf)

      // exp should match validUntil
      if (credential.validUntil) {
        const expectedExp = Math.floor(
          new Date(credential.validUntil).getTime() / 1000,
        )
        expect(payload.exp).toBe(expectedExp)
      }

      // Verify signature
      const verified = await verifyCredentialJWT(
        jwt,
        mockSigningConfig.publicKey,
      )
      expect(verified).toBeDefined()
      expect(verified.id).toBe(credential.id)
    })

    it('should create JWT payload matching golden data structure', async () => {
      const config: CredentialConfig = {
        credentialId: 'https://example.com/credentials/golden-equivalent',
        name: 'Equivalent to Golden Data',
        issuer: {
          id: 'https://example.com/issuer',
          name: 'Example Issuer',
          url: 'https://example.com',
          email: 'contact@example.com',
        },
        subject: {
          id: 'did:example:subject123',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://example.com/achievements/test',
          name: 'Test Achievement',
          description: 'An achievement for testing',
          criteria: {
            id: 'https://example.com/achievements/test',
            narrative: '# Achievement Requirements\nComplete all tests...',
          },
          image: {
            id: 'https://example.com/achievements/test/image',
            type: 'Image',
          },
        },
        validFrom: '2025-01-01T00:00:00Z',
        validUntil: '2025-12-31T23:59:59Z',
      }

      const credential = createCredential(config)
      const jwt = await signCredentialJWT(credential, mockSigningConfig)

      const [, payloadB64] = jwt.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      )

      // Compare structure with golden data
      expect(payload).toHaveProperty('@context')
      expect(payload).toHaveProperty('id')
      expect(payload).toHaveProperty('type')
      expect(payload).toHaveProperty('name')
      expect(payload).toHaveProperty('credentialSubject')
      expect(payload).toHaveProperty('issuer')
      expect(payload).toHaveProperty('validFrom')
      expect(payload).toHaveProperty('validUntil')

      // JWT claims
      expect(payload).toHaveProperty('iss')
      expect(payload).toHaveProperty('jti')
      expect(payload).toHaveProperty('sub')
      expect(payload).toHaveProperty('nbf')
      expect(payload).toHaveProperty('exp')

      // No iat claim (not in spec)
      expect(payload).not.toHaveProperty('iat')

      // Achievement has creator
      expect(payload.credentialSubject.achievement).toHaveProperty('creator')
      expect(payload.credentialSubject.achievement).not.toHaveProperty('issuer')
    })
  })

  describe('Validate Against Official Schema', () => {
    it('should validate our created credential matches schema requirements', () => {
      const config: CredentialConfig = {
        credentialId: 'https://cloudnativebergen.no/credentials/schema-test',
        name: 'Schema Validation Test',
        issuer: {
          id: 'https://cloudnativebergen.no/issuer',
          name: 'Cloud Native Bergen',
          url: 'https://cloudnativebergen.no',
        },
        subject: {
          id: 'did:example:schema-test',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://cloudnativebergen.no/achievements/schema-test',
          name: 'Schema Test Achievement',
          description: 'Testing schema validation',
          criteria: {
            narrative: 'Pass schema validation',
          },
          image: {
            id: 'https://cloudnativebergen.no/badges/schema-test.png',
            type: 'Image',
          },
        },
        validFrom: '2025-01-01T00:00:00Z',
      }

      const credential = createCredential(config)

      // Validate against official OpenBadges 3.0 schema
      const result = validateCredential(credential)

      if (!result.valid) {
        console.error('Schema validation failed:')
        result.errors?.forEach((error) => {
          console.error(`  - ${error.field}: ${error.message}`)
        })
      }

      expect(result.valid).toBe(true)
    })
  })

  describe('Golden Data JWT Claims Comparison', () => {
    it('should compute same JWT claims as golden data', () => {
      // Golden data values
      const goldenValidFrom = '2010-01-01T00:00:00Z'
      const goldenValidUntil = '2030-01-01T00:00:00Z'
      const goldenIss = 'https://1edtech.edu/issuers/565049'
      const goldenJti = 'http://1edtech.edu/credentials/3732'
      const goldenSub = 'did:example:ebfeb1f712ebc6f1c276e12ec21'

      // Verify golden data claims
      expect(goldenPayload.iss).toBe(goldenIss)
      expect(goldenPayload.jti).toBe(goldenJti)
      expect(goldenPayload.sub).toBe(goldenSub)
      expect(goldenPayload.validFrom).toBe(goldenValidFrom)
      expect(goldenPayload.validUntil).toBe(goldenValidUntil)

      // Compute what our implementation would generate
      const expectedNbf = Math.floor(new Date(goldenValidFrom).getTime() / 1000)
      const expectedExp = Math.floor(
        new Date(goldenValidUntil).getTime() / 1000,
      )

      expect(expectedNbf).toBe(1262304000) // 2010-01-01
      expect(expectedExp).toBe(1893456000) // 2030-01-01

      // Our implementation should produce the same nbf/exp values
      const config: CredentialConfig = {
        credentialId: goldenJti,
        issuer: {
          id: goldenIss,
          name: 'Test',
          url: 'https://test.com',
        },
        subject: {
          id: goldenSub,
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://test.com/achievement',
          name: 'Test',
          description: 'Test',
          criteria: { narrative: 'Test' },
          image: { id: 'https://test.com/image', type: 'Image' },
        },
        validFrom: goldenValidFrom,
        validUntil: goldenValidUntil,
      }

      const credential = createCredential(config)

      // Verify our credential matches golden data structure
      expect(credential.id).toBe(goldenJti)
      expect(credential.issuer.id).toBe(goldenIss)
      expect(credential.credentialSubject.id).toBe(goldenSub)
      expect(credential.validFrom).toBe(goldenValidFrom)
      expect(credential.validUntil).toBe(goldenValidUntil)
    })
  })
})
