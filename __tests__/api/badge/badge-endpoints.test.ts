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

  describe('GET /api/badge/[badgeId] (credential id / hosted verification)', () => {
    it('serves the same credential bytes as /json (application/ld+json)', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })
      const { GET: JSON_GET } =
        await import('@/app/api/badge/[badgeId]/json/route')
      const jsonBytes = await (await JSON_GET(request, routeParams())).text()

      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({
          badgeJson: credentialJsonString,
          badgeJwt: credentialJwt,
        }),
      })
      const { GET } = await import('@/app/api/badge/[badgeId]/route')
      const res = await GET(request, routeParams())

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('application/ld+json')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await res.text()).toBe(jsonBytes)
    })

    it('uses rebake-aware caching (revalidate + ETag, not immutable)', async () => {
      mockedGetBadgeById.mockResolvedValue({
        badge: badgeRecord({ badgeJson: credentialJsonString }),
      })
      const { GET } = await import('@/app/api/badge/[badgeId]/route')
      const res = await GET(request, routeParams())

      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=0, must-revalidate',
      )
      expect(res.headers.get('Cache-Control')).not.toContain('immutable')
      expect(res.headers.get('ETag')).toBeTruthy()
    })

    it('redirects browsers (Accept: text/html) to the human badge page', async () => {
      const { GET } = await import('@/app/api/badge/[badgeId]/route')
      const htmlReq = {
        headers: {
          get: (n: string) =>
            n.toLowerCase() === 'accept' ? 'text/html' : null,
        },
        url: 'https://conf.test/api/badge/test-badge-id',
      } as unknown as NextRequest
      const res = await GET(htmlReq, routeParams())

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('/badge/test-badge-id')
    })

    it('404s an unknown badge', async () => {
      mockedGetBadgeById.mockResolvedValue({
        error: new Error('Badge not found'),
      })
      const { GET } = await import('@/app/api/badge/[badgeId]/route')
      const res = await GET(request, routeParams('nope'))

      expect(res.status).toBe(404)
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

    /**
     * #848. This endpoint answers EXTERNAL verifiers — employers, other
     * credential platforms — that we do not control. `getBadgeById` used to
     * return the same `{ error }` for "no such badge" and "the badge store is
     * unreachable", and the route turned both into a definitive, cacheable
     * 404: to a verifier, indistinguishable from a forged credential.
     */
    describe('a badge-store outage is not a verdict on the credential', () => {
      it('answers 503, not 404, and never says the badge does not exist', async () => {
        mockedGetBadgeById.mockResolvedValue({
          error: new Error('ECONNREFUSED sanity.io'),
          reason: 'unavailable',
        })

        const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
        const response = await GET(request, routeParams())

        expect(response.status).toBe(503)
        const body = await response.json()
        // Not a verification verdict of any kind.
        expect(body.verified).toBeUndefined()
        expect(JSON.stringify(body)).not.toContain('Badge not found')
        // A non-answer must not be cached as though it were one, and the
        // verifier must be told to come back.
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Retry-After')).toBe('30')
      })

      it('STILL answers 404 for a badge that genuinely does not exist', async () => {
        // The other direction: if the outage response were reused here, the
        // test above would prove nothing.
        mockedGetBadgeById.mockResolvedValue({
          error: new Error('Badge not found'),
          reason: 'not-found',
        })

        const { GET } = await import('@/app/api/badge/[badgeId]/verify/route')
        const response = await GET(request, routeParams())

        expect(response.status).toBe(404)
        expect((await response.json()).error).toBe('Badge not found')
      })
    })
  })
})
