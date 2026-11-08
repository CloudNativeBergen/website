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
  type UserContext,
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
const user: UserContext = { typ: 'user', userId: 'user_1' }

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
    expect(result).toEqual({ envelope: { ...tenant, plan: 'free' } })
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

  it('rejects an envelope with a ten-year lifetime', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign(tenant, 10 * 365 * 24 * 3600)
    await expect(verifyEnvelope(token, keys.publicPem)).rejects.toThrow(
      /lifetime/,
    )
  })

  it('rejects an envelope issued in the future', async () => {
    const key = await importPKCS8(keys.privatePem, 'EdDSA')
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ ...tenant })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('konf-gateway')
      .setAudience('konf-subgraphs')
      .setIssuedAt(now + 120)
      .setExpirationTime(now + 180)
      .sign(key)
    await expect(verifyEnvelope(token, keys.publicPem)).rejects.toThrow(/iat/)
  })

  it('rejects a signed envelope of unknown shape', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign({
      ...tenant,
      typ: 'wildcard',
    } as unknown as Envelope)
    await expect(verifyEnvelope(token, keys.publicPem)).rejects.toThrow(/shape/)
  })

  it('round-trips a UserContext and drops any org it was signed with', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign({ ...user, orgId: 'org_b' } as never)
    expect(await verifyEnvelope(token, keys.publicPem)).toEqual(user)
    const blank = await signer.sign({ typ: 'user', userId: '' } as never)
    await expect(verifyEnvelope(blank, keys.publicPem)).rejects.toThrow(/shape/)
  })

  it('drops claims outside the envelope shape', async () => {
    const signer = await createSigner(keys.privatePem)
    const token = await signer.sign({ ...platform, orgId: 'org_b' } as never)
    expect(await verifyEnvelope(token, keys.publicPem)).toEqual(platform)
  })
})

type Where = { org_id: string; conference_id: string | null }

class TalksRepo extends ScopedRepository {
  constructor(
    envelope: Envelope,
    readonly db: { query: (where: Where, id?: string) => string },
  ) {
    super(envelope)
  }
  /** Tenant columns come from the envelope; the caller gives none. */
  list() {
    return this.db.query(this.columns)
  }
  /** An entity reference that arrived with ids attached. */
  resolveReference(ref: {
    orgId: string
    conferenceId: string | null
    id: string
  }) {
    this.assertTenant(ref)
    return this.db.query(this.columns, ref.id)
  }
}

describe('ScopedRepository', () => {
  // #1954: a GraphQL FORBIDDEN, so Yoga passes it through instead of masking
  // it as "Unexpected error.".
  it.each([
    ['a PlatformContext', () => platform],
    ['a UserContext', () => user],
  ])('refuses %s with code FORBIDDEN', (_, envelope) => {
    let thrown: unknown
    try {
      new TalksRepo(envelope(), { query: vi.fn() })
    } catch (e) {
      thrown = e
    }
    expect(
      (thrown as { extensions?: { code?: string } })?.extensions?.code,
    ).toBe('FORBIDDEN')
  })

  it('refuses a PlatformContext', () => {
    expect(() => new TalksRepo(platform, { query: vi.fn() })).toThrow(
      /PlatformContext/,
    )
  })

  it('refuses a UserContext (#2036)', () => {
    expect(() => new TalksRepo(user, { query: vi.fn() })).toThrow(
      /TenantEnvelope/,
    )
  })

  it('filters on the envelope tenant, not on caller input', () => {
    const query = vi.fn(() => 'talks')
    new TalksRepo(tenant, { query }).list()
    expect(query).toHaveBeenCalledWith({
      org_id: 'org_a',
      conference_id: 'conf_a',
    })
  })

  it('keeps conference_id null (not absent) under an org-level envelope', () => {
    const query = vi.fn(() => 'talks')
    new TalksRepo({ ...tenant, conferenceId: null }, { query }).list()
    expect(query).toHaveBeenCalledWith({ org_id: 'org_a', conference_id: null })
  })

  it('serves a reference to its own tenant', () => {
    const repo = new TalksRepo(tenant, { query: () => 'talk' })
    expect(
      repo.resolveReference({
        orgId: 'org_a',
        conferenceId: 'conf_a',
        id: 't',
      }),
    ).toBe('talk')
  })

  it.each([
    ['org_b', 'conf_a'],
    ['org_a', 'conf_b'],
    ['org_a', null],
  ])(
    'refuses foreign ids (%s/%s) before touching the db',
    (orgId, conferenceId) => {
      const query = vi.fn(() => 'talk')
      const repo = new TalksRepo(tenant, { query })
      expect(() =>
        repo.resolveReference({ orgId, conferenceId, id: 't' }),
      ).toThrow(/cross-tenant/)
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('does not widen to the org when conferenceId is left out', () => {
    const query = vi.fn(() => 'talk')
    const repo = new TalksRepo(tenant, { query })
    expect(() =>
      repo.resolveReference({ orgId: 'org_a', id: 't' } as never),
    ).toThrow(/cross-tenant/)
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses a conference id under an org-level envelope', () => {
    const query = vi.fn(() => 'talk')
    const repo = new TalksRepo({ ...tenant, conferenceId: null }, { query })
    expect(() =>
      repo.resolveReference({
        orgId: 'org_a',
        conferenceId: 'conf_a',
        id: 't',
      }),
    ).toThrow(/cross-tenant/)
    expect(query).not.toHaveBeenCalled()
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

  it('refuses a UserContext without opening anything', () => {
    const open = vi.fn()
    expect(() =>
      unscopedForPlatformOps(user as never, 'x', vi.fn(), open),
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
  /** A real counter: `max` attempts per key, then no. */
  const counting = (max: number) => {
    const seen = new Map<string, number>()
    return {
      limit: vi.fn(async ({ key }: { key: string }) => {
        seen.set(key, (seen.get(key) ?? 0) + 1)
        return { success: seen.get(key)! <= max }
      }),
    }
  }
  const anon = { ...tenant, userId: null }

  it('keys a signed-in caller on the user id', async () => {
    const l = limiter(true)
    await countAttempt(l, tenant, 'invite', '203.0.113.9')
    expect(l.limit).toHaveBeenCalledWith({
      key: 'org_a|conf_a|invite|user:user_1',
    })
  })

  it('keys an anonymous caller on the client IP', async () => {
    const l = limiter(true)
    await countAttempt(l, anon, 'invite', '203.0.113.9')
    expect(l.limit).toHaveBeenCalledWith({
      key: 'org_a|conf_a|invite|ip:203.0.113.9',
    })
  })

  it('refuses a caller with neither user nor IP, spending nothing', async () => {
    const l = limiter(true)
    await expect(countAttempt(l, anon, 'invite', null)).rejects.toThrow(
      /user or a client IP/,
    )
    expect(l.limit).not.toHaveBeenCalled()
  })

  it('makes different guessed codes from one caller share one counter', async () => {
    const l = counting(2)
    const redeem = async (code: string) => {
      await countAttempt(l, anon, 'invite', '203.0.113.9')
      return code
    }
    await redeem('AAAA')
    await redeem('BBBB')
    await expect(redeem('CCCC')).rejects.toBeInstanceOf(AttemptLimitError)
    // A different caller still has its own budget.
    await expect(
      countAttempt(l, anon, 'invite', '198.51.100.1'),
    ).resolves.toBeUndefined()
  })

  it('throws once the limiter says no', async () => {
    await expect(
      countAttempt(limiter(false), tenant, 'invite', null),
    ).rejects.toBeInstanceOf(AttemptLimitError)
  })

  it('refuses a PlatformContext without spending an attempt', async () => {
    const l = limiter(true)
    await expect(countAttempt(l, platform, 'invite', 'x')).rejects.toThrow(
      /PlatformContext/,
    )
    expect(l.limit).not.toHaveBeenCalled()
  })

  it('refuses a UserContext without spending an attempt', async () => {
    const l = limiter(true)
    await expect(countAttempt(l, user, 'invite', 'x')).rejects.toThrow(
      /TenantEnvelope/,
    )
    expect(l.limit).not.toHaveBeenCalled()
  })
})
