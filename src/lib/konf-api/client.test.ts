import { afterEach, describe, expect, it, vi } from 'vitest'

// vitest.config.ts aliases `jose` to a key-ignoring stub; load the real one.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

import { exportJWK, exportSPKI, generateKeyPair } from 'jose'
import { konfApiHeaders, konfApiUrl } from './client'
import { verifyClientIp } from '../../../api/src/client-ip'
import { verifySiteAssertion } from '../../../api/src/site-identity'

afterEach(() => vi.unstubAllEnvs())

describe('konfApiHeaders', () => {
  it('is anonymous with Origin when no secret is set', async () => {
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '')
    vi.stubEnv('CLIENT_IP_SECRET', '')
    const incoming = new Headers({ 'x-real-ip': '203.0.113.7' })
    expect(await konfApiHeaders('conf.example', incoming)).toEqual({
      'content-type': 'application/json',
      origin: 'https://conf.example',
    })
  })

  it('signs an assertion the gateway verifies', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      extractable: true,
    })
    const jwk = { ...(await exportJWK(privateKey)), kid: 's1' }
    vi.stubEnv('KONF_SITE_SIGNING_KEY', JSON.stringify(jwk))
    const h = await konfApiHeaders('conf.example')
    const keys = JSON.stringify({ s1: await exportSPKI(publicKey) })
    expect(await verifySiteAssertion(h['x-konf-service'], keys)).toBe(
      'conf.example',
    )
    expect(h['x-konf-client-ip']).toBeUndefined()
  })

  it('signs the visitor IP from Vercel headers', async () => {
    vi.stubEnv('CLIENT_IP_SECRET', 'ip-secret')
    const h = await konfApiHeaders(
      'conf.example',
      new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    )
    expect(await verifyClientIp(h['x-konf-client-ip'], 'ip-secret')).toBe(
      '203.0.113.7',
    )
    expect(await verifyClientIp(h['x-konf-client-ip'], 'other')).toBeNull()
  })
})

describe('konfApiUrl (#1926)', () => {
  afterEach(() => vi.unstubAllEnvs())
  const url = (env: Record<string, string>) => {
    vi.stubEnv('KONF_API_URL', '')
    vi.stubEnv('VERCEL_ENV', '')
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return konfApiUrl()
  }
  it('defaults to production when unset or production', () => {
    expect(url({})).toBe('https://api.konf.app/graphql')
    expect(url({ VERCEL_ENV: 'production' })).toBe(
      'https://api.konf.app/graphql',
    )
  })
  it('is null on preview and development without the var', () => {
    expect(url({ VERCEL_ENV: 'preview' })).toBeNull()
    expect(url({ VERCEL_ENV: 'development' })).toBeNull()
  })
  it('the var wins everywhere', () => {
    expect(
      url({ VERCEL_ENV: 'preview', KONF_API_URL: 'https://p.example/graphql' }),
    ).toBe('https://p.example/graphql')
  })
})
