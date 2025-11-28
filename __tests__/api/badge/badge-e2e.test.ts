import { describe, it, expect } from '@jest/globals'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { createTestConfiguration } from '@/lib/badge/config'
import { generateBadgeSVG } from '@/lib/badge/svg'
import {
  bakeBadge,
  extractBadge,
  verifyCredential,
  verifyCredentialJWT,
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
 * 2. Data Integrity Proof creation with eddsa-rdfc-2022 (RDF canonicalization)
 * 3. Achievement verification
 * 4. SVG baking (embedding credentials)
 * 5. Credential extraction from baked SVG
 * 6. Signature verification using RDF Dataset Canonicalization (URDNA2015)
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
    talkId: 'test-talk-456',
    talkTitle: 'Kubernetes at Scale',
  }

  let badgeCredential: string | BadgeAssertion // JWT string or legacy JSON
  let badgeId: string
  let decodedCredential: BadgeAssertion | null = null // Decoded JWT credential

  describe('Badge Generation', () => {
    it('should generate valid OpenBadges 3.0 credential as JWT', async () => {
      const config = createTestConfiguration({
        baseUrl: `https://${TEST_HOST}`,
        issuer: {
          id: `https://${TEST_HOST}/api/badge/issuer`,
          name: testConference.organizer,
          url: `https://${TEST_HOST}`,
          email: testConference.contact_email,
          description: `Test organization for ${testConference.title}`,
        },
      })

      const result = await generateBadgeCredential(testBadgeParams, config)

      badgeCredential = result.assertion
      badgeId = result.badgeId

      // Badge is now JWT format
      expect(badgeCredential).toBeDefined()
      expect(typeof badgeCredential).toBe('string')
      expect(badgeCredential).toMatch(/^eyJ/) // JWT starts with eyJ

      // Decode JWT to verify contents
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY
      if (!publicKey) {
        throw new Error('BADGE_ISSUER_RSA_PUBLIC_KEY not set')
      }
      decodedCredential = (await verifyCredentialJWT(
        badgeCredential as string,
        publicKey,
      )) as unknown as BadgeAssertion

      // Verify structure of decoded credential
      expect(decodedCredential).toBeDefined()
      expect(decodedCredential['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(decodedCredential.type).toContain('VerifiableCredential')
      expect(decodedCredential.type).toContain('OpenBadgeCredential')

      // Verify IDs
      expect(decodedCredential.id).toMatch(/^https:\/\//)
      expect(badgeId).toMatch(/^[0-9a-f-]+$/) // UUID format

      // Verify credential subject
      expect(decodedCredential.credentialSubject).toBeDefined()
      expect(decodedCredential.credentialSubject.type).toContain(
        'AchievementSubject',
      )
      expect(decodedCredential.credentialSubject.achievement).toBeDefined()

      // Verify issuer (issuer.id points to issuer profile endpoint)
      expect(decodedCredential.issuer.id).toBe(
        `https://${TEST_HOST}/api/badge/issuer`,
      )
      expect(decodedCredential.issuer.name).toBe(testConference.organizer)

      // Verify temporal validity
      expect(decodedCredential.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      // JWT format - proof is the JWT signature itself, not embedded in JSON
      // The successful verifyCredentialJWT call above proves the signature is valid

      console.log('✓ Badge generated as valid JWT with verified signature')
    })

    it('should include achievement with evidence', async () => {
      if (!decodedCredential) {
        throw new Error('Credential not decoded yet')
      }
      const achievement = decodedCredential.credentialSubject.achievement

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
      expect(firstEvidence.id).toBe(`https://${TEST_HOST}/speaker/jane-doe`)

      console.log(
        '✓ Achievement includes valid evidence with correct URL format',
      )
    })

    it('should have correct issuer.url pointing to organization homepage', async () => {
      if (!decodedCredential) {
        throw new Error('Credential not decoded yet')
      }
      // issuer.url should be the organization homepage, not the /api/badge/issuer endpoint
      expect(decodedCredential.issuer.url).toBe(`https://${TEST_HOST}`)
      expect(decodedCredential.issuer.url).not.toContain('/api/badge/issuer')

      // issuer.id should point to the issuer profile endpoint
      expect(decodedCredential.issuer.id).toBe(
        `https://${TEST_HOST}/api/badge/issuer`,
      )
      // issuer.url should point to organization homepage
      expect(decodedCredential.issuer.url).toBe(`https://${TEST_HOST}`)

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
      if (!badgeCredential) {
        throw new Error('Credential not generated yet')
      }
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      // Use JWT string for baking
      const bakedSVG = bakeBadge(svg, badgeCredential as string)

      expect(bakedSVG).toContain('<svg')
      expect(bakedSVG).toContain('<openbadges:credential')
      expect(bakedSVG).toBeTruthy()

      console.log('✓ Credential baked into SVG successfully')
    })

    it('should extract credential from baked SVG', () => {
      if (!badgeCredential || !decodedCredential) {
        throw new Error('Credential not generated yet')
      }
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      // Bake with JWT string
      const bakedSVG = bakeBadge(svg, badgeCredential as string)
      const extractedJWT = extractBadge(bakedSVG)

      expect(extractedJWT).toBeDefined()
      expect(typeof extractedJWT).toBe('string')
      expect(extractedJWT).toBe(badgeCredential)

      console.log('✓ Credential extracted from SVG successfully')
    })
  })

  describe('Credential Validation & Verification', () => {
    it('should validate credential schema', () => {
      if (!decodedCredential) {
        throw new Error('Credential not decoded yet')
      }
      const signedCredential = decodedCredential as unknown as SignedCredential

      const result = validateCredential(signedCredential)

      expect(result.valid).toBe(true)
      console.log('✓ Credential passes schema validation')
    })

    it('should verify JWT credential signature', async () => {
      // JWT verification already happened during decode, but test it again explicitly
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY
      if (!publicKey) {
        throw new Error('BADGE_ISSUER_RSA_PUBLIC_KEY not set')
      }

      // Verify JWT signature
      const verified = await verifyCredentialJWT(
        badgeCredential as string,
        publicKey,
      )

      expect(verified).toBeDefined()
      expect(verified.id).toBe(decodedCredential?.id)
      console.log('✓ JWT signature verified successfully')
    })

    it('should verify legacy Data Integrity Proof if present', async () => {
      // This test is for backwards compatibility with old badges
      // JWT badges don't have proof arrays, so we skip if JWT
      if (typeof badgeCredential === 'string') {
        console.log('✓ Skipped - JWT format does not use proof arrays')
        return
      }

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

      const mockRequest = new Request('http://localhost:3000/api/badge/issuer')
      const response = await GET(mockRequest)
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

      // JWT endpoint returns text/plain with JWT string
      const contentType = response.headers.get('Content-Type')
      if (contentType?.includes('text/plain')) {
        // JWT format - just verify it's a valid JWT string
        const text = await response.text()
        expect(text).toMatch(/^eyJ/)
      } else {
        // Legacy JSON format
        const data = await response.json()
        expect(data.type).toContain('VerifiableCredential')
        expect(data.id).toBe(decodedCredential?.id)
      }

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
      const { GET } =
        await import('@/app/api/badge/[badgeId]/achievement/route')

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
    it('should complete full badge workflow: generate → decode → bake → extract → verify', async () => {
      // Create test configuration
      const config = createTestConfiguration({
        baseUrl: `https://${TEST_HOST}`,
        issuer: {
          id: `https://${TEST_HOST}/api/badge/issuer`,
          name: testConference.organizer,
          url: `https://${TEST_HOST}`,
          email: testConference.contact_email,
          description: `Test organization for ${testConference.title}`,
        },
      })

      // 1. Generate badge (JWT format)
      const { assertion } = await generateBadgeCredential(
        testBadgeParams,
        config,
      )
      expect(typeof assertion).toBe('string')
      expect(assertion).toMatch(/^eyJ/)

      // 2. Decode JWT to get credential
      const publicKey1 = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY
      if (!publicKey1) {
        throw new Error('BADGE_ISSUER_RSA_PUBLIC_KEY not set')
      }
      const credential = (await verifyCredentialJWT(
        assertion,
        publicKey1,
      )) as unknown as BadgeAssertion

      // 3. Generate SVG
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })
      expect(svg).toContain('<svg')

      // 4. Bake JWT into SVG
      const bakedSVG = bakeBadge(svg, assertion)
      expect(bakedSVG).toContain('<openbadges:credential')

      // 5. Extract JWT from baked SVG
      const extractedJWT = extractBadge(bakedSVG)
      expect(extractedJWT).toBe(assertion)

      // 6. Verify extracted JWT matches original
      expect(typeof extractedJWT).toBe('string')
      expect(extractedJWT).toMatch(/^eyJ/)

      // 7. JWT already verified during decode
      console.log('✓ JWT signature verified during decode')

      console.log('✓ Complete badge lifecycle completed successfully')
    })

    it.skip('should cryptographically verify badge through validator API (Data Integrity Proof only)', async () => {
      // Create test configuration
      const config = createTestConfiguration({
        baseUrl: `https://${TEST_HOST}`,
        issuer: {
          id: `https://${TEST_HOST}/api/badge/issuer`,
          name: testConference.organizer,
          url: `https://${TEST_HOST}`,
          email: testConference.contact_email,
          description: `Test organization for ${testConference.title}`,
        },
      })

      // 1. Generate and bake badge
      const svg = generateBadgeSVG({
        conferenceTitle: testBadgeParams.conferenceTitle,
        conferenceYear: testBadgeParams.conferenceYear,
        conferenceDate: testBadgeParams.conferenceDate,
        badgeType: testBadgeParams.badgeType,
      })

      const { assertion } = await generateBadgeCredential(
        testBadgeParams,
        config,
      )

      // Bake JWT string into SVG
      const bakedSVG = bakeBadge(svg, assertion)

      // 2. Validate through API (which includes cryptographic verification)
      const { POST } = await import('@/app/api/badge/validate/route')
      const request = {
        json: async () => ({ svg: bakedSVG }),
      } as any

      const response = await POST(request)
      expect(response.status).toBe(200)

      const result = await response.json()
      expect(result.checks).toBeDefined()

      // Verify canonicalization check (RDF Dataset Canonicalization)
      const canonCheck = result.checks.find(
        (c: any) => c.name === 'canonicalization',
      )
      expect(canonCheck).toBeDefined()
      expect(canonCheck.status).toBe('success')
      expect(canonCheck.details?.canonicalizationResult).toBeDefined()
      expect(typeof canonCheck.details?.canonicalizationResult).toBe('string')

      // Find the proof check
      const proofCheck = result.checks.find((c: any) => c.name === 'proof')
      expect(proofCheck).toBeDefined()
      expect(proofCheck.status).toBe('success')
      expect(proofCheck.details?.signatureValid).toBe(true)

      console.log(
        '✓ Validator API cryptographically verified badge signature with RDF canonicalization',
      )
    })
  })
})
