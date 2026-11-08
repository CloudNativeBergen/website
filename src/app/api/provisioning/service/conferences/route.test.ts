/**
 * @vitest-environment node
 *
 * kontroll#85: the site end of provisionConference. Only a tenant-directory
 * assertion over the exact body reaches the edition write, and the source
 * edition is always one of the body's own org.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { TRPCError } from '@trpc/server'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))
const createEditionFromSource = vi.fn()
vi.mock('@/server/routers/conference', () => ({
  createEditionFromSource: (...a: unknown[]) => createEditionFromSource(...a),
}))
const fetchSanity = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchSanity(...a) },
}))
vi.mock('@/lib/provisioning/rateLimit', () => ({
  chargeProvisioningCreate: async () => true,
}))

const { SignJWT, exportSPKI, generateKeyPair } = await import('jose')
const { POST } = await import('./route')
const { bodyHash } = await import('@/lib/provisioning/service')

const body = (input: Record<string, unknown> = {}) =>
  JSON.stringify({
    idempotencyKey: 'edition-key-00001',
    orgId: 'organization.nova',
    input: {
      title: 'Nova 2028',
      startDate: '2028-05-01',
      endDate: '2028-05-02',
      ...input,
    },
  })
let key: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA')
  key = pair.privateKey
  process.env.TENANT_DIRECTORY_PUBLIC_KEYS = JSON.stringify({
    td1: await exportSPKI(pair.publicKey),
  })
  process.env.AUTH_SECRET ??= 'test-secret'
})

beforeEach(() => {
  fetchSanity.mockImplementation(
    async (query: string, p: { copyFrom: string | null }) =>
      // The org's own editions: conf_latest, conf_2027.
      p.copyFrom
        ? p.copyFrom === 'conf_2027'
          ? 'conf_2027'
          : null
        : 'conf_latest',
  )
  createEditionFromSource.mockResolvedValue({
    conferenceId: 'conf_new',
    domains: ['nova-2028.konf.run'],
    summary: {},
  })
})

const post = async (raw = body()) => {
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ bh: bodyHash(raw) })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'td1' })
    .setIssuer('konf-tenant-directory')
    .setAudience('konf-site-provisioning')
    .setSubject('u_1')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(key)
  return POST(
    new NextRequest('https://site.test/api/provisioning/service/conferences', {
      method: 'POST',
      headers: { 'x-konf-service': assertion },
      body: raw,
    }),
  )
}

describe('POST /api/provisioning/service/conferences', () => {
  it("without copyFrom, clones nothing from the org's latest edition, under an edition receipt", async () => {
    const res = await post()
    expect(await res.json()).toEqual({
      conferenceId: 'conf_new',
      domains: ['nova-2028.konf.run'],
      replayed: false,
    })
    const [source, input, receipt] = createEditionFromSource.mock.calls[0]
    expect(source).toBe('conf_latest')
    expect(input.domains).toEqual([])
    expect(Object.values(input.clone).every((v) => v === false)).toBe(true)
    expect(receipt).toMatchObject({
      id: expect.stringMatching(/^provisioningRequest\./),
      organizationId: 'organization.nova',
      createdBy: 'u_1',
    })
  })

  it('copyFrom of an own edition clones every family from it', async () => {
    await post(body({ copyFrom: 'conf_2027', domain: 'nova.example' }))
    const [source, input] = createEditionFromSource.mock.calls[0]
    expect(source).toBe('conf_2027')
    expect(input.domains).toEqual(['nova.example'])
    expect(Object.values(input.clone).every((v) => v === true)).toBe(true)
  })

  it('copyFrom outside the org is 409 copy_from_not_in_org with nothing written', async () => {
    const res = await post(body({ copyFrom: 'conf_other_org' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'conflict',
      code: 'copy_from_not_in_org',
    })
    expect(fetchSanity.mock.calls[0][0]).toContain(
      '_id == $copyFrom && organization._ref == $orgId',
    )
    expect(fetchSanity.mock.calls[0][1]).toMatchObject({
      orgId: 'organization.nova',
      copyFrom: 'conf_other_org',
    })
    expect(createEditionFromSource).not.toHaveBeenCalled()
  })

  it('refuses without an assertion before any read', async () => {
    const res = await POST(
      new NextRequest('https://site.test/x', { method: 'POST', body: body() }),
    )
    expect(res.status).toBe(401)
    expect(fetchSanity).not.toHaveBeenCalled()
  })

  it.each([
    [new TRPCError({ code: 'CONFLICT', message: 'x' }), 'idempotency_conflict'],
    [
      new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Already used by another conference: nova.example',
      }),
      'domain_claimed',
    ],
  ])('maps %s to 409 %s', async (error, code) => {
    createEditionFromSource.mockRejectedValue(error)
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe(code)
  })
})
