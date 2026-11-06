/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest'
import {
  checkVersion,
  checkFnox,
  checkSanity,
  checkCommand,
  wantedMajor,
  doctor,
  type Run,
} from '../../scripts/doctor'

const fake =
  (outputs: Record<string, string | Error>): Run =>
  (cmd, args) => {
    const v = outputs[[cmd, ...args].join(' ')]
    if (v === undefined || v instanceof Error) throw v ?? new Error('ENOENT')
    return v
  }
const env = {
  NEXT_PUBLIC_SANITY_PROJECT_ID: 'p',
  NEXT_PUBLIC_SANITY_DATASET: 'd',
}
const status = (s: number) =>
  vi.fn(
    async () => new Response('{}', { status: s }),
  ) as unknown as typeof fetch

describe('doctor', () => {
  it('reads major versions from .mise.toml', () => {
    expect(wantedMajor('[tools]\nnode = "24"\npnpm = "10"\n', 'node')).toBe(
      '24',
    )
  })
  it('flags a node major mismatch', () => {
    const r = checkVersion(fake({ 'node --version': 'v22.1.0' }), 'node', '24')
    expect(r).toMatchObject({
      ok: false,
      detail: '22.1.0, .mise.toml wants 24',
    })
    expect(
      checkVersion(fake({ 'node --version': 'v24.2.0' }), 'node', '24').ok,
    ).toBe(true)
  })
  it('detects the silent keychain "not found"', () => {
    const r = checkFnox(
      fake({
        'fnox --version': '1',
        'fnox get SANITY_API_TOKEN_READ': new Error('not found'),
      }),
    )
    expect(r.result.ok).toBe(false)
    expect(r.result.fix).toContain('security unlock-keychain')
    expect(checkFnox(fake({})).result.detail).toBe('fnox not installed')
  })
  it('validates the token without printing it', async () => {
    expect((await checkSanity(undefined, env, status(200))).detail).toBe(
      'not set',
    )
    expect(await checkSanity('secret-xyz', env, status(401))).toMatchObject({
      ok: false,
      detail: 'set, invalid (401)',
    })
    const ok = await checkSanity('secret-xyz', env, status(200))
    expect(ok).toMatchObject({ ok: true, detail: 'set, valid (200)' })
    expect(JSON.stringify(ok)).not.toContain('secret-xyz')
  })
  it('wrangler logged out exits 0 but fails', () => {
    const r = fake({ 'wrangler whoami': 'You are not authenticated.' })
    expect(
      checkCommand(r, 'wrangler', 'wrangler', ['whoami'], 'wrangler login').ok,
    ).toBe(false)
    expect(checkCommand(fake({}), 'gh', 'gh', ['auth', 'status'], 'x').ok).toBe(
      false,
    )
  })
  it('uses the fnox token and never leaks it in results', async () => {
    const f = status(200)
    const results = await doctor(
      fake({
        'node --version': 'v24.0.0',
        'pnpm --version': '10.1.0',
        'fnox --version': '1',
        'fnox get SANITY_API_TOKEN_READ': 'tok-123',
        'wrangler whoami': 'logged in as x',
        'gh auth status': 'ok',
      }),
      env,
      'node = "24"\npnpm = "10"\n',
      f,
    )
    expect(results.every((r) => r.ok)).toBe(true)
    expect(JSON.stringify(results)).not.toContain('tok-123')
  })
})
