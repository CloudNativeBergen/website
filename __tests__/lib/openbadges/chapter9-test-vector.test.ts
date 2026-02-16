/**
 * OpenBadges 3.0 Chapter 9 Test Vector Validation
 *
 * Validates our createCredential implementation against the official test data
 * from Chapter 9 of the OpenBadges 3.0 Implementation Guide:
 * https://www.imsglobal.org/spec/ob/v3p0/impl/#ob-linked-data-proof
 */

import { createCredential } from '@/lib/openbadges'
import type { Credential } from '@/lib/openbadges/types'

describe('OpenBadges 3.0 Chapter 9 Test Vector', () => {
  // Official test data from Chapter 9.2
  const officialCredential: Credential = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: 'http://example.com/credentials/3527',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: 'https://example.edu/issuers/565049',
      type: ['Profile'],
      url: 'https://www.imsglobal.org',
      name: 'Example Corp',
    },
    validFrom: '2010-01-01T00:00:00Z',
    name: 'Teamwork Badge',
    credentialSubject: {
      id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
      type: ['AchievementSubject'],
      achievement: {
        id: 'https://example.com/achievements/21st-century-skills/teamwork',
        type: ['Achievement'],
        criteria: {
          narrative:
            'Team members are nominated for this badge by their peers and recognized upon review by Example Corp management.',
        },
        description:
          'This badge recognizes the development of the capacity to collaborate within a group environment.',
        name: 'Teamwork',
        image: {
          id: 'https://example.com/achievements/teamwork/image',
          type: 'Image',
        },
        creator: {
          id: 'https://example.edu/issuers/565049',
          type: ['Profile'],
          name: 'Example Corp',
          url: 'https://www.imsglobal.org',
        },
      },
    },
  }

  describe('Our Implementation vs Official Example', () => {
    it('should generate credentials with same structure as official example', () => {
      const ourCredential = createCredential({
        credentialId: 'http://example.com/credentials/3527',
        name: 'Teamwork Badge',
        subject: {
          id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://example.com/achievements/21st-century-skills/teamwork',
          name: 'Teamwork',
          description:
            'This badge recognizes the development of the capacity to collaborate within a group environment.',
          criteria: {
            narrative:
              'Team members are nominated for this badge by their peers and recognized upon review by Example Corp management.',
          },
          image: {
            id: 'https://example.com/achievements/teamwork/image',
            type: 'Image',
          },
        },
        issuer: {
          id: 'https://example.edu/issuers/565049',
          name: 'Example Corp',
          url: 'https://www.imsglobal.org',
        },
        validFrom: '2010-01-01T00:00:00Z',
      })

      // Verify structure matches
      expect(ourCredential['@context']).toEqual(officialCredential['@context'])
      expect(ourCredential.type).toEqual(officialCredential.type)
      expect(ourCredential.id).toBe(officialCredential.id)
      expect(ourCredential.name).toBe(officialCredential.name)
      expect(ourCredential.validFrom).toBe(officialCredential.validFrom)

      // Verify issuer structure
      expect(ourCredential.issuer.id).toBe(officialCredential.issuer.id)
      expect(ourCredential.issuer.name).toBe(officialCredential.issuer.name)
      expect(ourCredential.issuer.type).toEqual(officialCredential.issuer.type)

      // Verify credentialSubject structure
      expect(ourCredential.credentialSubject.id).toBe(
        officialCredential.credentialSubject.id,
      )
      expect(ourCredential.credentialSubject.type).toEqual(
        officialCredential.credentialSubject.type,
      )

      // Verify achievement structure
      const ourAchievement = ourCredential.credentialSubject.achievement
      const officialAchievement =
        officialCredential.credentialSubject.achievement

      expect(ourAchievement.id).toBe(officialAchievement.id)
      expect(ourAchievement.name).toBe(officialAchievement.name)
      expect(ourAchievement.description).toBe(officialAchievement.description)
      expect(ourAchievement.type).toEqual(officialAchievement.type)
    })

    it('should include creator in achievement (not issuer)', () => {
      const ourCredential = createCredential({
        credentialId: 'http://example.com/credentials/test',
        name: 'Test Badge',
        subject: {
          id: 'did:example:test',
          type: ['AchievementSubject'],
        },
        achievement: {
          id: 'https://example.com/achievements/test',
          name: 'Test Achievement',
          description: 'Test description',
          criteria: {
            narrative: 'Test criteria',
          },
          image: {
            id: 'https://example.com/achievements/test/image',
            type: 'Image',
          },
        },
        issuer: {
          id: 'https://example.edu/issuers/test',
          name: 'Test Issuer',
          url: 'https://example.edu',
        },
        validFrom: '2010-01-01T00:00:00Z',
      })

      // Per OpenBadges 3.0 spec: Achievement uses "creator", not "issuer"
      expect(ourCredential.credentialSubject.achievement.creator).toBeDefined()
      expect(
        ourCredential.credentialSubject.achievement.creator?.id,
      ).toBeDefined()
    })
  })
})
