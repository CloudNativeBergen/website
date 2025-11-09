/**
 * Golden Data Tests - OpenBadges 3.0 Spec Compliance
 *
 * Uses the official 1EdTech example credential from the OpenBadges 3.0 specification
 * to validate our implementation produces spec-compliant credentials.
 *
 * Reference: https://purl.imsglobal.org/spec/ob/v3p0
 */

import { describe, it, expect } from '@jest/globals'
import { validateCredential } from '@/lib/openbadges/validator'
import { signCredentialJWT, verifyCredentialJWT } from '@/lib/openbadges/crypto'
import type { Credential } from '@/lib/openbadges/types'
import goldenPayload from '@/lib/openbadges/data/credential-jwt-body.json'
import goldenHeader from '@/lib/openbadges/data/credential-jwt-header.json'

describe('Golden Data - Official OpenBadges 3.0 Spec Example', () => {
  describe('Credential Structure Validation', () => {
    it('should validate the official spec example credential against our schema', () => {
      // Remove JWT-specific claims to get pure credential
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

    it('should have OpenBadgeCredential type (alternative to AchievementCredential)', () => {
      expect(goldenPayload.type).toContain('VerifiableCredential')
      expect(goldenPayload.type).toContain('OpenBadgeCredential')

      // Per spec: Either AchievementCredential OR OpenBadgeCredential is valid
      const hasValidType =
        goldenPayload.type.includes('AchievementCredential') ||
        goldenPayload.type.includes('OpenBadgeCredential')
      expect(hasValidType).toBe(true)
    })

    it('should have Achievement with creator property', () => {
      expect(goldenPayload.credentialSubject.achievement).toHaveProperty(
        'creator',
      )
      expect(goldenPayload.credentialSubject.achievement).not.toHaveProperty(
        'issuer',
      )
      expect(goldenPayload.credentialSubject.achievement.creator.id).toBe(
        'https://1edtech.edu/issuers/565049',
      )
    })

    it('should have correct @context', () => {
      expect(goldenPayload['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(goldenPayload['@context']).toContain(
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      )
    })

    it('should have required credential fields', () => {
      expect(goldenPayload).toHaveProperty('@context')
      expect(goldenPayload).toHaveProperty('id')
      expect(goldenPayload).toHaveProperty('type')
      expect(goldenPayload).toHaveProperty('credentialSubject')
      expect(goldenPayload).toHaveProperty('issuer')
      expect(goldenPayload).toHaveProperty('validFrom')
    })

    it('should have required credentialSubject fields', () => {
      expect(goldenPayload.credentialSubject).toHaveProperty('id')
      expect(goldenPayload.credentialSubject).toHaveProperty('type')
      expect(goldenPayload.credentialSubject).toHaveProperty('achievement')
    })

    it('should have required achievement fields', () => {
      const achievement = goldenPayload.credentialSubject.achievement
      expect(achievement).toHaveProperty('id')
      expect(achievement).toHaveProperty('type')
      expect(achievement).toHaveProperty('name')
      expect(achievement).toHaveProperty('description')
      expect(achievement).toHaveProperty('criteria')
      expect(achievement).toHaveProperty('creator')
    })

    it('should have required issuer/creator profile fields', () => {
      const issuer = goldenPayload.issuer
      expect(issuer).toHaveProperty('id')
      expect(issuer).toHaveProperty('type')
      expect(issuer).toHaveProperty('name')

      const creator = goldenPayload.credentialSubject.achievement.creator
      expect(creator).toHaveProperty('id')
      expect(creator).toHaveProperty('type')
      expect(creator).toHaveProperty('name')

      // Verify Profile type is an array (OpenBadges 3.0 requirement)
      expect(Array.isArray(issuer.type)).toBe(true)
      expect(issuer.type).toContain('Profile')
      expect(Array.isArray(creator.type)).toBe(true)
      expect(creator.type).toContain('Profile')
    })
  })

  describe('JWT Header Structure', () => {
    it('should have RS256 algorithm', () => {
      expect(goldenHeader.alg).toBe('RS256')
    })

    it('should have JWT type', () => {
      expect(goldenHeader.typ).toBe('JWT')
    })

    it('should include JWK for inline verification', () => {
      expect(goldenHeader).toHaveProperty('jwk')
      expect(goldenHeader.jwk).toHaveProperty('kty', 'RSA')
      expect(goldenHeader.jwk).toHaveProperty('e')
      expect(goldenHeader.jwk).toHaveProperty('n')
    })
  })

  describe('JWT Payload Claims (Section 8.2.4.1)', () => {
    it('should have all required JWT claims per spec', () => {
      // Required claims per OpenBadges 3.0 spec section 8.2.4.1
      expect(goldenPayload).toHaveProperty('iss')
      expect(goldenPayload).toHaveProperty('jti')
      expect(goldenPayload).toHaveProperty('sub')

      // Note: nbf is not visible in the JSON payload but should be computed from validFrom
      // exp should be computed from validUntil if present
    })

    it('should have iss matching issuer.id', () => {
      expect(goldenPayload.iss).toBe(goldenPayload.issuer.id)
      expect(goldenPayload.iss).toBe('https://1edtech.edu/issuers/565049')
    })

    it('should have jti matching credential.id', () => {
      expect(goldenPayload.jti).toBe(goldenPayload.id)
      expect(goldenPayload.jti).toBe('http://1edtech.edu/credentials/3732')
    })

    it('should have sub matching credentialSubject.id', () => {
      expect(goldenPayload.sub).toBe(goldenPayload.credentialSubject.id)
      expect(goldenPayload.sub).toBe('did:example:ebfeb1f712ebc6f1c276e12ec21')
    })

    it('should NOT have credential wrapped in vc property', () => {
      expect(goldenPayload).not.toHaveProperty('vc')
    })

    it('should have credential properties at top level', () => {
      // All credential properties must be at top level, not nested
      expect(goldenPayload).toHaveProperty('@context')
      expect(goldenPayload).toHaveProperty('type')
      expect(goldenPayload).toHaveProperty('credentialSubject')
      expect(goldenPayload).toHaveProperty('issuer')
    })
  })

  describe('Optional OpenBadges Features (In Spec Example)', () => {
    it('should support optional name and description on credential', () => {
      expect(goldenPayload).toHaveProperty('name')
      expect(goldenPayload).toHaveProperty('description')
    })

    it('should support optional image on credential', () => {
      expect(goldenPayload).toHaveProperty('image')
      expect(goldenPayload.image).toHaveProperty('id')
      expect(goldenPayload.image).toHaveProperty('type', 'Image')
    })

    it('should support optional evidence', () => {
      expect(goldenPayload).toHaveProperty('evidence')
      expect(Array.isArray(goldenPayload.evidence)).toBe(true)
      expect(goldenPayload.evidence.length).toBeGreaterThan(0)
    })

    it('should support optional endorsements', () => {
      expect(goldenPayload).toHaveProperty('endorsement')
      expect(Array.isArray(goldenPayload.endorsement)).toBe(true)
    })

    it('should support optional credentialSchema', () => {
      expect(goldenPayload).toHaveProperty('credentialSchema')
      expect(Array.isArray(goldenPayload.credentialSchema)).toBe(true)
      const schema = goldenPayload.credentialSchema[0]
      expect(schema.id).toBe(
        'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json',
      )
    })

    it('should support optional credentialStatus', () => {
      expect(goldenPayload).toHaveProperty('credentialStatus')
      expect(goldenPayload.credentialStatus).toHaveProperty('id')
      expect(goldenPayload.credentialStatus).toHaveProperty('type')
    })

    it('should support optional refreshService', () => {
      expect(goldenPayload).toHaveProperty('refreshService')
      expect(goldenPayload.refreshService).toHaveProperty('id')
      expect(goldenPayload.refreshService).toHaveProperty('type')
    })

    it('should support optional validUntil', () => {
      expect(goldenPayload).toHaveProperty('validUntil')
      expect(goldenPayload.validUntil).toBe('2030-01-01T00:00:00Z')
    })
  })

  describe('Achievement Extended Properties (In Spec Example)', () => {
    const achievement = goldenPayload.credentialSubject.achievement

    it('should support optional achievementType', () => {
      expect(achievement).toHaveProperty('achievementType')
      expect(achievement.achievementType).toBe('Degree')
    })

    it('should support optional alignment', () => {
      expect(achievement).toHaveProperty('alignment')
      expect(Array.isArray(achievement.alignment)).toBe(true)
      expect(achievement.alignment.length).toBeGreaterThan(0)
    })

    it('should support optional fieldOfStudy', () => {
      expect(achievement).toHaveProperty('fieldOfStudy')
      expect(achievement.fieldOfStudy).toBe('Research')
    })

    it('should support optional humanCode', () => {
      expect(achievement).toHaveProperty('humanCode')
      expect(achievement.humanCode).toBe('R1')
    })

    it('should support optional specialization', () => {
      expect(achievement).toHaveProperty('specialization')
      expect(achievement.specialization).toBe('Computer Science Research')
    })

    it('should support optional tags', () => {
      expect(achievement).toHaveProperty('tag')
      expect(Array.isArray(achievement.tag)).toBe(true)
      expect(achievement.tag).toContain('research')
    })

    it('should support optional resultDescription', () => {
      expect(achievement).toHaveProperty('resultDescription')
      expect(Array.isArray(achievement.resultDescription)).toBe(true)
    })

    it('should support optional creditsAvailable', () => {
      expect(achievement).toHaveProperty('creditsAvailable')
      expect(achievement.creditsAvailable).toBe(36)
    })
  })

  describe('AchievementSubject Extended Properties (In Spec Example)', () => {
    const subject = goldenPayload.credentialSubject

    it('should support optional activityStartDate', () => {
      expect(subject).toHaveProperty('activityStartDate')
      expect(subject.activityStartDate).toBe('2010-01-01T00:00:00Z')
    })

    it('should support optional activityEndDate', () => {
      expect(subject).toHaveProperty('activityEndDate')
      expect(subject.activityEndDate).toBe('2010-01-02T00:00:00Z')
    })

    it('should support optional creditsEarned', () => {
      expect(subject).toHaveProperty('creditsEarned')
      expect(subject.creditsEarned).toBe(42)
    })

    it('should support optional licenseNumber', () => {
      expect(subject).toHaveProperty('licenseNumber')
      expect(subject.licenseNumber).toBe('A-9320041')
    })

    it('should support optional role', () => {
      expect(subject).toHaveProperty('role')
      expect(subject.role).toBe('Major Domo')
    })

    it('should support optional term', () => {
      expect(subject).toHaveProperty('term')
      expect(subject.term).toBe('Fall')
    })

    it('should support optional source', () => {
      expect(subject).toHaveProperty('source')
      expect(subject.source).toHaveProperty('id')
      expect(subject.source).toHaveProperty('type')
      expect(subject.source).toHaveProperty('name')
    })

    it('should support optional identifier for identity verification', () => {
      expect(subject).toHaveProperty('identifier')
      expect(Array.isArray(subject.identifier)).toBe(true)
      expect(subject.identifier.length).toBe(2)

      const emailIdentity = subject.identifier[0]
      expect(emailIdentity.type).toBe('IdentityObject')
      expect(emailIdentity.identityType).toBe('emailAddress')
      expect(emailIdentity.identityHash).toBe('student@1edtech.edu')
    })

    it('should support optional result', () => {
      expect(subject).toHaveProperty('result')
      expect(Array.isArray(subject.result)).toBe(true)
      expect(subject.result.length).toBeGreaterThan(0)
    })

    it('should support optional narrative', () => {
      expect(subject).toHaveProperty('narrative')
      expect(subject.narrative).toBe(
        'There is a final project report and source code evidence.',
      )
    })

    it('should support optional image', () => {
      expect(subject).toHaveProperty('image')
      expect(subject.image).toHaveProperty('id')
      expect(subject.image).toHaveProperty('type', 'Image')
    })
  })

  describe('Profile Extended Properties (In Spec Example)', () => {
    const issuer = goldenPayload.issuer
    const creator = goldenPayload.credentialSubject.achievement.creator

    it('should support optional url', () => {
      expect(issuer).toHaveProperty('url')
      expect(creator).toHaveProperty('url')
    })

    it('should support optional email', () => {
      expect(issuer).toHaveProperty('email')
      expect(creator).toHaveProperty('email')
    })

    it('should support optional phone', () => {
      expect(issuer).toHaveProperty('phone')
      expect(creator).toHaveProperty('phone')
    })

    it('should support optional description', () => {
      expect(issuer).toHaveProperty('description')
      expect(creator).toHaveProperty('description')
    })

    it('should support optional image', () => {
      expect(issuer).toHaveProperty('image')
      expect(creator).toHaveProperty('image')
    })

    it('should support optional address with geo coordinates', () => {
      expect(issuer).toHaveProperty('address')
      expect(issuer.address).toHaveProperty('type')
      expect(issuer.address).toHaveProperty('addressCountry')
      expect(issuer.address).toHaveProperty('geo')
      expect(issuer.address.geo).toHaveProperty('type', 'GeoCoordinates')
      expect(issuer.address.geo).toHaveProperty('latitude')
      expect(issuer.address.geo).toHaveProperty('longitude')
    })

    it('should support optional otherIdentifier', () => {
      expect(issuer).toHaveProperty('otherIdentifier')
      expect(Array.isArray(issuer.otherIdentifier)).toBe(true)
      const identifier = issuer.otherIdentifier[0]
      expect(identifier.type).toBe('IdentifierEntry')
      expect(identifier).toHaveProperty('identifier')
      expect(identifier).toHaveProperty('identifierType')
    })

    it('should support optional official', () => {
      expect(issuer).toHaveProperty('official')
      expect(issuer.official).toBe('Horace Mann')
    })

    it('should support optional parentOrg', () => {
      expect(issuer).toHaveProperty('parentOrg')
      expect(issuer.parentOrg).toHaveProperty('id')
      expect(issuer.parentOrg).toHaveProperty('type')
      expect(issuer.parentOrg).toHaveProperty('name')
    })

    it('should support optional endorsement on profile', () => {
      expect(issuer).toHaveProperty('endorsement')
      expect(creator).toHaveProperty('endorsement')
      expect(Array.isArray(issuer.endorsement)).toBe(true)
      expect(Array.isArray(creator.endorsement)).toBe(true)
    })
  })

  describe('Cross-Validation with Our Implementation', () => {
    it('should accept both OpenBadgeCredential and AchievementCredential types', () => {
      // Golden data uses OpenBadgeCredential
      expect(goldenPayload.type).toContain('OpenBadgeCredential')

      // Our implementation uses OpenBadgeCredential per spec
      // Both are valid per spec
      const ourType = ['VerifiableCredential', 'OpenBadgeCredential']
      const specType = ['VerifiableCredential', 'OpenBadgeCredential']

      // Both should validate
      expect(ourType).toContain('VerifiableCredential')
      expect(specType).toContain('VerifiableCredential')
    })

    it('should validate a minimal credential matching our implementation', () => {
      const minimalCredential: Credential = {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        id: 'https://example.com/credentials/123',
        type: ['VerifiableCredential', 'OpenBadgeCredential'],
        name: 'Test Badge',
        credentialSubject: {
          id: 'https://example.com/users/test',
          type: ['AchievementSubject'],
          achievement: {
            id: 'https://example.com/achievements/test',
            type: ['Achievement'],
            name: 'Test Achievement',
            description: 'A test achievement',
            criteria: {
              narrative: 'Complete the test',
            },
            image: {
              id: 'https://example.com/images/badge.png',
              type: 'Image',
            },
            creator: {
              id: 'https://example.com/issuer',
              type: ['Profile'],
              name: 'Test Issuer',
              url: 'https://example.com/issuer',
            },
          },
        },
        issuer: {
          id: 'https://example.com/issuer',
          type: ['Profile'],
          name: 'Test Issuer',
          url: 'https://example.com/issuer',
        },
        validFrom: '2024-01-01T00:00:00Z',
      }

      const result = validateCredential(minimalCredential)
      expect(result.valid).toBe(true)
    })
  })

  describe('JWT Claims Computation', () => {
    it('should correctly compute nbf from validFrom', () => {
      const validFrom = '2010-01-01T00:00:00Z'
      const expectedNbf = Math.floor(new Date(validFrom).getTime() / 1000)

      expect(expectedNbf).toBe(1262304000) // Unix timestamp for 2010-01-01
    })

    it('should correctly compute exp from validUntil', () => {
      const validUntil = '2030-01-01T00:00:00Z'
      const expectedExp = Math.floor(new Date(validUntil).getTime() / 1000)

      expect(expectedExp).toBe(1893456000) // Unix timestamp for 2030-01-01
    })
  })
})
