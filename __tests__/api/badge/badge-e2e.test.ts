import { describe, it, expect } from '@jest/globals'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { generateBadgeSVG } from '@/lib/badge/svg'
import {
  bakeBadge,
  extractBadge,
  verifyCredential,
  validateCredential,
} from '@/lib/openbadges'
import type { Conference } from '@/lib/conference/types'
import type { BadgeAssertion, BadgeGenerationParams } from '@/lib/badge/types'
import type { SignedCredential } from '@/lib/openbadges/types'

const TEST_HOST = 'cloudnativeday.no'

/**
 * End-to-End Badge System Tests
 *
 * Tests the complete badge lifecycle using real data:
 * 1. Badge generation with conference context
 * 2. Data Integrity Proof creation and validation
 * 3. Achievement verification
 * 4. SVG baking (embedding credentials)
 * 5. Credential extraction from baked SVG
 * 6. Signature verification
 * 7. All API endpoints
 */
describe('Badge System E2E', () => {
  let createdSpeakerId: string
  let createdBadgeDocId: string
  let createdAssetIds: string[] = []

  const testConference: Conference = {
    _id: 'test-conference-2025',
    title: 'Cloud Native Day Bergen 2025',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    venue_name: 'Åsane Kulturhus',
    venue_address: 'Åsane, Bergen, Norway',
    start_date: '2025-06-15',
    end_date: '2025-06-15',
    cfp_start_date: '2025-01-01',
    cfp_end_date: '2025-03-31',
    cfp_notify_date: '2025-04-15',
    cfp_email: 'cfp@cloudnativebergen.no',
    program_date: '2025-05-01',
    registration_enabled: true,
    contact_email: 'hello@cloudnativebergen.no',
    domains: [TEST_HOST],
    organizers: [],
    formats: [],
    topics: [],
  }

  const testBadgeParams: BadgeGenerationParams = {
    speakerId: 'test-speaker-123',
    speakerName: 'Jane Doe',
    speakerEmail: 'jane@example.com',
    speakerSlug: 'jane-doe',
    conferenceId: testConference._id,
    conferenceTitle: testConference.title,
    conferenceYear: '2025',
    conferenceDate: testConference.start_date,
    badgeType: 'speaker',
    baseUrl: `https://${TEST_HOST}`,
    issuerUrl: `https://${TEST_HOST}`, // Organization homepage, not /api/badge/issuer
    talkId: 'test-talk-456',
    talkTitle: 'Kubernetes at Scale',
  }

  let badgeCredential: BadgeAssertion
  let badgeId: string

  describe('Badge Generation', () => {
    it('should generate valid OpenBadges 3.0 credential with Data Integrity Proof', async () => {
      const result = await generateBadgeCredential(
        testBadgeParams,
        testConference,
      )

      badgeCredential = result.assertion
      badgeId = result.badgeId

      // Verify structure
      expect(badgeCredential).toBeDefined()
      expect(badgeCredential['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(badgeCredential.type).toContain('VerifiableCredential')
      expect(badgeCredential.type).toContain('AchievementCredential')

      // Verify IDs
      expect(badgeCredential.id).toMatch(/^https:\/\//)
      expect(badgeId).toMatch(/^[0-9a-f-]+$/) // UUID format

      // Verify credential subject
      expect(badgeCredential.credentialSubject).toBeDefined()
      expect(badgeCredential.credentialSubject.type).toContain(
        'AchievementSubject',
      )
      expect(badgeCredential.credentialSubject.achievement).toBeDefined()

      // Verify issuer (now using did:key instead of HTTP(S) URL)
      expect(badgeCredential.issuer.id).toMatch(
        /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/,
      )
      expect(badgeCredential.issuer.name).toBe(testConference.organizer)

      // Verify temporal validity
      expect(badgeCredential.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      // Verify Data Integrity Proof
      expect(badgeCredential.proof).toBeDefined()
      expect(Array.isArray(badgeCredential.proof)).toBe(true)
      expect(badgeCredential.proof!.length).toBeGreaterThan(0)

      const proof = badgeCredential.proof![0]
      expect(proof.type).toBe('DataIntegrityProof')
      expect(proof.cryptosuite).toBe('eddsa-rdfc-2022')
      expect(proof.proofPurpose).toBe('assertionMethod')
      // Verification method now uses did:key format
      expect(proof.verificationMethod).toMatch(
        /^did:key:z[1-9A-HJ-NP-Za-km-z]+#z[1-9A-HJ-NP-Za-km-z]+$/,
      )
      expect(proof.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(proof.proofValue).toMatch(/^z[1-9A-HJ-NP-Za-km-z]+$/) // Multibase z-prefix

      console.log('✓ Badge generated with valid structure and proof')
    })

    it('should include achievement with evidence', async () => {
      const achievement = badgeCredential.credentialSubject.achievement

      expect(achievement).toBeDefined()
      expect(achievement.name).toContain(testBadgeParams.conferenceTitle)
      expect(achievement.description).toBeTruthy()
      expect(achievement.criteria).toBeDefined()
      expect(achievement.criteria.narrative).toBeTruthy()

      // Verify evidence
      expect(achievement.evidence).toBeDefined()
      expect(Array.isArray(achievement.evidence)).toBe(true)
      expect(achievement.evidence!.length).toBeGreaterThan(0)

      // Check that evidence items have expected structure
      const firstEvidence = achievement.evidence![0]
      expect(firstEvidence.id).toBeTruthy()
      expect(firstEvidence.type).toBeDefined()
      expect(Array.isArray(firstEvidence.type)).toBe(true)

      // Verify evidence URL format (should NOT contain /api/badge/issuer)
      expect(firstEvidence.id).toMatch(/\/speaker\/jane-doe$/)
      expect(firstEvidence.id).not.toContain('/api/badge/issuer')
      expect(firstEvidence.id).toBe(
        `${testBadgeParams.baseUrl}/speaker/jane-doe`,
      )

      console.log(
        '✓ Achievement includes valid evidence with correct URL format',
      )
    })

    it('should have correct issuer.url pointing to organization homepage', async () => {
      // issuer.url should be the organization homepage, not the /api/badge/issuer endpoint
      expect(badgeCredential.issuer.url).toBe(testBadgeParams.issuerUrl)
      expect(badgeCredential.issuer.url).not.toContain('/api/badge/issuer')
      expect(badgeCredential.issuer.url).toBe(testBadgeParams.baseUrl)

      // issuer.id should be did:key
      expect(badgeCredential.issuer.id).toMatch(
        /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/,
      )

      console.log('✓ Issuer URL correctly points to organization homepage')
    })
  })

  describe('SVG Badge Generation', () => {
    it('should generate valid SVG badge', () => {
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      expect(svg).toContain('<?xml version="1.0"')
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
      expect(svg).toContain(testBadgeParams.badgeType.toUpperCase())
      expect(svg).toContain('2025')

      console.log('✓ SVG badge generated successfully')
    })

    it('should bake credential into SVG', () => {
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      // Badge uses proof array, convert to SignedCredential for baking
      const signedCredential = badgeCredential as unknown as SignedCredential

      const bakedSVG = bakeBadge(svg, signedCredential)

      expect(bakedSVG).toContain('<svg')
      expect(bakedSVG).toContain('<openbadges:credential')
      expect(bakedSVG).toBeTruthy()

      console.log('✓ Credential baked into SVG successfully')
    })

    it('should extract credential from baked SVG', () => {
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      const signedCredential = badgeCredential as unknown as SignedCredential

      const bakedSVG = bakeBadge(svg, signedCredential)
      const extractedCredential = extractBadge(bakedSVG)

      expect(extractedCredential).toBeDefined()
      expect(extractedCredential.id).toBe(badgeCredential.id)
      expect(extractedCredential.type).toEqual(badgeCredential.type)
      expect(extractedCredential.proof).toBeDefined()

      console.log('✓ Credential extracted from SVG successfully')
    })
  })

  describe('Credential Validation & Verification', () => {
    it('should validate credential schema', () => {
      const signedCredential = badgeCredential as unknown as SignedCredential

      const result = validateCredential(signedCredential)

      expect(result.valid).toBe(true)
      console.log('✓ Credential passes schema validation')
    })

    it('should verify credential signature', async () => {
      const signedCredential = badgeCredential as unknown as SignedCredential

      // Extract public key from environment (hex format)
      const publicKey = process.env.OPENBADGES_PUBLIC_KEY
      if (!publicKey) {
        console.log(
          '⊘ Skipping signature verification - no public key in environment',
        )
        return
      }

      const verified = await verifyCredential(signedCredential, publicKey)

      expect(verified).toBe(true)
      console.log('✓ Credential signature verified successfully')
    })
  })

  describe.skip('API Endpoints', () => {
    it('GET /api/badge/issuer should return issuer profile', async () => {
      const { GET } = await import('@/app/api/badge/issuer/route')

      const response = await GET()
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data['@context']).toContain('https://www.w3.org/ns/credentials/v2')
      expect(data.type).toContain('Profile')
      expect(data.id).toMatch(/^https:\/\//)
      expect(data.name).toBeTruthy()

      console.log('✓ Issuer profile endpoint working')
    })

    it('GET /api/badge/[badgeId]/json should return badge credential', async () => {
      const { GET } = await import('@/app/api/badge/[badgeId]/json/route')

      const response = await GET(
        { params: Promise.resolve({ badgeId }) } as any,
        { params: { badgeId } } as any,
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.type).toContain('VerifiableCredential')
      expect(data.id).toBe(badgeCredential.id)

      console.log('✓ Badge JSON endpoint working')
    })

    it('GET /api/badge/[badgeId]/verify should verify badge', async () => {
      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')

      const response = await GET(
        { params: Promise.resolve({ badgeId }) } as any,
        { params: { badgeId } } as any,
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.verified).toBe(true)
      expect(data.checks).toBeDefined()

      console.log('✓ Badge verification endpoint working')
    })

    it('GET /api/badge/[badgeId]/achievement should return achievement', async () => {
      const { GET } = await import(
        '@/app/api/badge/[badgeId]/achievement/route'
      )

      const response = await GET(
        { params: Promise.resolve({ badgeId }) } as any,
        { params: { badgeId } } as any,
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.type).toContain('Achievement')
      expect(data.name).toBeTruthy()
      expect(data.criteria).toBeDefined()

      console.log('✓ Achievement endpoint working')
    })
  })

  describe('Complete Badge Lifecycle', () => {
    it('should complete full badge workflow: generate → bake → extract → verify', async () => {
      // 1. Generate badge
      const { assertion } = await generateBadgeCredential(
        testBadgeParams,
        testConference,
      )
      expect(assertion.proof).toBeDefined()

      // 2. Generate SVG
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })
      expect(svg).toContain('<svg')

      // 3. Bake credential into SVG
      const signedCredential = assertion as unknown as SignedCredential
      const bakedSVG = bakeBadge(svg, signedCredential)
      expect(bakedSVG).toContain('<openbadges:credential')

      // 4. Extract credential from baked SVG
      const extractedCredential = extractBadge(bakedSVG)
      expect(extractedCredential.id).toBe(assertion.id)

      // 5. Validate extracted credential
      const validationResult = validateCredential(extractedCredential)
      expect(validationResult.valid).toBe(true)

      // 6. Verify signature (if public key available)
      const publicKey = process.env.OPENBADGES_PUBLIC_KEY
      if (publicKey) {
        const verified = await verifyCredential(extractedCredential, publicKey)
        expect(verified).toBe(true)
      } else {
        console.log('⊘ Skipping signature verification - no public key')
      }

      console.log('✓ Complete badge lifecycle completed successfully')
    })

    it('should cryptographically verify badge through validator API', async () => {
      // 1. Generate and bake badge
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      const { assertion } = await generateBadgeCredential(
        testBadgeParams,
        testConference,
      )

      const signedCredential = assertion as unknown as SignedCredential
      const bakedSVG = bakeBadge(svg, signedCredential)

      // 2. Validate through API (which includes cryptographic verification)
      const { POST } = await import('@/app/api/badge/validate/route')
      const request = {
        json: async () => ({ svg: bakedSVG }),
      } as any

      const response = await POST(request)
      expect(response.status).toBe(200)

      const result = await response.json()
      expect(result.checks).toBeDefined()

      // Find the proof check
      const proofCheck = result.checks.find((c: any) => c.name === 'proof')
      expect(proofCheck).toBeDefined()
      expect(proofCheck.status).toBe('success')
      expect(proofCheck.details?.signatureValid).toBe(true)

      console.log('✓ Validator API cryptographically verified badge signature')
    })
  })
})
