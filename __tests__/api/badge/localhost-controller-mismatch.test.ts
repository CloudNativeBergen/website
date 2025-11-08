import { describe, it, expect, jest } from '@jest/globals'

// Test ensures that both issuer and keys routes use did:key consistently
// instead of HTTP(S) URLs, avoiding protocol mismatch issues

describe('Badge Key Document - DID-based Controller Consistency', () => {
  it('uses did:key controller for both issuer profile and key documents', async () => {
    // Simulate localhost environment by mocking getConferenceForCurrentDomain
    jest.resetModules()
    jest.doMock('@/lib/conference/sanity', () => ({
      getConferenceForCurrentDomain: async () => ({
        conference: { title: 'Test Conf', description: 'Desc' },
        domain: 'localhost:3000',
      }),
    }))

    // Ensure public key env var
    process.env.BADGE_ISSUER_PUBLIC_KEY =
      '1804a6dd081c492ebb051d2ec9e00d6563c7c4434efd0e888eceb0b1be93b4b7'

    const { GET: issuerGET } = await import('@/app/api/badge/issuer/route')
    const issuerResp = await issuerGET()
    expect(issuerResp.status).toBe(200)
    const issuerProfile = await issuerResp.json()

    // Issuer profile ID should be a did:key
    expect(issuerProfile.id).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/)

    const { GET: keyGET } = await import('@/app/api/badge/keys/[keyId]/route')
    const keyResp = await keyGET(
      {} as any,
      { params: Promise.resolve({ keyId: 'key-1804a6dd' }) } as any,
    )
    expect(keyResp.status).toBe(200)
    const keyDoc = await keyResp.json()

    // Key document controller should match issuer profile id (both did:key)
    expect(keyDoc.controller).toBe(issuerProfile.id)
    expect(keyDoc.controller).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/)

    // Verification method in issuer profile should reference the same DID
    expect(issuerProfile.verificationMethod).toBeDefined()
    expect(issuerProfile.verificationMethod[0].controller).toBe(
      issuerProfile.id,
    )
  })
})
