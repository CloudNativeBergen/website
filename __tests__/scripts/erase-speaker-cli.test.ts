/**
 * @vitest-environment node
 *
 * Unmocked smoke test for `pnpm erase-speaker`, run through the REAL package
 * script so it cannot drift from `package.json`. Erasure's import graph holds
 * `import 'server-only'`, which throws under plain Node; the script passes
 * `--conditions=react-server`, under which that package resolves to an empty
 * module. Drop the flag and every CLI mode dies before reading its arguments —
 * which no mocked test can see, because Vitest aliases `server-only` away.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')

describe('erase-speaker CLI', () => {
  it('loads its import graph through the package script and prints usage', () => {
    const run = spawnSync('pnpm', ['--silent', 'erase-speaker'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SANITY_PROJECT_ID: 'smoketest',
        NEXT_PUBLIC_SANITY_DATASET: 'smoketest',
      },
    })
    expect(run.stderr).toContain('Usage: pnpm erase-speaker')
    expect(run.status).toBe(1)
  }, 40_000)
})
