import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  declaredSecrets,
  fnoxName,
  missingSecrets,
  RUNKONF_ACCOUNT_ID,
  SHARED_ACROSS_ENVS,
  sync,
  type Env,
} from '../../scripts/secrets-sync'

type Opts = { cwd: string; input?: Buffer; env?: NodeJS.ProcessEnv }

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
    envs.flatMap((e) => {
      const d = declaredSecrets(s, e)
      return [...d.required, ...d.optional].map((n) => fnoxName(n, e))
    }),
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
        expect(declaredSecrets(s, e).required).toContain(
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
    expect(missingSecrets('api', 'production', exec)).toEqual({
      required: ['SITE_PUBLIC_KEYS', 'CLIENT_IP_SECRET'],
      optional: [],
    })
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

  it('--check separates missing optional from missing required', () => {
    const exec = vi.fn((_cmd: string, _args: string[], _opts: Opts) =>
      Buffer.from(JSON.stringify([{ name: 'GATEWAY_PUBLIC_KEY' }])),
    )
    expect(missingSecrets('tenant-directory', 'production', exec)).toEqual({
      required: [],
      optional: [
        'SANITY_API_TOKEN_READ',
        'CF_API_TOKEN',
        'CF_ZONE_ID',
        'PROVISIONING_SIGNING_KEY',
      ],
    })
  })

  it('sync skips an optional secret fnox lacks but fails on a required one', () => {
    const log = vi.fn()
    const exec = vi.fn((cmd: string, args: string[], _opts: Opts) => {
      if (cmd === 'fnox' && args[1] !== 'KONF_PREVIEW_GATEWAY_PUBLIC_KEY')
        throw new Error('missing')
      return Buffer.from(args[2] === 'whoami' ? RUNKONF_ACCOUNT_ID : 'v')
    })
    sync('tenant-directory', 'preview', exec, log)
    expect(log.mock.calls.flat()).toEqual([
      'ok GATEWAY_PUBLIC_KEY',
      'skip SANITY_API_TOKEN_READ (optional, not in fnox)',
      'skip CF_API_TOKEN (optional, not in fnox)',
      'skip CF_ZONE_ID (optional, not in fnox)',
      'skip PROVISIONING_SIGNING_KEY (optional, not in fnox)',
    ])
    exec.mockImplementation(() => {
      throw new Error('missing')
    })
    expect(() => sync('content', 'preview', exec, log)).toThrow('missing')
  })

  it('sync pipes each fnox value to wrangler and logs only names', () => {
    const exec = vi.fn((cmd: string, args: string[], _opts: Opts) =>
      Buffer.from(
        cmd === 'fnox'
          ? `value-of-${args[1]}`
          : args[2] === 'whoami'
            ? `Account ${RUNKONF_ACCOUNT_ID}`
            : '',
      ),
    )
    const log = vi.fn()
    sync('content', 'preview', exec, log)
    const puts = exec.mock.calls.filter(
      ([c, a]) => c === 'pnpm' && a[2] !== 'whoami',
    )
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

  it('sync refuses before any fnox read or put when whoami lacks the RunKonf account', () => {
    const exec = vi.fn((_cmd: string, args: string[], _opts: Opts) =>
      Buffer.from(args[2] === 'whoami' ? 'Account bf000000personal' : 'x'),
    )
    expect(() => sync('content', 'production', exec, vi.fn())).toThrow(
      /RunKonf account/,
    )
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('refuses an exported other account before any fnox read', () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'bf000000personal')
    try {
      const exec = vi.fn((_c: string, _a: string[], _o: Opts) =>
        Buffer.from(RUNKONF_ACCOUNT_ID),
      )
      expect(() => sync('content', 'production', exec, vi.fn())).toThrow(
        /another account/,
      )
      expect(() => missingSecrets('content', 'production', exec)).toThrow(
        /another account/,
      )
      expect(exec).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('every wrangler call carries the RunKonf account in its env', () => {
    const exec = vi.fn((cmd: string, args: string[], _o: Opts) =>
      Buffer.from(
        cmd === 'fnox' ? 'v' : args[2] === 'whoami' ? RUNKONF_ACCOUNT_ID : '[]',
      ),
    )
    sync('content', 'production', exec, vi.fn())
    missingSecrets('content', 'production', exec)
    const calls = exec.mock.calls.filter(([c]) => c === 'pnpm')
    expect(calls.length).toBe(4)
    for (const [, , o] of calls)
      expect(o.env?.CLOUDFLARE_ACCOUNT_ID).toBe(RUNKONF_ACCOUNT_ID)
  })

  it('only the accepted exceptions share one fnox key across envs', () => {
    const names = new Set(
      services.flatMap((s) =>
        envs.flatMap((e) => {
          const d = declaredSecrets(s, e)
          return [...d.required, ...d.optional]
        }),
      ),
    )
    const shared = [...names].filter(
      (n) => fnoxName(n, 'preview') === fnoxName(n, 'production'),
    )
    expect(shared.sort()).toEqual(
      Object.keys(SHARED_ACROSS_ENVS)
        .filter((n) => names.has(n))
        .sort(),
    )
    expect(Object.keys(SHARED_ACROSS_ENVS).sort()).toEqual([
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'SANITY_API_TOKEN_READ',
    ])
  })

  it('rejects an empty fnox value: required fails, optional is skipped', () => {
    const log = vi.fn()
    const exec = vi.fn((cmd: string, args: string[], _o: Opts) =>
      Buffer.from(
        cmd === 'fnox'
          ? args[1] === 'KONF_PREVIEW_GATEWAY_PUBLIC_KEY'
            ? 'v'
            : '  \n'
          : args[2] === 'whoami'
            ? RUNKONF_ACCOUNT_ID
            : '',
      ),
    )
    sync('tenant-directory', 'preview', exec, log)
    expect(log.mock.calls.flat()).toContain(
      '::warning::skip CF_API_TOKEN (optional, empty in fnox)',
    )
    const puts = exec.mock.calls.filter(([, a]) => a[3] === 'put')
    expect(puts.map(([, a]) => a[4])).toEqual(['GATEWAY_PUBLIC_KEY'])
    expect(() => sync('content', 'preview', exec, vi.fn())).toThrow(
      /required SANITY_API_TOKEN_READ is empty/,
    )
  })
})
