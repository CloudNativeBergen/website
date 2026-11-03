import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }))
// The auth handler is not under test here; stub it to see what reaches it.
vi.mock('./handoff', () => ({ handoff: () => new Response('handoff') }))
vi.mock('./data', () => ({
  createAuth: () => ({ handler: () => new Response('auth') }),
  createData: () => ({}),
}))

const { default: worker } = await import('./index')
const env = {} as never

describe('identity routing', () => {
  it('serves only /api/auth/* and /handoff over HTTP', async () => {
    const res = await worker.fetch(
      new Request('http://id.test/api/auth/jwks'),
      env,
    )
    expect(await res.text()).toBe('auth')
    const h = await worker.fetch(new Request('http://id.test/handoff'), env)
    expect(await h.text()).toBe('handoff')
    for (const path of [
      '/graphql',
      '/',
      '/api/authx',
      '/handoffx',
      '/internal/membership',
    ]) {
      const r = await worker.fetch(new Request(`http://id.test${path}`), env)
      expect(r.status, path).toBe(404)
    }
  })
  it('serves /test only when LOGIN_TEST_PAGE is "1"', async () => {
    const req = () => new Request('http://id.test/test')
    const on = await worker.fetch(req(), { LOGIN_TEST_PAGE: '1' } as never)
    expect(on.status).toBe(200)
    expect(await on.text()).toContain('Sign in with GitHub')
    expect(on.headers.get('cache-control')).toBe('no-store')
    expect(on.headers.get('content-security-policy')).toMatch(
      /script-src 'nonce-[0-9a-f]{32}'/,
    )
    for (const e of [
      {},
      { LOGIN_TEST_PAGE: '0' },
      { LOGIN_TEST_PAGE: 'true' },
    ]) {
      const off = await worker.fetch(req(), e as never)
      expect(off.status).toBe(404)
    }
  })
  it('enables the test page on preview and never on production', () => {
    const cfg = readFileSync(
      new URL('../wrangler.jsonc', import.meta.url),
      'utf8',
    )
    const [, prod] = cfg.split('"production": {')
    expect(prod).toBeDefined()
    expect(prod).not.toContain('LOGIN_TEST_PAGE')
    expect(cfg.split('"production": {')[0]).toContain('"LOGIN_TEST_PAGE": "1"')
  })
})
