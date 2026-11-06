// Puts a Worker's declared secrets from fnox, or checks they exist (#1772).
//   mise run secrets:sync -- <service> <preview|production> [--check]
// <service> is `api` or a services/<name>. Declared names come from
// <dir>/secrets.json (generated from service.cue; hand-written for api).
// Values go fnox -> wrangler through a pipe and are never printed.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type Env = 'preview' | 'production'

const root = join(import.meta.dirname, '..')

// Worker secret -> fnox key where the KONF_<ENV>_<NAME> convention does not
// hold. A string is shared by both environments.
const FNOX_NAMES: Record<string, string | ((upper: string) => string)> = {
  ENVELOPE_PRIVATE_KEY: (u) => `KONF_${u}_GATEWAY_PRIVATE_KEY`,
  SANITY_API_TOKEN_READ: 'SANITY_API_TOKEN_READ_PROD',
  GITHUB_CLIENT_ID: 'ID_KONF_APP_GH_CLIENT_ID',
  GITHUB_CLIENT_SECRET: 'ID_KONF_APP_GH_CLIENT_SECRET',
  LINKEDIN_CLIENT_ID: 'ID_KONF_APP_LI_CLIENT_ID',
  LINKEDIN_CLIENT_SECRET: 'ID_KONF_APP_LI_CLIENT_SECRET',
}

export function fnoxName(secret: string, env: Env): string {
  const upper = env.toUpperCase()
  const mapped = FNOX_NAMES[secret]
  if (typeof mapped === 'string') return mapped
  if (mapped) return mapped(upper)
  return `KONF_${upper}_${secret}`
}

export function serviceDir(service: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(service))
    throw new Error(`bad service: ${service}`)
  return service === 'api' ? join(root, 'api') : join(root, 'services', service)
}

export function declaredSecrets(service: string, env: Env): string[] {
  const json = JSON.parse(
    readFileSync(join(serviceDir(service), 'secrets.json'), 'utf8'),
  ) as Record<Env, string[]>
  return json[env]
}

type Run = (
  cmd: string,
  args: string[],
  opts: { cwd: string; input?: Buffer },
) => Buffer

const run: Run = (cmd, args, { cwd, input }) =>
  execFileSync(cmd, args, { cwd, input, stdio: ['pipe', 'pipe', 'inherit'] })

/** Declared names missing from `wrangler secret list --format json`. */
export function missingSecrets(
  service: string,
  env: Env,
  exec: Run = run,
): string[] {
  const listed = JSON.parse(
    exec(
      'pnpm',
      ['exec', 'wrangler', 'secret', 'list', '--env', env, '--format', 'json'],
      {
        cwd: serviceDir(service),
      },
    ).toString(),
  ) as { name: string }[]
  const have = new Set(listed.map((s) => s.name))
  return declaredSecrets(service, env).filter((n) => !have.has(n))
}

export function sync(
  service: string,
  env: Env,
  exec: Run = run,
  log = console.log,
) {
  const cwd = serviceDir(service)
  for (const name of declaredSecrets(service, env)) {
    const value = exec('fnox', ['get', fnoxName(name, env)], { cwd: root })
    exec('pnpm', ['exec', 'wrangler', 'secret', 'put', name, '--env', env], {
      cwd,
      input: value,
    })
    log(`ok ${name}`)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [service, env, flag] = process.argv.slice(2)
  if (
    !service ||
    (env !== 'preview' && env !== 'production') ||
    (flag && flag !== '--check')
  ) {
    console.error(
      'usage: secrets-sync <service> <preview|production> [--check]',
    )
    process.exit(2)
  }
  if (flag) {
    const missing = missingSecrets(service, env)
    for (const n of missing)
      console.error(`missing ${n} on ${service} (${env})`)
    if (missing.length) process.exit(1)
    console.log(`ok ${service} (${env}): all declared secrets present`)
  } else {
    sync(service, env)
  }
}
