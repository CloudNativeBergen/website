// Operator CLI token (#2168) against a real D1 (Miniflare) and real Better Auth.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth } from './data'
import { mintOperatorCliToken } from './cli-token'

// vitest.config.ts aliases `jose` to a key-ignoring stub; load the real one so
// the signature and expiry checks below prove something (as identity.test.ts).
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const BASE = 'http://identity.test'
const OPS = 'https://my.konf.app'
let env: Parameters<typeof mintOperatorCliToken>[1]
let mf: Miniflare
const limited = new Map<string, number>()

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['DB'],
    }),
  )
  const DB = (await mf.getD1Database('DB')) as unknown as D1Database
  const dir = join(import.meta.dirname, '../migrations')
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join(';\n')
  for (const stmt of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())) {
    if (stmt) await DB.prepare(stmt).run()
  }
  env = {
    DB,
    OPERATOR_ORIGINS: OPS,
    BETTER_AUTH_URL: BASE,
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
    // 20 per key, as wrangler.jsonc gives HANDOFF_IP_LIMIT.
    HANDOFF_IP_LIMIT: {
      limit: async ({ key }: { key: string }) => {
        limited.set(key, (limited.get(key) ?? 0) + 1)
        return { success: limited.get(key)! <= 20 }
      },
    },
  } as unknown as typeof env
  // Better Auth creates its signing key on first use (any get-session call
  // does); create it up front so "no write" below means no write of ours.
  await createAuth(DB, env).handler(new Request(`${BASE}/api/auth/jwks`))
})
afterAll(() => mf?.dispose())

const ctx = () => createAuth(env.DB, env).$context

/** A user with a session handed off to `origin`; its signed bearer. */
async function sessionFor(operator: boolean, origin = OPS) {
  const c = await ctx()
  const u = await c.internalAdapter.createUser(
    { email: `${crypto.randomUUID()}@x.test`, name: 'T', emailVerified: true },
    { method: 'admin' },
  )
  await env.DB.prepare('UPDATE user SET platformOperator = ? WHERE id = ?')
    .bind(operator ? 1 : 0, u.id)
    .run()
  const { token } = await c.internalAdapter.createSession(u.id, false)
  await env.DB.prepare('UPDATE session SET origin = ? WHERE token = ?')
    .bind(origin, token)
    .run()
  return {
    userId: u.id,
    token,
    bearer: `${token}.${await makeSignature(token, c.secret)}`,
  }
}

const mint = (bearer: string, headers: Record<string, string> = {}) =>
  mintOperatorCliToken(
    new Request(`${BASE}/operator/cli-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, ...headers },
    }),
    env,
  )

const n = async (q: string, ...b: unknown[]) =>
  (await env.DB.prepare(q)
    .bind(...b)
    .first<{ n: number }>())!.n

/** Rows anything could have written: audit and signing keys. */
const writes = async () =>
  (await n('SELECT count(*) AS n FROM audit_event')) +
  (await n('SELECT count(*) AS n FROM jwks'))

async function refused(res: Response) {
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ error: 'forbidden' })
}

/** Verifies exactly as the gateway's verifyIdentity does (api/src/gateway.ts). */
async function gatewayVerify(token: string) {
  const res = await createAuth(env.DB, env).handler(
    new Request(`${BASE}/api/auth/jwks`),
  )
  const { payload } = await jwtVerify(
    token,
    createLocalJWKSet(await res.json()),
    {
      issuer: 'https://id.test',
      audience: 'konf-gateway',
      algorithms: ['EdDSA'],
      requiredClaims: ['sub', 'exp', 'iat'],
      maxTokenAge: 300,
      clockTolerance: 5,
    },
  )
  return payload
}

describe('mintOperatorCliToken', () => {
  it('mints a 5-minute gateway JWT with the cli marker for an operator', async () => {
    const { userId, bearer } = await sessionFor(true)
    const res = await mint(bearer)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { token } = (await res.json()) as { token: string }
    const p = await gatewayVerify(token)
    expect(p.sub).toBe(userId)
    expect(p.origin).toBe(OPS)
    expect(p.cli).toBe(true)
    expect(p.exp! - p.iat!).toBe(300)
    expect(typeof p.jti).toBe('string')
  })

  it('refuses a non-operator before any write', async () => {
    const { bearer } = await sessionFor(false)
    const before = await writes()
    await refused(await mint(bearer))
    expect(await writes()).toBe(before)
  })

  it('refuses a revoked operator and a revoked session', async () => {
    const op = await sessionFor(true)
    await env.DB.prepare('UPDATE user SET platformOperator = 0 WHERE id = ?')
      .bind(op.userId)
      .run()
    const s = await sessionFor(true)
    await env.DB.prepare('DELETE FROM session WHERE token = ?')
      .bind(s.token)
      .run()
    const before = await writes()
    await refused(await mint(op.bearer))
    await refused(await mint(s.bearer))
    expect(await writes()).toBe(before)
  })

  it('refuses an operator session handed off to a tenant site', async () => {
    const { bearer } = await sessionFor(true, 'https://conf.example')
    await refused(await mint(bearer))
  })

  it('refuses a CLI token as the credential: it cannot mint another', async () => {
    const { bearer } = await sessionFor(true)
    const { token } = (await (await mint(bearer)).json()) as { token: string }
    const before = await writes()
    await refused(await mint(token))
    // Even next to a valid session cookie: a JWT credential never mints.
    const c = await ctx()
    const cookie = `${c.authCookies.sessionToken.name}=${bearer}`
    await refused(
      await mintOperatorCliToken(
        new Request(`${BASE}/operator/cli-token`, {
          method: 'POST',
          headers: { cookie, authorization: `Bearer ${token}` },
        }),
        env,
      ),
    )
    expect(await writes()).toBe(before)
  })

  it('audits jti, expiry and actor, and never stores or logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    )
    try {
      const { userId, bearer } = await sessionFor(true)
      const { token } = (await (await mint(bearer)).json()) as {
        token: string
      }
      const { jti, exp } = await gatewayVerify(token)
      const row = await env.DB.prepare(
        "SELECT userId, origin, detail FROM audit_event WHERE action = 'operator.cli_token.mint' AND userId = ?",
      )
        .bind(userId)
        .first<{ userId: string; origin: string; detail: string }>()
      expect(row).toEqual({
        userId,
        origin: OPS,
        detail: JSON.stringify({ jti, exp }),
      })
      const all = await env.DB.prepare('SELECT * FROM audit_event').all()
      const sig = token.split('.')[2]!
      expect(JSON.stringify(all.results)).not.toContain(sig)
      const logged = spies
        .flatMap((s) => s.mock.calls)
        .flat()
        .map(String)
      expect(logged.join('\n')).not.toContain(sig)
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
  })

  it('rate-limits minting per user (#2171)', async () => {
    const a = await sessionFor(true)
    for (let i = 0; i < 20; i++) expect((await mint(a.bearer)).status).toBe(200)
    const before = await writes()
    const res = await mint(a.bearer)
    expect(res.status).toBe(429)
    expect(await writes()).toBe(before)
    // Another operator has their own budget.
    expect((await mint((await sessionFor(true)).bearer)).status).toBe(200)
  })

  it('mints from identity itself and from an operator origin', async () => {
    const { bearer } = await sessionFor(true)
    expect((await mint(bearer, { origin: OPS })).status).toBe(200)
    expect((await mint(bearer, { origin: BASE })).status).toBe(200)
    expect(
      (await mint(bearer, { 'sec-fetch-site': 'same-origin' })).status,
    ).toBe(200)
  })

  it.each([
    ['a tenant Origin', { origin: 'https://conf.example' }],
    ['a cross-site fetch with no Origin', { 'sec-fetch-site': 'cross-site' }],
  ])(
    'refuses an operator session posting from %s, nothing written (#2171)',
    async (_, headers) => {
      const { bearer } = await sessionFor(true)
      const before = await writes()
      await refused(await mint(bearer, headers))
      expect(await writes()).toBe(before)
    },
  )

  it('mints for a cookie-only session (#2171)', async () => {
    const { userId, bearer } = await sessionFor(true)
    const c = await ctx()
    const res = await mintOperatorCliToken(
      new Request(`${BASE}/operator/cli-token`, {
        method: 'POST',
        headers: { cookie: `${c.authCookies.sessionToken.name}=${bearer}` },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const { token } = (await res.json()) as { token: string }
    expect((await gatewayVerify(token)).sub).toBe(userId)
  })

  it('refuses a two-part bearer that is no session (#2171)', async () => {
    const before = await writes()
    await refused(await mint('not-a-session.not-a-signature'))
    expect(await writes()).toBe(before)
  })

  it('refuses GET', async () => {
    const res = await mintOperatorCliToken(
      new Request(`${BASE}/operator/cli-token`),
      env,
    )
    expect(res.status).toBe(405)
  })
})
