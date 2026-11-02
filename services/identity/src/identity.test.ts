// Runs Better Auth against a real D1 (Miniflare) with the shipped migration.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { handleOAuthUserInfo } from 'better-auth/oauth2'
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth, createData, type AuthEnv } from './data'
import { JWT_AUDIENCE, JWT_TTL_SECONDS } from './data/auth'

// vitest.config.ts aliases `jose` to a key-ignoring stub; load the real one
// so the signature check below proves something (as in packages/tenancy).
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const BASE = 'http://identity.test'
const env: AuthEnv = {
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
}

let mf: Miniflare
let d1: D1Database
let auth: ReturnType<typeof createAuth>

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['DB'],
    }),
  )
  d1 = (await mf.getD1Database('DB')) as unknown as D1Database
  const sql = readFileSync(
    join(import.meta.dirname, '../migrations/0001_init.sql'),
    'utf8',
  )
  for (const stmt of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())) {
    if (stmt) await d1.prepare(stmt).run()
  }
  auth = createAuth(d1, env)
})
afterAll(() => mf?.dispose())

async function newUser(email: string, emailVerified: boolean) {
  const ctx = await auth.$context
  return ctx.internalAdapter.createUser(
    { email, name: 'Test', emailVerified },
    { method: 'admin' },
  )
}

async function sessionCookie(userId: string) {
  const ctx = await auth.$context
  const { token } = await ctx.internalAdapter.createSession(userId, false)
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return `${ctx.authCookies.sessionToken.name}=${signed}`
}

describe('identity JWT', () => {
  it('is EdDSA, at most 5 minutes, verifiable against the JWKS, no email', async () => {
    const u = await newUser('jwt@example.com', true)
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/token`, {
        headers: { cookie: await sessionCookie(u.id) },
      }),
    )
    expect(res.status).toBe(200)
    const { token } = (await res.json()) as { token: string }

    const jwks = (await (
      await auth.handler(new Request(`${BASE}/api/auth/jwks`))
    ).json()) as {
      keys: { kty: string; crv: string; d?: string }[]
    }
    expect(jwks.keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519' })
    expect(jwks.keys[0]).not.toHaveProperty('d')

    expect(decodeProtectedHeader(token).alg).toBe('EdDSA')
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(jwks as never),
      {
        issuer: BASE,
        audience: JWT_AUDIENCE,
      },
    )
    expect(payload.sub).toBe(u.id)
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(JWT_TTL_SECONDS)
    expect(JSON.stringify(payload)).not.toContain('jwt@example.com')
  })
})

describe('principal lookup', () => {
  it('returns the live org role and the operator flag', async () => {
    const u = await newUser('member@example.com', true)
    const other = await newUser('outsider@example.com', true)
    await d1
      .prepare(
        "INSERT INTO organization (id, name, slug) VALUES ('org-a', 'A', 'a')",
      )
      .run()
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES ('m1', 'org-a', ?, 'admin')",
      )
      .bind(u.id)
      .run()
    await d1
      .prepare('UPDATE user SET platformOperator = 1 WHERE id = ?')
      .bind(other.id)
      .run()

    const data = createData(d1)
    expect(await data.principal(u.id, 'org-a')).toEqual({
      orgRole: 'admin',
      platformOperator: false,
    })
    expect(await data.principal(u.id, 'org-b')).toEqual({
      orgRole: null,
      platformOperator: false,
    })
    expect(await data.principal(other.id, 'org-a')).toEqual({
      orgRole: null,
      platformOperator: true,
    })
    expect(await data.principal('nobody', 'org-a')).toBeNull()
  })
})

describe('ensureOrganization', () => {
  it('creates the directory-owned id once; a repeat is a no-op', async () => {
    const data = createData(d1)
    await data.ensureOrganization('org-dir', 'dir')
    await data.ensureOrganization('org-dir', 'dir')
    const { results } = await d1
      .prepare("SELECT id, slug FROM organization WHERE id = 'org-dir'")
      .all()
    expect(results).toEqual([{ id: 'org-dir', slug: 'dir' }])
    await expect(data.ensureOrganization('org-other', 'dir')).rejects.toThrow()
  })
})

describe('account linking (#807)', () => {
  const signIn = async (
    email: string,
    emailVerified: boolean,
    accountId: string,
    providerId = 'linkedin',
  ) =>
    handleOAuthUserInfo({ context: await auth.$context } as never, {
      userInfo: { id: accountId, email, name: 'Test', emailVerified },
      account: { providerId, accountId },
      callbackURL: '/',
    })

  it('refuses to link on an unverified provider email', async () => {
    await newUser('victim@example.com', true)
    expect(
      await signIn('victim@example.com', false, 'li-attacker'),
    ).toMatchObject({
      error: 'account not linked',
    })
  })

  it('refuses to link onto a local email that is not verified', async () => {
    await newUser('squatted@example.com', false)
    expect(
      await signIn('squatted@example.com', true, 'li-owner'),
    ).toMatchObject({
      error: 'account not linked',
    })
  })

  it('audits sign-up as created, a second provider as linked, ids only', async () => {
    const first = await signIn('owner@example.com', true, 'gh-real', 'github')
    expect(first.error).toBeFalsy()
    const second = await signIn('owner@example.com', true, 'li-real')
    expect(second.error).toBeFalsy()
    const userId = first.data!.user.id
    expect(second.data!.user.id).toBe(userId)
    const { results } = await d1
      .prepare(
        "SELECT action, userId, providerId FROM audit_event WHERE action LIKE 'account.%' AND userId = ? ORDER BY id",
      )
      .bind(userId)
      .all()
    expect(results).toEqual([
      { action: 'account.created', userId, providerId: 'github' },
      { action: 'account.linked', userId, providerId: 'linkedin' },
    ])
    expect(JSON.stringify(results)).not.toContain('@')
  })
})

describe('organization updates', () => {
  it('refuses slug and name changes, allows the rest', async () => {
    const u = await newUser('orgowner@example.com', true)
    await createData(d1).ensureOrganization('org-u', 'u')
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-u', 'org-u', ?, 'owner')",
      )
      .bind(u.id)
      .run()
    const update = async (data: Record<string, string>) =>
      auth.handler(
        new Request(`${BASE}/api/auth/organization/update`, {
          method: 'POST',
          headers: {
            cookie: await sessionCookie(u.id),
            origin: BASE,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ organizationId: 'org-u', data }),
        }),
      )
    expect((await update({ slug: 'stolen' })).status).toBe(403)
    expect((await update({ name: 'Renamed' })).status).toBe(403)
    expect((await update({ logo: 'https://x.test/l.png' })).status).toBe(200)
    const { results } = await d1
      .prepare("SELECT slug, name FROM organization WHERE id = 'org-u'")
      .all()
    expect(results).toEqual([{ slug: 'u', name: 'u' }])
  })
})
