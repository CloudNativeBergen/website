/**
 * @vitest-environment node
 *
 * kontroll#79: the site end of createOrganization. Only a tenant-directory
 * assertion over the exact body reaches provisionOrganization.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))
const provisionOrganization = vi.fn()
vi.mock('@/lib/onboarding/provision', () => ({
  provisionOrganization: (...a: unknown[]) => provisionOrganization(...a),
}))
vi.mock('@/lib/provisioning/rateLimit', () => ({
  chargeProvisioningCreate: async () => true,
}))

const { SignJWT, exportSPKI, generateKeyPair } = await import('jose')
const { POST } = await import('./route')
const { bodyHash } = await import('@/lib/provisioning/service')

const BODY = JSON.stringify({
  idempotencyKey: 'create-key-00001',
  input: {
    name: 'Nova',
    slug: 'nova',
    conferenceTitle: 'Nova 2027',
    startDate: '2027-05-01',
    endDate: '2027-05-02',
    domain: null,
    ownerEmail: 'owner@nova.org',
  },
})
let key: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA')
  key = pair.privateKey
  otherKey = (await generateKeyPair('EdDSA')).privateKey
  process.env.TENANT_DIRECTORY_PUBLIC_KEYS = JSON.stringify({
    td1: await exportSPKI(pair.publicKey),
  })
})

beforeEach(() => {
  provisionOrganization.mockResolvedValue({
    ok: true,
    organizationId: 'organization.nova',
    conferenceId: 'conf_1',
    replayed: false,
  })
})

const sign = (
  over: { body?: string; iss?: string; aud?: string; with?: CryptoKey } = {},
) => {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ bh: bodyHash(over.body ?? BODY) })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'td1' })
    .setIssuer(over.iss ?? 'konf-tenant-directory')
    .setAudience(over.aud ?? 'konf-site-provisioning')
    .setSubject('op_1')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(over.with ?? key)
}
const post = (assertion?: string, body = BODY) =>
  POST(
    new NextRequest(
      'https://site.test/api/provisioning/service/organizations',
      {
        method: 'POST',
        headers: assertion ? { 'x-konf-service': assertion } : {},
        body,
      },
    ),
  )

describe('POST /api/provisioning/service/organizations', () => {
  it('creates with the operator recorded', async () => {
    const res = await post(await sign())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      organizationId: 'organization.nova',
      conferenceId: 'conf_1',
      replayed: false,
    })
    expect(provisionOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: expect.objectContaining({ slug: 'nova' }),
        organizer: { name: 'owner@nova.org', email: 'owner@nova.org' },
        domains: [],
      }),
      { idempotencyKey: 'create-key-00001', createdBy: 'op_1' },
    )
  })

  it.each<[string, () => Promise<string | undefined>]>([
    ['no assertion', async () => undefined],
    ['an assertion over another body', () => sign({ body: '{}' })],
    ['a key the site does not hold', () => sign({ with: otherKey })],
    ['the site->gateway issuer', () => sign({ iss: 'konf-site' })],
    ['the gateway audience', () => sign({ aud: 'konf-gateway' })],
  ])('refuses %s before provisioning', async (_, assertion) => {
    const res = await post(await assertion())
    expect(res.status).toBe(401)
    expect(provisionOrganization).not.toHaveBeenCalled()
  })

  it('refuses everyone when TENANT_DIRECTORY_PUBLIC_KEYS is unset', async () => {
    const keys = process.env.TENANT_DIRECTORY_PUBLIC_KEYS
    delete process.env.TENANT_DIRECTORY_PUBLIC_KEYS
    try {
      expect((await post(await sign())).status).toBe(401)
    } finally {
      process.env.TENANT_DIRECTORY_PUBLIC_KEYS = keys
    }
    expect(provisionOrganization).not.toHaveBeenCalled()
  })

  it('maps a taken slug to 409 with its code', async () => {
    provisionOrganization.mockResolvedValue({
      ok: false,
      rejection: { code: 'slug_taken', slug: 'nova' },
    })
    const res = await post(await sign())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', code: 'slug_taken' })
  })

  it('rejects input the wizard schema rejects, before provisioning', async () => {
    const body = BODY.replace('owner@nova.org', 'nope')
    const res = await post(await sign({ body }), body)
    expect(res.status).toBe(400)
    expect(provisionOrganization).not.toHaveBeenCalled()
  })
})
