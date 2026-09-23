/**
 * @vitest-environment node
 *
 * Unmocked smoke test for `pnpm erase-speaker`. The runbook's CLI runs
 * `src/lib/speaker/erasure.ts` under plain Node (tsx), where Vitest's
 * `server-only` alias does not exist — the real package throws on import. A
 * `server-only` marker anywhere in erasure's import graph kills every mode of
 * the CLI before it reads its arguments, and no mocked test can see that.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')

describe('erase-speaker CLI', () => {
  it('loads its import graph under plain Node and prints usage', () => {
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/erase-speaker.ts'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SANITY_PROJECT_ID: 'smoketest',
          NEXT_PUBLIC_SANITY_DATASET: 'smoketest',
        },
      },
    )
    expect(run.stderr).toContain('Usage: pnpm erase-speaker')
    expect(run.status).toBe(1)
  }, 40_000)
})
