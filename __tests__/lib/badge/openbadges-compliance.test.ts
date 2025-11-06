/**
 * OpenBadges 3.0 Compliance Tests
 *
 * Validates that our badge implementation follows the OpenBadges 3.0 specification
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/
 */

import { describe, it, expect } from '@jest/globals'
import {
  generateBadgeCredential,
  validateBadgeAssertion,
} from '@/lib/badge/generator'
import {
  bakeBadge,
  extractBadgeFromSVG,
  validateBakedSVG,
} from '@/lib/badge/baking'
import {
  signBadgeData,
  verifyBadgeSignature,
  getVerificationMethod,
} from '@/lib/badge/crypto'
import type { Conference } from '@/lib/conference/types'

// Mock conference for testing
const mockConference = {
  _id: 'test-conference-id',
  title: 'Cloud Native Day Bergen 2025',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  start_date: '2025-06-01',
  end_date: '2025-06-01',
  contact_email: 'contact@cloudnativebergen.no',
  domains: ['cloudnativebergen.no'],
} as Conference

describe('OpenBadges 3.0 Compliance', () => {
  describe('Badge Credential Generation', () => {
    it('should generate a valid OpenBadges 3.0 credential', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      // Validate context
      expect(assertion['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(assertion['@context']).toContain(
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      )

      // Validate types
      expect(assertion.type).toContain('VerifiableCredential')
      expect(assertion.type).toContain('AchievementCredential')

      // Validate required fields
      expect(assertion.id).toBeDefined()
      expect(assertion.name).toBeDefined()
      expect(assertion.validFrom).toBeDefined()
      expect(assertion.credentialSubject).toBeDefined()
      expect(assertion.issuer).toBeDefined()

      // Validate credential subject
      expect(assertion.credentialSubject.type).toBe('AchievementSubject')
      expect(assertion.credentialSubject.id).toBe('mailto:jane@example.com')
      expect(assertion.credentialSubject.achievement).toBeDefined()

      // Validate achievement
      const achievement = assertion.credentialSubject.achievement
      expect(achievement.type).toContain('Achievement')
      expect(achievement.name).toBeDefined()
      expect(achievement.description).toBeDefined()
      expect(achievement.criteria).toBeDefined()
      expect(achievement.image).toBeDefined()
      expect(achievement.image.type).toBe('Image')

      // Validate issuer
      expect(assertion.issuer.type).toBe('Profile')
      expect(assertion.issuer.name).toBe('Cloud Native Bergen')
      expect(assertion.issuer.id).toBe('https://cloudnativebergen.no')

      // Validate proof
      expect(assertion.proof).toBeDefined()
      expect(assertion.proof?.type).toBe('DataIntegrityProof')
      expect(assertion.proof?.cryptosuite).toBe('eddsa-rdfc-2022')
      expect(assertion.proof?.proofPurpose).toBe('assertionMethod')
      expect(assertion.proof?.proofValue).toBeDefined()
      expect(assertion.proof?.verificationMethod).toBeDefined()
    })

    it('should use conference contact email in issuer', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion.credentialSubject.achievement.issuer.email).toBe(
        'contact@cloudnativebergen.no',
      )
    })

    it('should validate badge assertion structure', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(validateBadgeAssertion(assertion)).toBe(true)
    })
  })

  describe('Cryptographic Signatures', () => {
    it('should sign and verify badge data correctly', async () => {
      const testData = { test: 'data', timestamp: new Date().toISOString() }

      const signature = await signBadgeData(testData)
      expect(signature).toBeDefined()
      expect(typeof signature).toBe('string')

      const isValid = await verifyBadgeSignature(testData, signature)
      expect(isValid).toBe(true)
    })

    it('should fail verification with tampered data', async () => {
      const originalData = { test: 'data', timestamp: new Date().toISOString() }
      const signature = await signBadgeData(originalData)

      const tamperedData = {
        test: 'tampered',
        timestamp: new Date().toISOString(),
      }
      const isValid = await verifyBadgeSignature(tamperedData, signature)

      expect(isValid).toBe(false)
    })

    it('should generate proper verification method', () => {
      const verificationMethod = getVerificationMethod(['cloudnativebergen.no'])
      expect(verificationMethod).toMatch(/^https?:\/\/.+#key-[0-9a-f]+$/)
    })

    it('should verify badge assertion signature', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion.proof).toBeDefined()

      // Verify the assertion
      const { proof, ...assertionWithoutProof } = assertion
      const isValid = await verifyBadgeSignature(
        assertionWithoutProof,
        proof!.proofValue,
      )

      expect(isValid).toBe(true)
    })
  })

  describe('Badge Baking', () => {
    it('should bake badge assertion into SVG using OpenBadges 3.0 format', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
  <text x="460" y="460" text-anchor="middle">SPEAKER</text>
</svg>`

      const verificationUrl =
        'https://cloudnativebergen.no/api/badge/test-123/verify'
      const bakedSvg = bakeBadge(svgContent, assertion, verificationUrl)

      // Validate baked SVG uses OB 3.0 format with openbadges:credential
      expect(bakedSvg).toContain('xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"')
      expect(bakedSvg).toContain('<openbadges:credential>')
      expect(bakedSvg).toContain('</openbadges:credential>')
      expect(bakedSvg).toContain('<![CDATA[')
      expect(bakedSvg).toContain(']]>')
      expect(bakedSvg).toContain('"@context"')
      expect(bakedSvg).toContain('"VerifiableCredential"')
      expect(bakedSvg).toContain('"AchievementCredential"')

      // Should NOT contain old OB 2.0 format
      expect(bakedSvg).not.toContain('<openbadges:assertion')
      expect(bakedSvg).not.toContain('verify="')

      // Validate the baked SVG structure
      const validation = validateBakedSVG(bakedSvg)
      expect(validation.isValid).toBe(true)
    })

    it('should extract badge assertion from OB 3.0 baked SVG', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
</svg>`

      const verificationUrl =
        'https://cloudnativebergen.no/api/badge/test-123/verify'
      const bakedSvg = bakeBadge(svgContent, assertion, verificationUrl)

      // Extract the assertion
      const extracted = extractBadgeFromSVG(bakedSvg)

      expect(extracted.assertion).toBeDefined()
      expect(extracted.verificationUrl).toBeDefined()
      expect(extracted.assertion?.id).toBe(assertion.id)
      expect(extracted.assertion?.type).toEqual(assertion.type)
      expect(extracted.assertion?.credentialSubject).toEqual(
        assertion.credentialSubject,
      )
    })

    it('should extract badge assertion from legacy OB 2.0 baked SVG', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      // Manually create OB 2.0 format baked SVG
      const legacyBakedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns:openbadges="http://openbadges.org" viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <openbadges:assertion verify="https://cloudnativebergen.no/api/badge/test-123/verify">
    <![CDATA[${JSON.stringify(assertion, null, 2)}]]>
  </openbadges:assertion>
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
</svg>`

      // Extract the assertion from legacy format
      const extracted = extractBadgeFromSVG(legacyBakedSvg)

      expect(extracted.assertion).toBeDefined()
      expect(extracted.verificationUrl).toBe(
        'https://cloudnativebergen.no/api/badge/test-123/verify',
      )
      expect(extracted.assertion?.id).toBe(assertion.id)
      expect(extracted.assertion?.type).toEqual(assertion.type)
    })

    it('should validate both OB 3.0 and OB 2.0 baked SVG formats', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
</svg>`

      // Test OB 3.0 format
      const ob3BakedSvg = bakeBadge(
        svgContent,
        assertion,
        'https://cloudnativebergen.no/api/badge/test-123/verify',
      )
      const ob3Validation = validateBakedSVG(ob3BakedSvg)
      expect(ob3Validation.isValid).toBe(true)

      // Test OB 2.0 format (legacy)
      const legacyBakedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns:openbadges="http://openbadges.org" viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <openbadges:assertion verify="https://cloudnativebergen.no/api/badge/test-123/verify">
    <![CDATA[${JSON.stringify(assertion, null, 2)}]]>
  </openbadges:assertion>
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
</svg>`
      const legacyValidation = validateBakedSVG(legacyBakedSvg)
      expect(legacyValidation.isValid).toBe(true)
    })

    it('should handle SVG without badge data', () => {
      const plainSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 920 920" xmlns="http://www.w3.org/2000/svg">
  <circle cx="460" cy="460" r="460" fill="#06B6D4"/>
</svg>`

      const extracted = extractBadgeFromSVG(plainSvg)
      expect(extracted.assertion).toBeNull()
      expect(extracted.verificationUrl).toBeNull()

      const validation = validateBakedSVG(plainSvg)
      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('Missing badge credential data')
    })
  })

  describe('OpenBadges 3.0 Specific Requirements', () => {
    it('should use W3C Verifiable Credentials v2 context', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
    })

    it('should use AchievementCredential type instead of OpenBadgeCredential', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion.type).toContain('AchievementCredential')
      expect(assertion.type).not.toContain('OpenBadgeCredential')
    })

    it('should use validFrom instead of issuanceDate', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion.validFrom).toBeDefined()
      expect('issuanceDate' in assertion).toBe(false)
    })

    it('should use DataIntegrityProof with eddsa-rdfc-2022 cryptosuite', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      expect(assertion.proof?.type).toBe('DataIntegrityProof')
      expect(assertion.proof?.cryptosuite).toBe('eddsa-rdfc-2022')
    })

    it('should structure achievement with proper image object', async () => {
      const { assertion } = await generateBadgeCredential(
        {
          speakerId: 'speaker-123',
          speakerName: 'Jane Doe',
          speakerEmail: 'jane@example.com',
          conferenceId: 'conf-123',
          conferenceTitle: 'Cloud Native Day Bergen 2025',
          conferenceYear: '2025',
          conferenceDate: 'June 1, 2025',
          badgeType: 'speaker',
          issuerUrl: 'https://cloudnativebergen.no',
        },
        mockConference,
      )

      const achievement = assertion.credentialSubject.achievement
      expect(achievement.image).toBeDefined()
      expect(typeof achievement.image).toBe('object')
      expect(achievement.image.id).toBeDefined()
      expect(achievement.image.type).toBe('Image')
    })
  })
})
