// Runs Better Auth against a real D1 (Miniflare) with the shipped migration.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { handleOAuthUserInfo, linkOAuthAccount } from 'better-auth/oauth2'
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth, createData, type AuthEnv, type DataEnv } from './data'
import { JWT_AUDIENCE, JWT_TTL_SECONDS } from './data/auth'
import { accountPage } from './account-page'

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
  IDENTITY_ISSUER: 'https://id.test',
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
  const dir = join(import.meta.dirname, '../migrations')
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join(';\n')
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
        issuer: 'https://id.test',
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

    const data = createData({ DB: d1 } as DataEnv)
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
    const data = createData({ DB: d1 } as DataEnv)
    await data.ensureOrganization('org-dir', 'dir')
    await data.ensureOrganization('org-dir', 'dir')
    const { results } = await d1
      .prepare("SELECT id, slug FROM organization WHERE id = 'org-dir'")
      .all()
    expect(results).toEqual([{ id: 'org-dir', slug: 'dir' }])
    await expect(data.ensureOrganization('org-other', 'dir')).rejects.toThrow()
  })
})

describe('signupOwner (#2163)', () => {
  it('writes org, owner membership and an org.signup audit together', async () => {
    const u = await newUser('signup@example.com', true)
    const data = createData({ DB: d1 } as DataEnv)
    await data.signupOwner('organization.sg', 'sg', 'Sign Up', u.id, 'code-1')
    expect(await data.memberships(u.id)).toEqual([
      { orgId: 'organization.sg', role: 'owner' },
    ])
    const { results } = await d1
      .prepare(
        "SELECT userId, detail FROM audit_event WHERE action = 'org.signup'",
      )
      .all()
    expect(results).toEqual([
      {
        userId: u.id,
        detail: JSON.stringify({ orgId: 'organization.sg', codeId: 'code-1' }),
      },
    ])
  })

  it('refuses an org identity already has: no co-owner is added', async () => {
    const owner = await newUser('first-owner@example.com', true)
    const intruder = await newUser('intruder@example.com', true)
    const data = createData({ DB: d1 } as DataEnv)
    await data.signupOwner('organization.taken', 'taken', 'T', owner.id, 'c1')
    await expect(
      data.signupOwner('organization.taken', 'taken', 'T', intruder.id, 'c2'),
    ).rejects.toThrow()
    expect(await data.memberships(intruder.id)).toEqual([])
    expect(await data.isOwner('organization.taken', owner.id)).toBe(true)
    expect(await data.isOwner('organization.taken', intruder.id)).toBe(false)
  })

  it('writes nothing when the membership fails', async () => {
    const data = createData({ DB: d1 } as DataEnv)
    // An unknown user breaks the member foreign key.
    await expect(
      data.signupOwner('organization.sx', 'sx', 'X', 'nobody', 'code-2'),
    ).rejects.toThrow()
    const { results } = await d1
      .prepare(
        "SELECT (SELECT count(*) FROM organization WHERE id = 'organization.sx') AS o, (SELECT count(*) FROM audit_event WHERE detail LIKE '%code-2%') AS a",
      )
      .all()
    expect(results).toEqual([{ o: 0, a: 0 }])
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

describe('linked accounts (#1981)', () => {
  const signIn = async (email: string, accountId: string, providerId: string) =>
    handleOAuthUserInfo({ context: await auth.$context } as never, {
      userInfo: { id: accountId, email, name: 'Test', emailVerified: true },
      account: { providerId, accountId },
      callbackURL: '/',
    })
  const link = async (
    user: { id: string; email: string },
    email: string,
    accountId: string,
    providerId = 'linkedin',
  ) =>
    linkOAuthAccount(
      { context: await auth.$context } as never,
      {
        link: { userId: user.id, email: user.email },
        userInfo: { id: accountId, email, name: 'Test', emailVerified: true },
        account: { providerId, accountId },
      } as never,
    )
  const post = async (userId: string, path: string, body: unknown) =>
    auth.handler(
      new Request(`${BASE}/api/auth/${path}`, {
        method: 'POST',
        headers: {
          cookie: await sessionCookie(userId),
          origin: BASE,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    )
  const accounts = async (userId: string) =>
    (
      await d1
        .prepare(
          'SELECT id, providerId FROM account WHERE userId = ? ORDER BY providerId',
        )
        .bind(userId)
        .all<{ id: string; providerId: string }>()
    ).results

  it('links a second provider with the same verified email; it signs in to the same user, audited', async () => {
    const first = await signIn('both@example.com', 'gh-both', 'github')
    const u = first.data!.user
    expect(await link(u, 'BOTH@example.com', 'li-both')).toMatchObject({
      linked: true,
    })
    const second = await signIn('both@example.com', 'li-both', 'linkedin')
    expect(second.data!.user.id).toBe(u.id)
    const { results } = await d1
      .prepare(
        "SELECT action, providerId FROM audit_event WHERE action LIKE 'account.%' AND userId = ? ORDER BY id",
      )
      .bind(u.id)
      .all()
    expect(results).toEqual([
      { action: 'account.created', providerId: 'github' },
      { action: 'account.linked', providerId: 'linkedin' },
    ])
  })

  it("refuses to link another user's account or another user's email", async () => {
    const other = await signIn('other@example.com', 'li-other', 'linkedin')
    const me = (await signIn('me@example.com', 'gh-me', 'github')).data!.user
    expect(await link(me, 'me@example.com', 'li-other')).toMatchObject({
      linked: false,
      error: { code: 'account_already_linked_to_different_user' },
    })
    expect(await link(me, 'other@example.com', 'li-new')).toMatchObject({
      linked: false,
      error: { code: 'email_does_not_match' },
    })
    expect(await accounts(me.id)).toHaveLength(1)
    expect(await accounts(other.data!.user.id)).toHaveLength(1)
  })

  it('refuses /link-social for a session whose own email is not verified', async () => {
    const unverified = await newUser('unverified-link@example.com', false)
    const verified = await newUser('verified-link@example.com', true)
    const body = {
      provider: 'linkedin',
      callbackURL: '/account',
      disableRedirect: true,
    }
    expect((await post(unverified.id, 'link-social', body)).status).toBe(403)
    const ok = await post(verified.id, 'link-social', body)
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { url: string }).url).toContain('linkedin.com')
  })

  it('unlinks one account with an audit row, and refuses the last one', async () => {
    const u = (await signIn('unlink@example.com', 'gh-unlink', 'github')).data!
      .user
    await link(u, 'unlink@example.com', 'li-unlink')
    const [gh, li] = await accounts(u.id)
    expect(
      (await post(u.id, 'unlink-account', { accountId: li.id })).status,
    ).toBe(200)
    const last = await post(u.id, 'unlink-account', { accountId: gh.id })
    expect(last.status).toBe(400)
    expect(await accounts(u.id)).toEqual([gh])
    const { results } = await d1
      .prepare(
        "SELECT providerId FROM audit_event WHERE action = 'account.unlinked' AND userId = ?",
      )
      .bind(u.id)
      .all()
    expect(results).toEqual([{ providerId: 'linkedin' }])
  })

  it('renders the account page: linked providers, link buttons, sign-in when anonymous', async () => {
    const u = (await signIn('page@example.com', 'gh-page', 'github')).data!.user
    const pageEnv = { ...env, DB: d1 }
    const signedIn = await (
      await accountPage(
        new Request(`${BASE}/account?error=email_does_not_match`, {
          headers: { cookie: await sessionCookie(u.id) },
        }),
        pageEnv,
      )
    ).text()
    expect(signedIn).toContain('<span>GitHub</span>')
    expect(signedIn).toContain('Siste konto')
    expect(signedIn).toContain('data-link="linkedin"')
    expect(signedIn).not.toContain('data-link="github"')
    expect(signedIn).toContain('annen e-postadresse')
    const signedInUnknown = await (
      await accountPage(
        new Request(`${BASE}/account?error=<x>`, {
          headers: { cookie: await sessionCookie(u.id) },
        }),
        pageEnv,
      )
    ).text()
    expect(signedInUnknown).toContain('<span>GitHub</span>')
    expect(signedInUnknown).not.toContain('<x>')
    const anon = await (
      await accountPage(new Request(`${BASE}/account?error=<x>`), pageEnv)
    ).text()
    expect(anon).toContain('data-signin="github"')
    expect(anon).not.toContain('<x>')
    if (process.env.ACCOUNT_PAGE_OUT) {
      const { writeFileSync } = await import('node:fs')
      await link(u, 'page@example.com', 'li-page')
      const two = await accountPage(
        new Request(`${BASE}/account`, {
          headers: { cookie: await sessionCookie(u.id) },
        }),
        pageEnv,
      )
      writeFileSync(process.env.ACCOUNT_PAGE_OUT, await two.text())
      writeFileSync(process.env.ACCOUNT_PAGE_OUT + '.one.html', signedIn)
    }
  })
})

describe('organization updates', () => {
  it('refuses slug and name changes, allows the rest', async () => {
    const u = await newUser('orgowner@example.com', true)
    await createData({ DB: d1 } as DataEnv).ensureOrganization('org-u', 'u')
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
