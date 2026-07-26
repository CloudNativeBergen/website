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
import type { NextRequest } from 'next/server'
import type { Conference } from '@/lib/conference/types'
import type {
  BadgeAssertion,
  BadgeGenerationParams,
  BadgeRecord,
} from '@/lib/badge/types'
import type { SignedCredential } from '@/lib/openbadges/types'

// The API-endpoint tests below drive the real route handlers, which read
// badge/conference data from Sanity. Mock those data-access modules so the
// routes run offline against fixtures (mirrors badge-endpoints.test.ts and
// issuer-profile.test.ts). The badge generation/SVG/verification tests in this
// file do not touch these modules, so the mocks are inert for them.
vi.mock('@/lib/badge/sanity', () => ({
  getBadgeById: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

import { getBadgeById } from '@/lib/badge/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

const mockedGetBadgeById = vi.mocked(getBadgeById)
const mockedGetConference = vi.mocked(getConferenceForCurrentDomain)

const TEST_HOST = 'cloudnativedays.no'

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
    title: 'Cloud Native Days Norway 2025',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    venueName: 'Åsane Kulturhus',
    venueAddress: 'Åsane, Bergen, Norway',
    startDate: '2025-06-15',
    endDate: '2025-06-15',
    cfpStartDate: '2025-01-01',
    cfpEndDate: '2025-03-31',
    cfpNotifyDate: '2025-04-15',
    cfpEmail: 'cfp@example.com',
    programDate: '2025-05-01',
    registrationEnabled: true,
    contactEmail: 'hello@example.com',
    sponsorEmail: 'sponsors@example.com',
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
    conferenceDate: testConference.startDate,
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
          email: testConference.contactEmail,
          description: `Test organization for ${testConference.title}`,
        },
      })

      const result = await generateBadgeCredential(testBadgeParams, config)

      badgeCredential = result.credentialJwt
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

    it('should include achievement and top-level evidence', async () => {
      if (!decodedCredential) {
        throw new Error('Credential not decoded yet')
      }
      const achievement = decodedCredential.credentialSubject.achievement

      expect(achievement).toBeDefined()
      expect(achievement.name).toContain(testBadgeParams.conferenceTitle)
      expect(achievement.description).toBeTruthy()
      expect(achievement.criteria).toBeDefined()
      expect(achievement.criteria.narrative).toBeTruthy()

      // Verify evidence lives at the credential TOP level (per VC 2.0 /
      // OB 3.0 — the OB context rejects evidence nested under achievement)
      const evidence = decodedCredential.evidence
      expect(evidence).toBeDefined()
      expect(Array.isArray(evidence)).toBe(true)
      expect(evidence!.length).toBeGreaterThan(0)

      // Check that evidence items have expected structure
      const firstEvidence = evidence![0]
      expect(firstEvidence.id).toBeTruthy()
      expect(firstEvidence.type).toBeDefined()
      expect(Array.isArray(firstEvidence.type)).toBe(true)

      // Verify evidence URL format (should NOT contain /api/badge/issuer)
      expect(firstEvidence.id).toMatch(/\/speaker\/jane-doe$/)
      expect(firstEvidence.id).not.toContain('/api/badge/issuer')
      expect(firstEvidence.id).toBe(`https://${TEST_HOST}/speaker/jane-doe`)

      console.log(
        '✓ Credential includes valid top-level evidence with correct URL format',
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

  describe('API Endpoints', () => {
    // Build a badge document whose stored badgeJson is the JWT credential
    // generated by the "Badge Generation" block above. getBadgeById is mocked,
    // so the badgeId is irrelevant to lookup — the route always receives this
    // fixture.
    const badgeRecord = (overrides: Partial<BadgeRecord>): BadgeRecord => ({
      _id: 'badge-doc-1',
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-01T00:00:00Z',
      badgeId,
      speaker: { _ref: 'test-speaker-123', _type: 'reference' },
      conference: { _ref: testConference._id, _type: 'reference' },
      badgeType: 'speaker',
      issuedAt: '2026-01-01T00:00:00Z',
      badgeJson: '',
      emailSent: false,
      ...overrides,
    })

    // The routes read segmentData.params (second arg) and ignore the request,
    // matching the real Next.js route signature.
    const routeParams = () => ({ params: Promise.resolve({ badgeId }) })
    const emptyRequest = {} as NextRequest

    beforeEach(() => {
      mockedGetBadgeById.mockReset()
      mockedGetConference.mockReset()
    })

    it('GET /api/badge/issuer should return issuer profile', async () => {
      mockedGetConference.mockResolvedValue({
        conference: {
          organizer: testConference.organizer,
          contactEmail: testConference.contactEmail,
          description: `Test organization for ${testConference.title}`,
          domains: [TEST_HOST],
        },
        domain: TEST_HOST,
      } as unknown as Awaited<ReturnType<typeof getConferenceForCurrentDomain>>)

      const { GET } = await import('@/app/api/badge/issuer/route')

      const response = await GET(
        new Request(`https://${TEST_HOST}/api/badge/issuer`),
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data['@context']).toContain('https://www.w3.org/ns/credentials/v2')
      expect(data.type).toContain('Profile')
      expect(data.id).toMatch(/^https:\/\//)
      expect(data.name).toBe(testConference.organizer)

      console.log('✓ Issuer profile endpoint working')
    })

    it('GET /api/badge/[badgeId]/json should return badge credential', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: badgeCredential as string }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/json/route')

      const response = await GET(emptyRequest, routeParams())
      expect(response.status).toBe(200)

      // JWT badges are served as text/plain; embedded-proof badges as JSON.
      const contentType = response.headers.get('Content-Type')
      if (contentType?.includes('text/plain')) {
        const text = await response.text()
        expect(text).toMatch(/^eyJ/)
        expect(text).toBe(badgeCredential)
      } else {
        const data = await response.json()
        expect(data.type).toContain('VerifiableCredential')
        expect(data.id).toBe(decodedCredential?.id)
      }

      console.log('✓ Badge JSON endpoint working')
    })

    it('GET /api/badge/[badgeId]/verify should verify badge', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: badgeCredential as string }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')

      const response = await GET(emptyRequest, routeParams())
      expect(response.status).toBe(200)

      // The verify route returns { valid, credential, errors? } — the JWT
      // signature is checked with the issuer's RSA public key.
      const data = await response.json()
      expect(data.valid).toBe(true)
      expect(data.credential).toBeDefined()
      expect(data.credential.id).toBe(decodedCredential?.id)

      console.log('✓ Badge verification endpoint working')
    })

    it('GET /api/badge/[badgeId]/achievement should return achievement', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: badgeCredential as string }),
      })

      const { GET } =
        await import('@/app/api/badge/[badgeId]/achievement/route')

      const response = await GET(emptyRequest, routeParams())
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
          email: testConference.contactEmail,
          description: `Test organization for ${testConference.title}`,
        },
      })

      // 1. Generate badge (JWT format)
      const { credentialJwt: assertion } = await generateBadgeCredential(
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
  })
})
