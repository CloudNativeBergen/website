import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }))
// The auth handler is not under test here; stub it to see what reaches it.
vi.mock('./handoff', () => ({ handoff: () => new Response('handoff') }))
const syncMembers = vi.fn(async () => 'synced')
vi.mock('./data', () => ({
  createAuth: () => ({ handler: () => new Response('auth') }),
  createData: () => ({ syncMembers }),
}))

const recordOperatorWrite = vi.fn(async () => undefined)
vi.mock('./data/push', () => ({ notify: vi.fn(), recordOperatorWrite }))

const { default: worker, Membership, Organizations } = await import('./index')
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

describe('membership sync RPC (#1907)', () => {
  it('Organizations.syncMembers runs the data-layer sync; the gateway entrypoint has none', async () => {
    const rpc = new Organizations({} as never, {} as never)
    expect(await rpc.syncMembers()).toBe('synced')
    expect(syncMembers).toHaveBeenCalledTimes(1)
    expect('syncMembers' in Membership.prototype).toBe(false)
  })
  it('Organizations.audit records tenant-directory operator writes (#2129)', async () => {
    const rpc = new Organizations({} as never, {} as never)
    Object.assign(rpc, { env: { DB: 'db' } })
    const event = {
      type: 'operator.write' as const,
      actorId: 'op',
      organizationId: 'org',
      conferenceId: null,
      fields: ['plan'],
    }
    await rpc.audit(event)
    expect(recordOperatorWrite).toHaveBeenCalledWith('db', event)
  })
  it('has no cron of its own (the account allows 5; tenant-directory drives it)', () => {
    const cfg = readFileSync(
      new URL('../wrangler.jsonc', import.meta.url),
      'utf8',
    )
    expect(cfg).not.toContain('crons')
    expect('scheduled' in worker).toBe(false)
  })
})
