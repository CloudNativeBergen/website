/**
 * Badge Endpoint Format Tests
 *
 * Verifies the dual-format handling of the badge endpoints:
 * - NEW badges: badgeJson holds the embedded-proof JSON-LD credential
 *   (stringified) and badgeJwt holds the RS256 JWT
 * - LEGACY badges: badgeJson holds the raw JWT string and badgeJwt is absent
 */

import type { NextRequest } from 'next/server'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { createTestConfiguration } from '@/lib/badge/config'
import type { BadgeRecord } from '@/lib/badge/types'

vi.mock('@/lib/badge/sanity', () => ({
  getBadgeById: vi.fn(),
}))

import { getBadgeById } from '@/lib/badge/sanity'

const mockedGetBadgeById = vi.mocked(getBadgeById)

function badgeRecord(overrides: Partial<BadgeRecord>): BadgeRecord {
  return {
    _id: 'badge-doc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    badgeId: 'test-badge-id',
    speaker: { _ref: 'speaker-1', _type: 'reference' },
    conference: { _ref: 'conference-1', _type: 'reference' },
    badgeType: 'speaker',
    issuedAt: '2026-01-01T00:00:00Z',
    badgeJson: '',
    emailSent: false,
    ...overrides,
  }
}

function routeParams(badgeId = 'test-badge-id') {
  return { params: Promise.resolve({ badgeId }) }
}

const request = {} as NextRequest

describe('Badge endpoints - dual format', () => {
  let credentialJsonString: string
  let credentialJwt: string

  beforeAll(async () => {
    const config = createTestConfiguration()
    const generated = await generateBadgeCredential(
      {
        speakerId: 'speaker-1',
        speakerName: 'Jane Doe',
        speakerEmail: 'Jane.Doe@Example.COM',
        speakerSlug: 'jane-doe',
        conferenceId: 'conference-1',
        conferenceTitle: 'Test Conference 2026',
        conferenceYear: '2026',
        conferenceDate: 'June 15, 2026',
        badgeType: 'speaker',
        talkId: 'talk-1',
        talkTitle: 'Kubernetes at Scale',
      },
      config,
    )
    credentialJsonString = JSON.stringify(generated.credentialJson)
    credentialJwt = generated.credentialJwt
  })

  beforeEach(() => {
    mockedGetBadgeById.mockReset()
  })

  describe('GET /api/badge/[badgeId]/json', () => {
    it('returns the embedded-proof JSON-LD for new badges', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/json/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')

      const credential = await response.json()
      expect(credential.type).toContain('OpenBadgeCredential')
      expect(Array.isArray(credential.proof)).toBe(true)
      expect(credential.proof[0].cryptosuite).toBe('eddsa-rdfc-2022')
      expect(credential.evidence).toBeDefined()
      expect(credential.credentialSubject.id).toBe(
        'mailto:jane.doe@example.com',
      )
    })

    it('returns the JWT string for legacy badges', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: credentialJwt }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/json/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/plain')
      expect(await response.text()).toMatch(/^eyJ/)
    })
  })

  describe('GET /api/badge/[badgeId]/jwt', () => {
    it('serves the JWT from badgeJwt for new badges', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/jwt/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(credentialJwt)
    })

    it('serves the JWT from badgeJson for legacy badges', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: credentialJwt }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/jwt/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(credentialJwt)
    })

    it('returns 404 when no JWT exists', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: credentialJsonString }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/jwt/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(404)
    })
  })

  describe('GET /api/badge/[badgeId]/verify', () => {
    it('verifies new embedded-proof badges with the Ed25519 key', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.valid).toBe(true)
      expect(result.credential.id).toContain('/api/badge/')
    })

    it('still verifies legacy JWT badges stored in badgeJson', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: credentialJwt }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.valid).toBe(true)
    })

    it('rejects tampered embedded-proof badges', async () => {
      const tampered = JSON.parse(credentialJsonString)
      tampered.name = 'Tampered Badge'
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: JSON.stringify(tampered) }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.valid).toBe(false)
    })

    it('reports not-verified when the verification method is foreign (VM pinning)', async () => {
      // A badge presented with a did:key verification method must never earn
      // a green check from OUR verify endpoint, even if otherwise well-formed.
      const foreign = JSON.parse(credentialJsonString)
      foreign.proof[0].verificationMethod =
        'did:key:z6MkvRQ7bnwBVzwozkkbasYzntpfnWJBsHfB1EfWFeFErgoy#z6MkvRQ7bnwBVzwozkkbasYzntpfnWJBsHfB1EfWFeFErgoy'
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: JSON.stringify(foreign) }),
      })

      const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
      const response = await GET(request, routeParams())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.valid).toBe(false)
    })

    it('verifies with only the public key env configured (no secret seed)', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })

      const savedSeed = process.env.BADGE_ISSUER_ED25519_SEED
      delete process.env.BADGE_ISSUER_ED25519_SEED
      try {
        const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
        const response = await GET(request, routeParams())

        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.valid).toBe(true)
      } finally {
        if (savedSeed !== undefined) {
          process.env.BADGE_ISSUER_ED25519_SEED = savedSeed
        }
      }
    })
  })
})
