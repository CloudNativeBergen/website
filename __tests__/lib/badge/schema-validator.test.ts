/**
 * OpenBadges 3.0 Schema Validation Tests
 */

import { describe, it, expect } from '@jest/globals'
import { generateBadgeCredential } from '@/lib/badge/generator'
import {
  validateBadgeSchema,
  assertValidBadge,
  getValidationErrors,
} from '@/lib/badge/schema-validator'
import type { Conference } from '@/lib/conference/types'
import type { BadgeAssertion } from '@/lib/badge/types'

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

describe('OpenBadges 3.0 Schema Validation', () => {
  describe('validateBadgeSchema', () => {
    it('should validate a correct badge', async () => {
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

      const result = validateBadgeSchema(assertion)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should detect missing @context', () => {
      const invalidBadge = {
        type: ['VerifiableCredential', 'AchievementCredential'],
        credentialSubject: { type: ['AchievementSubject'] },
        issuer: { id: 'https://example.com', type: ['Profile'], name: 'Test' },
        validFrom: '2025-01-01T00:00:00Z',
      } as unknown as BadgeAssertion

      const result = validateBadgeSchema(invalidBadge)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(
        result.errors?.some(
          (e) => e.field === '@context' || e.message.includes('@context'),
        ),
      ).toBe(true)
    })

    it('should detect wrong type format (string instead of array)', () => {
      const invalidBadge = {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        type: 'VerifiableCredential', // Should be array
        credentialSubject: {
          type: 'AchievementSubject', // Should be array
          achievement: {
            id: 'https://example.com/achievement',
            type: ['Achievement'],
            name: 'Test',
            criteria: { narrative: 'Test' },
          },
        },
        issuer: { id: 'https://example.com', type: ['Profile'], name: 'Test' },
        validFrom: '2025-01-01T00:00:00Z',
      } as unknown as BadgeAssertion

      const result = validateBadgeSchema(invalidBadge)
      expect(result.valid).toBe(false)
      expect(result.errors?.some((e) => e.message.includes('array'))).toBe(true)
    })

    it('should detect missing required fields', () => {
      const invalidBadge = {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        type: ['VerifiableCredential', 'AchievementCredential'],
        // Missing credentialSubject
        issuer: { id: 'https://example.com', type: ['Profile'], name: 'Test' },
        validFrom: '2025-01-01T00:00:00Z',
      } as unknown as BadgeAssertion

      const result = validateBadgeSchema(invalidBadge)
      expect(result.valid).toBe(false)
      expect(
        result.errors?.some((e) => e.message.includes('credentialSubject')),
      ).toBe(true)
    })

    it('should validate issuer.image as object', async () => {
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

      // Should have image as object
      expect(assertion.issuer.image).toBeDefined()
      expect(typeof assertion.issuer.image).toBe('object')
      expect(assertion.issuer.image?.type).toBe('Image')

      const result = validateBadgeSchema(assertion)
      expect(result.valid).toBe(true)
    })

    it('should validate proof as array', async () => {
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

      // Should have proof as array
      expect(Array.isArray(assertion.proof)).toBe(true)
      expect(assertion.proof?.length).toBeGreaterThan(0)

      const result = validateBadgeSchema(assertion)
      expect(result.valid).toBe(true)
    })
  })

  describe('assertValidBadge', () => {
    it('should not throw for valid badge', async () => {
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

      expect(() => assertValidBadge(assertion)).not.toThrow()
    })

    it('should throw for invalid badge', () => {
      const invalidBadge = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential'],
        // Missing required fields
      } as unknown as BadgeAssertion

      expect(() => assertValidBadge(invalidBadge)).toThrow()
    })
  })

  describe('getValidationErrors', () => {
    it('should return empty array for valid badge', async () => {
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

      const errors = getValidationErrors(assertion)
      expect(errors).toEqual([])
    })

    it('should return readable error messages', () => {
      const invalidBadge = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential'],
      } as unknown as BadgeAssertion

      const errors = getValidationErrors(invalidBadge)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.every((e) => typeof e === 'string')).toBe(true)
    })
  })
})
