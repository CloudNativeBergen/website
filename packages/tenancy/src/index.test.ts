import { describe, it, expect, vi, beforeAll } from 'vitest'
import { SignJWT, importPKCS8 } from 'jose'
import {
  AttemptLimitError,
  ENVELOPE_HEADER,
  ScopedRepository,
  countAttempt,
  createSigner,
  envelopeFromRequest,
  generateEnvelopeKeyPair,
  unscopedForPlatformOps,
  verifyEnvelope,
  type Envelope,
  type PlatformContext,
  type TenantEnvelope,
} from './index'

// vitest.config.ts aliases `jose` to a stub that ignores keys. Load the real
// package (same technique as __tests__/lib/openbadges/jwt-real-crypto.test.ts)
// so a forged signature is actually observable here.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const tenant: TenantEnvelope = {
  typ: 'tenant',
  orgId: 'org_a',
  conferenceId: 'conf_a',
  userId: 'user_1',
  orgRole: 'admin',
  scopes: [],
}
const platform: PlatformContext = {
  typ: 'platform',
  userId: 'op_1',
  platformRole: 'operator',
}

let keys: { privatePem: string; publicPem: string }
let otherKeys: { privatePem: string; publicPem: string }
beforeAll(async () => {
  keys = await generateEnvelopeKeyPair()
  otherKeys = await generateEnvelopeKeyPair()
})

const requestWith = (token?: string) =>
  new Request('https://internal/graphql', {
    headers: token ? { [ENVELOPE_HEADER]: token } : {},
  })

describe('envelope verification', () => {
  it('accepts a valid envelope and returns its claims', async () => {
    const token = await (await createSigner(keys.privatePem)).sign(tenant)
    const result = await envelopeFromRequest(requestWith(token), keys.publicPem)
    expect(result).toEqual({ envelope: tenant })
  })

  it('rejects a missing envelope with 401', async () => {
    const result = await envelopeFromRequest(requestWith(), keys.publicPem)
    expect('response' in result && result.response.status).toBe(401)
  })

  it('rejects a forged envelope (signed by another key) with 403', async () => {
    const token = await (await createSigner(otherKeys.privatePem)).sign(tenant)
    const result = await envelopeFromRequest(requestWith(token), keys.publicPem)
    expect('response' in result && result.response.status).toBe(403)
  })

  it('rejects an expired envelope with 403', async () => {
    const token = await (await createSigner(keys.privatePem)).sign(tenant, -10)
    const result = await envelopeFromRequest(requestWith(token), keys.publicPem)
    expect('response' in result && result.response.status).toBe(403)
  })

  it('rejects a correctly signed envelope with no expiry', async () => {
    const key = await importPKCS8(keys.privatePem, 'EdDSA')
    const token = await new SignJWT({ ...tenant })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('konf-gateway')
      .setAudience('konf-subgraphs')
      .setIssuedAt()
      .sign(key)
    await expect(verifyEnvelope(token, keys.publicPem)).rejects.toThrow(/exp/)
  })

  it('rejects a signed envelope of unknown shape', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign({
      ...tenant,
      typ: 'wildcard',
    } as unknown as Envelope)
    await expect(verifyEnvelope(token, keys.publicPem)).rejects.toThrow(/shape/)
  })

  it('drops claims outside the envelope shape', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign({ ...platform, orgId: 'org_b' } as never)
    expect(await verifyEnvelope(token, keys.publicPem)).toEqual(platform)
  })
})

class TalksRepo extends ScopedRepository {
  constructor(
    envelope: Envelope,
    readonly db: { get: (id: string) => string },
  ) {
    super(envelope)
  }
  get(orgId: string, conferenceId: string, id: string) {
    this.assertTenant({ orgId, conferenceId })
    return this.db.get(id)
  }
}

describe('ScopedRepository', () => {
  it('refuses a PlatformContext', () => {
    expect(() => new TalksRepo(platform, { get: vi.fn() })).toThrow(
      /PlatformContext/,
    )
  })

  it('serves its own tenant', () => {
    const repo = new TalksRepo(tenant, { get: () => 'talk' })
    expect(repo.get('org_a', 'conf_a', 't1')).toBe('talk')
  })

  it.each([
    ['org_b', 'conf_a'],
    ['org_a', 'conf_b'],
  ])(
    'refuses foreign ids (%s/%s) before touching the db',
    (orgId, conferenceId) => {
      const get = vi.fn(() => 'talk')
      const repo = new TalksRepo(tenant, { get })
      expect(() => repo.get(orgId, conferenceId, 't1')).toThrow(/cross-tenant/)
      expect(get).not.toHaveBeenCalled()
    },
  )

  it('refuses a conference id under an org-level envelope', () => {
    const get = vi.fn(() => 'talk')
    const repo = new TalksRepo({ ...tenant, conferenceId: null }, { get })
    expect(() => repo.get('org_a', 'conf_a', 't1')).toThrow(/cross-tenant/)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('unscopedForPlatformOps', () => {
  it('refuses a tenant envelope without opening anything', () => {
    const open = vi.fn()
    expect(() =>
      unscopedForPlatformOps(tenant as never, 'x', vi.fn(), open),
    ).toThrow(/PlatformContext/)
    expect(open).not.toHaveBeenCalled()
  })

  it('audits before opening', () => {
    const order: string[] = []
    const result = unscopedForPlatformOps(
      platform,
      'incident-42',
      (entry) => order.push(`audit:${entry.actor}:${entry.reason}`),
      () => (order.push('open'), 'db'),
    )
    expect(result).toBe('db')
    expect(order).toEqual(['audit:op_1:incident-42', 'open'])
  })
})

describe('countAttempt', () => {
  const limiter = (success: boolean) => ({
    limit: vi.fn(async () => ({ success })),
  })

  it('keys the attempt on tenant, scope and subject', async () => {
    const l = limiter(true)
    await countAttempt(l, tenant, 'invite', 'user_1')
    expect(l.limit).toHaveBeenCalledWith({ key: 'org_a|conf_a|invite|user_1' })
  })

  it('throws once the limiter says no', async () => {
    await expect(
      countAttempt(limiter(false), tenant, 'invite', 'user_1'),
    ).rejects.toBeInstanceOf(AttemptLimitError)
  })

  it('refuses a PlatformContext without spending an attempt', async () => {
    const l = limiter(true)
    await expect(countAttempt(l, platform, 'invite', 'x')).rejects.toThrow(
      /PlatformContext/,
    )
    expect(l.limit).not.toHaveBeenCalled()
  })
})
