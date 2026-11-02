import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }))
// The auth handler is not under test here; stub it to see what reaches it.
vi.mock('./data', () => ({
  createAuth: () => ({ handler: () => new Response('auth') }),
  createData: () => ({}),
}))

const { default: worker } = await import('./index')
const env = {} as never

describe('identity routing', () => {
  it('serves only /api/auth/* over HTTP', async () => {
    const res = await worker.fetch(
      new Request('http://id.test/api/auth/jwks'),
      env,
    )
    expect(await res.text()).toBe('auth')
    for (const path of [
      '/graphql',
      '/',
      '/api/authx',
      '/internal/membership',
    ]) {
      const r = await worker.fetch(new Request(`http://id.test${path}`), env)
      expect(r.status, path).toBe(404)
    }
  })
})
