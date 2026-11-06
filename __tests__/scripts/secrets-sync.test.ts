import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  declaredSecrets,
  fnoxName,
  missingSecrets,
  sync,
  type Env,
} from '../../scripts/secrets-sync'

type Opts = { cwd: string; input?: Buffer }

const root = join(__dirname, '..', '..')
const envs: Env[] = ['preview', 'production']
const services = [
  'api',
  ...readdirSync(join(root, 'services')).filter((d) =>
    existsSync(join(root, 'services', d, 'service.cue')),
  ),
]

const fnoxKeys = new Set(
  [
    ...readFileSync(join(root, 'fnox.toml'), 'utf8').matchAll(
      /^([A-Z0-9_]+)\s*=/gm,
    ),
  ].map((m) => m[1]),
)

// Every fnox key a script can ask for: the sync mapping for each declared
// secret, plus names written in scripts/*.sh (KONF_${upper}_X expanded).
function scriptFnoxNames(): string[] {
  const names = services.flatMap((s) =>
    envs.flatMap((e) => declaredSecrets(s, e).map((n) => fnoxName(n, e))),
  )
  for (const f of readdirSync(join(root, 'scripts')).filter((f) =>
    f.endsWith('.sh'),
  )) {
    const src = readFileSync(join(root, 'scripts', f), 'utf8')
    for (const [, rest] of src.matchAll(/KONF_\$\{upper\}_([A-Z0-9_]+)/g))
      names.push(`KONF_PREVIEW_${rest}`, `KONF_PRODUCTION_${rest}`)
    for (const [n] of src.matchAll(
      /\b(?:KONF|ID_KONF_APP)_[A-Z][A-Z0-9_]*[A-Z0-9]\b/g,
    ))
      names.push(n)
  }
  return [...new Set(names)]
}

describe('secrets', () => {
  it('every Worker declares GATEWAY or ENVELOPE key in both envs', () => {
    expect(services).toEqual(
      expect.arrayContaining([
        'api',
        'identity',
        'tenant-directory',
        'content',
        'conference',
        'program',
      ]),
    )
    for (const s of services)
      for (const e of envs)
        expect(declaredSecrets(s, e)).toContain(
          s === 'api' ? 'ENVELOPE_PRIVATE_KEY' : 'GATEWAY_PUBLIC_KEY',
        )
  })

  it('every fnox name the scripts reference exists in fnox.toml', () => {
    const names = scriptFnoxNames()
    expect(names).toContain('KONF_PRODUCTION_GATEWAY_PRIVATE_KEY')
    expect(names.filter((n) => !fnoxKeys.has(n))).toEqual([])
  })

  it('maps names by convention and by the exception table', () => {
    expect(fnoxName('CLIENT_IP_SECRET', 'preview')).toBe(
      'KONF_PREVIEW_CLIENT_IP_SECRET',
    )
    expect(fnoxName('ENVELOPE_PRIVATE_KEY', 'production')).toBe(
      'KONF_PRODUCTION_GATEWAY_PRIVATE_KEY',
    )
    expect(fnoxName('SANITY_API_TOKEN_READ', 'preview')).toBe(
      'SANITY_API_TOKEN_READ_PROD',
    )
  })

  it('--check reports only declared names missing from wrangler secret list', () => {
    const exec = vi.fn((_cmd: string, _args: string[], _opts: Opts) =>
      Buffer.from(
        JSON.stringify([
          { name: 'ENVELOPE_PRIVATE_KEY', type: 'secret_text' },
          { name: 'EXTRA' },
        ]),
      ),
    )
    expect(missingSecrets('api', 'production', exec)).toEqual([
      'SITE_PUBLIC_KEYS',
      'CLIENT_IP_SECRET',
    ])
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec.mock.calls[0][1]).toEqual([
      'exec',
      'wrangler',
      'secret',
      'list',
      '--env',
      'production',
      '--format',
      'json',
    ])
  })

  it('sync pipes each fnox value to wrangler and logs only names', () => {
    const exec = vi.fn((cmd: string, args: string[], _opts: Opts) =>
      Buffer.from(cmd === 'fnox' ? `value-of-${args[1]}` : ''),
    )
    const log = vi.fn()
    sync('content', 'preview', exec, log)
    const puts = exec.mock.calls.filter(([c]) => c === 'pnpm')
    expect(puts.map(([, a]) => a[4])).toEqual([
      'GATEWAY_PUBLIC_KEY',
      'SANITY_API_TOKEN_READ',
    ])
    expect(String(puts[0]?.[2].input)).toBe(
      'value-of-KONF_PREVIEW_GATEWAY_PUBLIC_KEY',
    )
    expect(puts[0][1]).toContain('preview')
    expect(log.mock.calls.flat()).toEqual([
      'ok GATEWAY_PUBLIC_KEY',
      'ok SANITY_API_TOKEN_READ',
    ])
  })
})
