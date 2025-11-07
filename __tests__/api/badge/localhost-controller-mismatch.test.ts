import { describe, it, expect, jest } from '@jest/globals'

// This test captures the current bug: keys route uses https for localhost
// while issuer route uses http, causing controller mismatch in validator.

describe('Badge Key Document - Localhost Controller Consistency', () => {
  it('uses matching protocol and path for controller and issuer profile on localhost', async () => {
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
    expect(issuerProfile.id).toBe('http://localhost:3000/api/badge/issuer')

    const { GET: keyGET } = await import('@/app/api/badge/keys/[keyId]/route')
    const keyResp = await keyGET(
      {} as any,
      { params: Promise.resolve({ keyId: 'key-1804a6dd' }) } as any,
    )
    expect(keyResp.status).toBe(200)
    const keyDoc = await keyResp.json()

    // After fix: controller must match issuer profile id
    expect(keyDoc.controller).toBe(issuerProfile.id)
  })
})
