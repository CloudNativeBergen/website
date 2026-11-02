// Login handoff security properties (#1803) against a real D1 (Miniflare).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createAuth } from './data'
import { HANDOFF_TTL_MS, handoff, sha256hex, type HandoffEnv } from './handoff'

const BASE = 'http://identity.test'
const SITE = 'https://conf.example'
const SECRET = { exchange: 'exchange-secret', upgrade: 'upgrade-secret' }
const NONCE = 'browser-nonce'
let STATE: string
const allow = () => ({ limit: vi.fn(async () => ({ success: true })) })
let env: HandoffEnv
let mf: Miniflare

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
  STATE = await sha256hex(NONCE)
  env = {
    DB,
    // Fake tenant-directory: only conf.example is verified.
    DIRECTORY: {
      fetch: async (_url: string, init: RequestInit) => {
        const { variables } = JSON.parse(String(init.body))
        return Response.json({
          data: {
            tenantByHost:
              variables.host === 'conf.example'
                ? { hostname: 'conf.example' }
                : null,
          },
        })
      },
    } as unknown as Fetcher,
    IDENTITY_EXCHANGE_SECRET: SECRET.exchange,
    IDENTITY_UPGRADE_SECRET: SECRET.upgrade,
    IDENTITY_UPGRADE_UNTIL: '2099-01-01',
    HANDOFF_SITE_LIMIT: allow(),
    HANDOFF_IP_LIMIT: allow(),
    BETTER_AUTH_URL: BASE,
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
  }
})
afterAll(() => mf?.dispose())
afterEach(() => vi.restoreAllMocks())

const ctx = () => createAuth(env.DB, env).$context

async function newUser(email: string, emailVerified = true) {
  return (await ctx()).internalAdapter.createUser(
    { email, name: 'Test', emailVerified },
    { method: 'admin' },
  )
}

async function cookieFor(userId: string) {
  const c = await ctx()
  const { token } = await c.internalAdapter.createSession(userId, false)
  return `${c.authCookies.sessionToken.name}=${token}.${await makeSignature(token, c.secret)}`
}

const start = (origin: string, cookie = '', state = STATE) =>
  handoff(
    new Request(
      `${BASE}/handoff?origin=${encodeURIComponent(origin)}&provider=github&state=${state}`,
      { headers: { cookie } },
    ),
    env,
  )

const post = (
  path: string,
  body: object,
  secret = path.endsWith('upgrade') ? SECRET.upgrade : SECRET.exchange,
) =>
  handoff(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }),
    env,
  )

async function tokenFor(email: string) {
  const u = await newUser(email)
  const res = await start(SITE, await cookieFor(u.id))
  expect(res.status).toBe(302)
  const to = new URL(res.headers.get('location')!)
  expect(to.origin + to.pathname).toBe(`${SITE}/api/auth/handoff`)
  return { user: u, token: to.searchParams.get('token')! }
}

describe('handoff start', () => {
  it.each([
    'https://evil.example',
    'http://conf.example',
    'https://conf.example:8443',
    'https://conf.example/path',
    'https://user@conf.example',
    'conf.example',
    '',
  ])('refuses %j without redirecting', async (origin) => {
    const res = await start(
      origin,
      await cookieFor((await newUser(`r${Math.random()}@x.test`)).id),
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('refuses a missing or malformed state', async () => {
    expect((await start(SITE, '', '')).status).toBe(400)
    expect((await start(SITE, '', 'abc')).status).toBe(400)
  })

  it('rate-limits per client IP', async () => {
    env.HANDOFF_IP_LIMIT.limit = vi.fn(async () => ({ success: false }))
    expect((await start(SITE)).status).toBe(429)
    env.HANDOFF_IP_LIMIT = allow()
  })

  it('sends a signed-out user to the provider, back to /handoff', async () => {
    const res = await start(SITE)
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('location')!)
    expect(to.host).toBe('github.com')
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0)
  })
})

describe('handoff exchange', () => {
  it('returns a session the token endpoint accepts as a bearer', async () => {
    const { user, token } = await tokenFor('ok@x.test')
    const res = await post('/handoff/exchange', {
      token,
      origin: SITE,
      nonce: NONCE,
    })
    expect(res.status).toBe(200)
    const { session } = (await res.json()) as { session: string }
    const jwt = await createAuth(env.DB, env).handler(
      new Request(`${BASE}/api/auth/token`, {
        headers: { authorization: `Bearer ${session}` },
      }),
    )
    expect(jwt.status).toBe(200)
    const { token: t } = (await jwt.json()) as { token: string }
    const claims = JSON.parse(atob(t.split('.')[1]))
    expect(claims.sub).toBe(user.id)
    // The gateway matches this against the request's tenant (#1844).
    expect(claims.origin).toBe(SITE)
    const { results } = await env.DB.prepare(
      "SELECT userId, origin, detail FROM audit_event WHERE action = 'handoff.exchange' AND userId = ?",
    )
      .bind(user.id)
      .all()
    expect(results).toEqual([{ userId: user.id, origin: SITE, detail: null }])
  })

  it('refuses a forced session: a token without the starting browser nonce', async () => {
    // An attacker signs in, gets a token for their own account and plants
    // it in a victim's browser. The victim's site holds a different nonce.
    const { token } = await tokenFor('attacker@x.test')
    expect(
      (
        await post('/handoff/exchange', {
          token,
          origin: SITE,
          nonce: 'victim',
        })
      ).status,
    ).toBe(401)
    const { token: t2 } = await tokenFor('attacker2@x.test')
    expect(
      (await post('/handoff/exchange', { token: t2, origin: SITE })).status,
    ).toBe(401)
  })

  it('rate-limits per origin', async () => {
    env.HANDOFF_SITE_LIMIT.limit = vi.fn(async () => ({ success: false }))
    expect(
      (await post('/handoff/exchange', { token: 'x', origin: SITE })).status,
    ).toBe(429)
    expect(env.HANDOFF_SITE_LIMIT.limit).toHaveBeenCalledWith({ key: SITE })
    env.HANDOFF_SITE_LIMIT = allow()
  })

  it('purges expired handoff rows on the next put', async () => {
    await tokenFor('stale@x.test')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000)
    await env.DB.prepare(
      "UPDATE verification SET expiresAt = 0 WHERE identifier LIKE 'handoff:%'",
    ).run()
    vi.restoreAllMocks()
    await tokenFor('fresh@x.test')
    const { results } = await env.DB.prepare(
      "SELECT count(*) AS n FROM verification WHERE identifier LIKE 'handoff:%'",
    ).all()
    expect(results).toEqual([{ n: 1 }])
  })

  it('is single use', async () => {
    const { token } = await tokenFor('once@x.test')
    const [a, b] = await Promise.all([
      post('/handoff/exchange', { token, origin: SITE, nonce: NONCE }),
      post('/handoff/exchange', { token, origin: SITE, nonce: NONCE }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 401])
    expect(
      (await post('/handoff/exchange', { token, origin: SITE, nonce: NONCE }))
        .status,
    ).toBe(401)
  })

  it('expires after 60 seconds', async () => {
    const { token } = await tokenFor('late@x.test')
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + HANDOFF_TTL_MS + 1)
    expect(
      (await post('/handoff/exchange', { token, origin: SITE, nonce: NONCE }))
        .status,
    ).toBe(401)
  })

  it('is bound to its origin, and a wrong origin spends it', async () => {
    const { token } = await tokenFor('bound@x.test')
    expect(
      (
        await post('/handoff/exchange', {
          token,
          origin: 'https://other.example',
          nonce: NONCE,
        })
      ).status,
    ).toBe(401)
    expect(
      (await post('/handoff/exchange', { token, origin: SITE, nonce: NONCE }))
        .status,
    ).toBe(401)
  })

  it('needs the exchange secret, not the upgrade one', async () => {
    const { token } = await tokenFor('secret@x.test')
    for (const secret of ['wrong', SECRET.upgrade]) {
      expect(
        (
          await post(
            '/handoff/exchange',
            { token, origin: SITE, nonce: NONCE },
            secret,
          )
        ).status,
      ).toBe(401)
    }
  })
})

describe('session upgrade', () => {
  it('matches on the provider account id', async () => {
    const u = await newUser('gh@x.test')
    await (
      await ctx()
    ).internalAdapter.createAccount({
      userId: u.id,
      providerId: 'github',
      accountId: '4242',
    })
    const res = await post('/handoff/upgrade', {
      origin: SITE,
      providerId: 'github',
      accountId: '4242',
    })
    expect(res.status).toBe(200)
    const { results } = await env.DB.prepare(
      "SELECT userId, origin, detail FROM audit_event WHERE action = 'session.upgrade' AND userId = ?",
    )
      .bind(u.id)
      .all()
    expect(results).toEqual([{ userId: u.id, origin: SITE, detail: 'account' }])
    expect(JSON.stringify(results)).not.toContain('@')
  })

  it.each([undefined, '', 'not-a-date', '2000-01-01'])(
    'is off when IDENTITY_UPGRADE_UNTIL is %j',
    async (until) => {
      const saved = env.IDENTITY_UPGRADE_UNTIL
      env.IDENTITY_UPGRADE_UNTIL = until
      expect(
        (await post('/handoff/upgrade', { origin: SITE, verifiedEmail: 'x' }))
          .status,
      ).toBe(410)
      env.IDENTITY_UPGRADE_UNTIL = saved
    },
  )

  it('matches a verified email only when our record is verified too (#807)', async () => {
    await newUser('verified@x.test', true)
    await newUser('unverified@x.test', false)
    expect(
      (
        await post('/handoff/upgrade', {
          origin: SITE,
          verifiedEmail: 'Verified@x.test',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await post('/handoff/upgrade', {
          origin: SITE,
          verifiedEmail: 'unverified@x.test',
        })
      ).status,
    ).toBe(404)
  })

  it('refuses an unknown account, a foreign provider and an unverified origin', async () => {
    expect(
      (
        await post('/handoff/upgrade', {
          origin: SITE,
          providerId: 'github',
          accountId: 'nope',
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await post('/handoff/upgrade', {
          origin: SITE,
          providerId: 'email-link',
          accountId: 'x',
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await post('/handoff/upgrade', {
          origin: 'https://evil.example',
          verifiedEmail: 'verified@x.test',
        })
      ).status,
    ).toBe(400)
    expect(
      (await post('/handoff/upgrade', { origin: SITE }, 'wrong')).status,
    ).toBe(401)
    expect(
      (await post('/handoff/upgrade', { origin: SITE }, SECRET.exchange))
        .status,
    ).toBe(401)
  })
})
