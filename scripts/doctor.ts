#!/usr/bin/env tsx

/**
 * `pnpm run doctor` / `mise run doctor` (bare `pnpm doctor` is a pnpm builtin): checks the local toolchain and
 * credentials. Prints one pass/fail line per check with a fix hint, never a
 * secret value. Exits 1 when any check fails. The Sanity check runs one
 * read-only count() query.
 */

import { execFileSync } from 'child_process'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

export type Run = (cmd: string, args: string[]) => string
export type Result = { name: string; ok: boolean; detail: string; fix?: string }

const run: Run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const tryRun = (r: Run, cmd: string, args: string[]) => {
  try {
    return { ok: true as const, out: r(cmd, args) }
  } catch (e) {
    return { ok: false as const, out: (e as Error).message }
  }
}

/** Major version wanted by `.mise.toml` `[tools]` (e.g. node = "24"). */
export function wantedMajor(miseToml: string, tool: string) {
  return miseToml.match(new RegExp(`^${tool}\\s*=\\s*"(\\d+)`, 'm'))?.[1]
}

export function checkVersion(
  r: Run,
  tool: 'node' | 'pnpm',
  want: string | undefined,
): Result {
  const name = `${tool} version`
  const got = tryRun(r, tool, ['--version'])
  if (!got.ok)
    return { name, ok: false, detail: 'not found', fix: 'mise install' }
  const v = got.out.replace(/^v/, '')
  if (want && v.split('.')[0] !== want)
    return {
      name,
      ok: false,
      detail: `${v}, .mise.toml wants ${want}`,
      fix: 'mise install && mise trust',
    }
  return { name, ok: true, detail: v }
}

/** fnox installed and the keychain returns the read token. */
export function checkFnox(r: Run): { result: Result; token?: string } {
  const name = 'fnox keychain'
  if (!tryRun(r, 'fnox', ['--version']).ok)
    return {
      result: {
        name,
        ok: false,
        detail: 'fnox not installed',
        fix: 'mise install',
      },
    }
  const got = tryRun(r, 'fnox', ['get', 'SANITY_API_TOKEN_READ'])
  if (!got.ok || !got.out)
    return {
      result: {
        name,
        ok: false,
        detail: 'SANITY_API_TOKEN_READ not found in keychain',
        fix: 'security unlock-keychain, then fnox doctor',
      },
    }
  return {
    result: { name, ok: true, detail: 'reads keychain secrets' },
    token: got.out,
  }
}

/** One cheap authenticated read-only query; anything but 401/403 passes. */
export async function checkSanity(
  token: string | undefined,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
): Promise<Result> {
  const name = 'SANITY_API_TOKEN_READ'
  const fix =
    'set it in the keychain (fnox set) or env; see scripts/backfill-conference.ts'
  if (!token) return { name, ok: false, detail: 'not set', fix }
  const project = env.NEXT_PUBLIC_SANITY_PROJECT_ID
  const dataset = env.NEXT_PUBLIC_SANITY_DATASET
  if (!project || !dataset)
    return {
      name,
      ok: false,
      detail: 'set, but cannot validate',
      fix: 'set NEXT_PUBLIC_SANITY_PROJECT_ID and NEXT_PUBLIC_SANITY_DATASET in .env',
    }
  const query = encodeURIComponent('{"n": count(*[_type == "conference"])}')
  try {
    const res = await fetchFn(
      `https://${project}.api.sanity.io/v2023-05-03/data/query/${dataset}?query=${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.status === 401 || res.status === 403)
      return { name, ok: false, detail: `set, invalid (${res.status})`, fix }
    return { name, ok: true, detail: `set, valid (${res.status})` }
  } catch {
    return {
      name,
      ok: false,
      detail: 'set, Sanity unreachable',
      fix: 'check network',
    }
  }
}

export function checkCommand(
  r: Run,
  name: string,
  cmd: string,
  args: string[],
  fix: string,
): Result {
  const got = tryRun(r, cmd, args)
  // wrangler whoami exits 0 and says so when logged out.
  return got.ok && !/not authenticated|not logged in/i.test(got.out)
    ? { name, ok: true, detail: 'authenticated' }
    : { name, ok: false, detail: 'not authenticated', fix }
}

export async function doctor(
  r: Run = run,
  env: Record<string, string | undefined> = process.env,
  miseToml = readFileSync(resolve(process.cwd(), '.mise.toml'), 'utf8'),
  fetchFn: typeof fetch = fetch,
): Promise<Result[]> {
  const fnox = checkFnox(r)
  return [
    checkVersion(r, 'node', wantedMajor(miseToml, 'node')),
    checkVersion(r, 'pnpm', wantedMajor(miseToml, 'pnpm')),
    fnox.result,
    await checkSanity(env.SANITY_API_TOKEN_READ || fnox.token, env, fetchFn),
    checkCommand(r, 'wrangler', 'wrangler', ['whoami'], 'wrangler login'),
    checkCommand(r, 'gh', 'gh', ['auth', 'status'], 'gh auth login'),
  ]
}

async function main() {
  config({ path: resolve(process.cwd(), '.env') })
  config({ path: resolve(process.cwd(), '.env.local'), override: true })
  const results = await doctor()
  for (const x of results)
    console.log(
      `${x.ok ? 'PASS' : 'FAIL'}  ${x.name}: ${x.detail}${x.ok || !x.fix ? '' : `  (fix: ${x.fix})`}`,
    )
  process.exit(results.every((x) => x.ok) ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) void main()
