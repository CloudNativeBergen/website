/**
 * Issuer profile endpoint — Ed25519 verification method publication
 *
 * External verifiers dereference the issuer profile to resolve the embedded
 * proof key, so verify-only / preview deployments that hold ONLY the public
 * key (BADGE_ISSUER_ED25519_PUBLIC_KEY, no secret seed) must still publish the
 * Ed25519 Multikey. The seed path remains a fallback.
 */

import { seedToMultikey } from '@/lib/openbadges'

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

const mockedGetConference = vi.mocked(getConferenceForCurrentDomain)

const DOMAIN = 'example.com'
const ISSUER_ID = `https://${DOMAIN}/api/badge/issuer`

async function callIssuerRoute() {
  const { GET } = await import('@/app/api/badge/issuer/route')
  const request = new Request(`https://${DOMAIN}/api/badge/issuer`)
  return GET(request)
}

describe('GET /api/badge/issuer - Ed25519 verification method', () => {
  let savedSeed: string | undefined
  let savedPublicKey: string | undefined

  beforeAll(() => {
    savedSeed = process.env.BADGE_ISSUER_ED25519_SEED
    savedPublicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
  })

  beforeEach(() => {
    mockedGetConference.mockReset()
    mockedGetConference.mockResolvedValue({
      // Only the fields the route reads are needed here.
      conference: {
        organizer: 'Test Conference Org',
        contactEmail: 'contact@example.com',
        description: 'Test issuer profile',
        domains: [DOMAIN],
      },
      domain: DOMAIN,
    } as unknown as Awaited<ReturnType<typeof getConferenceForCurrentDomain>>)
  })

  afterEach(() => {
    if (savedSeed !== undefined) {
      process.env.BADGE_ISSUER_ED25519_SEED = savedSeed
    } else {
      delete process.env.BADGE_ISSUER_ED25519_SEED
    }
    if (savedPublicKey !== undefined) {
      process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY = savedPublicKey
    } else {
      delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    }
  })

  it('publishes the Ed25519 VM from the PUBLIC key when only it is set (no seed)', async () => {
    const publicKey = savedPublicKey
    expect(publicKey).toBeTruthy()
    expect(publicKey!.startsWith('z')).toBe(true)

    delete process.env.BADGE_ISSUER_ED25519_SEED
    process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY = publicKey

    const response = await callIssuerRoute()
    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.verificationMethod).toHaveLength(1)
    const vm = data.verificationMethod[0]
    expect(vm.id).toBe(`${ISSUER_ID}#key-ed25519`)
    expect(vm.type).toBe('Multikey')
    expect(vm.controller).toBe(ISSUER_ID)
    // The published public key IS the publicKeyMultibase — no seed needed.
    expect(vm.publicKeyMultibase).toBe(publicKey)
    expect(data.assertionMethod).toEqual([`${ISSUER_ID}#key-ed25519`])

    // RSA JWT key is still served alongside.
    expect(data.publicKey[0].type).toBe('JsonWebKey')
  })

  it('falls back to deriving the VM from the seed when only the seed is set', async () => {
    const seed = savedSeed
    expect(seed).toBeTruthy()

    delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    process.env.BADGE_ISSUER_ED25519_SEED = seed

    const response = await callIssuerRoute()
    expect(response.status).toBe(200)
    const data = await response.json()

    const { publicKeyMultibase } = await seedToMultikey(seed!)
    expect(data.verificationMethod[0].publicKeyMultibase).toBe(
      publicKeyMultibase,
    )
  })

  it('omits the Ed25519 VM (but still serves RSA) when neither env is set', async () => {
    delete process.env.BADGE_ISSUER_ED25519_SEED
    delete process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY

    const response = await callIssuerRoute()
    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.verificationMethod).toBeUndefined()
    expect(data.assertionMethod).toBeUndefined()
    expect(data.publicKey[0].type).toBe('JsonWebKey')
  })
})
