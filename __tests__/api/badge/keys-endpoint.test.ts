/**
 * GET /api/badge/keys/[keyId] — dereferenceable public-key documents
 *
 * - key-ed25519 returns the BARE Multikey document the 1EdTech
 *   EmbeddedProofProbe dereferences (controller + publicKeyMultibase at the
 *   response root); this is what fixes the "Invalid verification key URL" NPE.
 * - key-1 still returns the bare RSA JWK for the JWT ExternalProofProbe.
 */

import { seedToMultikey } from '@/lib/openbadges'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'example.com' }),
}))

const DOMAIN = 'example.com'
const ISSUER_ID = `https://${DOMAIN}/api/badge/issuer`
const KEY_DOC_ID = `https://${DOMAIN}/api/badge/keys/key-ed25519`

async function callKeysRoute(keyId: string) {
  const { GET } = await import('@/app/api/badge/keys/[keyId]/route')
  const request = new Request(`https://${DOMAIN}/api/badge/keys/${keyId}`)
  return GET(request, { params: Promise.resolve({ keyId }) })
}

describe('GET /api/badge/keys/[keyId]', () => {
  let savedSeed: string | undefined
  let savedPublicKey: string | undefined

  beforeAll(() => {
    savedSeed = process.env.BADGE_ISSUER_ED25519_SEED
    savedPublicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
  })

  afterEach(() => {
    if (savedSeed !== undefined)
      process.env.BADGE_ISSUER_ED25519_SEED = savedSeed
    else delete process.env.BADGE_ISSUER_ED25519_SEED
    if (savedPublicKey !== undefined)
      process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY = savedPublicKey
    else delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
  })

  it('serves key-ed25519 as a bare Multikey document (public key path)', async () => {
    const publicKey = savedPublicKey
    expect(publicKey?.startsWith('z')).toBe(true)

    delete process.env.BADGE_ISSUER_ED25519_SEED
    process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY = publicKey

    const response = await callKeysRoute('key-ed25519')
    expect(response.status).toBe(200)
    // JSON-LD content type so the validator's document loader accepts it.
    expect(response.headers.get('content-type')).toContain(
      'application/ld+json',
    )

    const doc = await response.json()
    expect(doc).toEqual({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: KEY_DOC_ID,
      type: 'Multikey',
      controller: ISSUER_ID,
      publicKeyMultibase: publicKey,
    })
    // The probe reads these off the root — a fragment→issuer-profile response
    // has no top-level controller and NPEs. Assert they are present here.
    expect(doc.controller).toBe(ISSUER_ID)
    expect(typeof doc.publicKeyMultibase).toBe('string')
  })

  it('derives key-ed25519 from the seed when no public key env is set', async () => {
    const seed = savedSeed
    expect(seed).toBeTruthy()

    delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    process.env.BADGE_ISSUER_ED25519_SEED = seed

    const response = await callKeysRoute('key-ed25519')
    expect(response.status).toBe(200)
    const doc = await response.json()

    const { publicKeyMultibase } = await seedToMultikey(seed!)
    expect(doc.publicKeyMultibase).toBe(publicKeyMultibase)
    expect(doc.type).toBe('Multikey')
  })

  it('500s for key-ed25519 when no Ed25519 material is configured', async () => {
    delete process.env.BADGE_ISSUER_ED25519_SEED
    delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY

    const response = await callKeysRoute('key-ed25519')
    expect(response.status).toBe(500)
  })

  it('still serves key-1 as a bare RSA JWK', async () => {
    const response = await callKeysRoute('key-1')
    expect(response.status).toBe(200)
    const jwk = await response.json()
    expect(jwk.kty).toBe('RSA')
    expect(jwk).toHaveProperty('n')
    expect(jwk).toHaveProperty('e')
    // Bare JWK — never wrapped in an issuer profile.
    expect(jwk).not.toHaveProperty('publicKey')
    expect(jwk).not.toHaveProperty('verificationMethod')
  })

  it('404s for an unknown key id', async () => {
    const response = await callKeysRoute('key-unknown')
    expect(response.status).toBe(404)
  })
})
