import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encode } from 'next-auth/jwt'
import { logger } from '@/lib/logger'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const verified = vi.fn<(origin: string) => Promise<boolean>>()
vi.mock('@/lib/domain-verification/allowlist', () => ({
  isVerifiedRedirectOrigin: (origin: string) => verified(origin),
}))

import {
  ENCODED_STATE_SALT,
  guardRedirectProxyBounce,
  isAllowedBounceTarget,
} from './redirect-proxy-guard'

const SECRET = 'test-secret-test-secret-test-secret'
const env = {
  NODE_ENV: 'production',
  AUTH_SECRET: SECRET,
  AUTH_REDIRECT_PROXY_URL: 'https://auth.konf.app/api/auth',
  PLATFORM_DOMAIN_SUFFIX: 'konf.app',
  AUTH_REDIRECT_GUARD_MODE: 'enforce',
} as unknown as NodeJS.ProcessEnv

const cb = (origin: string) => `${origin}/api/auth/callback/github`

beforeEach(() => {
  verified.mockReset()
  verified.mockImplementation(
    async (o) => o === 'https://2026.cloudnativedays.no',
  )
})

describe('isAllowedBounceTarget', () => {
  it('allows a verified origin', async () => {
    expect(
      await isAllowedBounceTarget(cb('https://2026.cloudnativedays.no'), env),
    ).toBe(true)
  })

  it('refuses an unverified origin', async () => {
    expect(await isAllowedBounceTarget(cb('https://evil.example'), env)).toBe(
      false,
    )
  })

  it('allows a platform host without a lookup', async () => {
    expect(await isAllowedBounceTarget(cb('https://acme.konf.app'), env)).toBe(
      true,
    )
    expect(verified).not.toHaveBeenCalled()
  })

  it.each([
    ['lookalike prefix', cb('https://evil-konf.app')],
    ['lookalike suffix', cb('https://konf.app.evil.com')],
    ['userinfo', cb('https://konf.app@evil.com')],
    ['userinfo on platform host', cb('https://acme.konf.app@evil.com')],
    ['trailing dot', cb('https://acme.konf.app.')],
    ['trailing dot verified', cb('https://2026.cloudnativedays.no.')],
    ['uppercase', cb('https://2026.CloudNativeDays.no')],
    ['port', cb('https://acme.konf.app:8443')],
    ['port on verified', cb('https://2026.cloudnativedays.no:8443')],
    [
      'path trick',
      'https://2026.cloudnativedays.no/api/auth/callback/github/../../x',
    ],
    ['other path', 'https://2026.cloudnativedays.no/evil'],
    ['query', `${cb('https://2026.cloudnativedays.no')}?x=1`],
    ['fragment', `${cb('https://2026.cloudnativedays.no')}#x`],
    ['http', cb('http://2026.cloudnativedays.no')],
    ['platform apex', cb('https://konf.app')],
    ['wildcard', cb('https://*.konf.app')],
    ['malformed', 'not a url'],
    ['non-string', 42],
    ['localhost in production', cb('http://localhost:3000')],
  ])('refuses %s', async (_label, target) => {
    expect(await isAllowedBounceTarget(target, env)).toBe(false)
  })

  it('fails closed on a lookup error', async () => {
    verified.mockRejectedValue(new Error('sanity down'))
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    expect(
      await isAllowedBounceTarget(cb('https://2026.cloudnativedays.no'), env),
    ).toBe(false)
  })

  it('allows localhost only outside production', async () => {
    const dev = { ...env, NODE_ENV: 'development' } as NodeJS.ProcessEnv
    expect(await isAllowedBounceTarget(cb('http://localhost:3000'), dev)).toBe(
      true,
    )
  })
})

async function callback(origin: string | undefined, host = 'auth.konf.app') {
  const token = await encode({
    secret: SECRET,
    salt: ENCODED_STATE_SALT,
    token: { origin, random: 'r' },
  })
  return new Request(
    `https://${host}/api/auth/callback/github?code=c&state=${token}`,
    { headers: { host } },
  )
}

describe('guardRedirectProxyBounce', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  it('passes a bounce to a verified origin', async () => {
    const req = await callback(cb('https://2026.cloudnativedays.no'))
    expect(await guardRedirectProxyBounce(req, env)).toBeNull()
  })

  it('refuses a bounce to an unverified origin', async () => {
    const res = await guardRedirectProxyBounce(
      await callback(cb('https://evil.example')),
      env,
    )
    expect(res?.status).toBe(403)
  })

  it('refuses when the lookup fails', async () => {
    verified.mockRejectedValue(new Error('down'))
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const req = await callback(cb('https://2026.cloudnativedays.no'))
    expect((await guardRedirectProxyBounce(req, env))?.status).toBe(403)
  })

  it('passes a callback for the proxy itself (no bounce)', async () => {
    const req = await callback(cb('https://auth.konf.app'))
    expect(await guardRedirectProxyBounce(req, env)).toBeNull()
  })

  it('ignores requests on tenant hosts and when the proxy is off', async () => {
    const tenant = await callback(
      cb('https://evil.example'),
      '2026.cloudnativedays.no',
    )
    expect(await guardRedirectProxyBounce(tenant, env)).toBeNull()
    const off = { ...env, AUTH_REDIRECT_PROXY_URL: '' } as NodeJS.ProcessEnv
    expect(
      await guardRedirectProxyBounce(
        await callback(cb('https://evil.example')),
        off,
      ),
    ).toBeNull()
  })
})

describe('report mode (default)', () => {
  const report = {
    ...env,
    AUTH_REDIRECT_GUARD_MODE: undefined,
  } as NodeJS.ProcessEnv

  it('lets an unverified bounce through and logs host, reason, provider only', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const req = await callback(cb('https://evil.example'))
    expect(await guardRedirectProxyBounce(req, report)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('report mode'), {
      host: 'evil.example',
      reason: 'unverified',
      provider: 'github',
      mode: 'report',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/state=|code=/)
  })

  it('reports a lookup failure instead of refusing', async () => {
    verified.mockRejectedValue(new Error('down'))
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const req = await callback(cb('https://2026.cloudnativedays.no'))
    expect(await guardRedirectProxyBounce(req, report)).toBeNull()
    expect(warn.mock.calls[0][1]).toMatchObject({ reason: 'lookup-failed' })
  })

  it('still refuses an unparseable origin, which @auth/core cannot bounce either', async () => {
    const req = await callback('not a url')
    expect((await guardRedirectProxyBounce(req, report))?.status).toBe(403)
  })

  it('treats an unknown mode value as report', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const odd = {
      ...env,
      AUTH_REDIRECT_GUARD_MODE: 'Enforce!',
    } as NodeJS.ProcessEnv
    expect(
      await guardRedirectProxyBounce(
        await callback(cb('https://evil.example')),
        odd,
      ),
    ).toBeNull()
  })
})

describe('@auth/core state contract', () => {
  it('decodes a state minted by @auth/core with our pinned salt', async () => {
    // @auth/core is next-auth's dependency and does not export this module,
    // so load it by path from where next-auth resolves it.
    const nextAuthRequire = createRequire(require.resolve('next-auth'))
    const coreDir = path.dirname(nextAuthRequire.resolve('@auth/core/jwt'))
    const { state: authCoreState } = await import(
      pathToFileURL(path.join(coreDir, 'lib/actions/callback/oauth/checks.js'))
        .href
    )
    const origin = cb('https://2026.cloudnativedays.no')
    const created = await authCoreState.create(
      {
        provider: { checks: ['state'] },
        jwt: { secret: SECRET },
        logger: { debug: () => {} },
        cookies: { state: { name: 'authjs.state', options: {} } },
      } as never,
      origin,
    )
    const req = new Request(
      `https://auth.konf.app/api/auth/callback/github?code=c&state=${created!.value}`,
      { headers: { host: 'auth.konf.app' } },
    )
    expect(await guardRedirectProxyBounce(req, env)).toBeNull()
    verified.mockResolvedValue(false)
    expect((await guardRedirectProxyBounce(req, env))?.status).toBe(403)
  })
})
