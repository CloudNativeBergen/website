/**
 * Post-merge guard for the scoped auth coverage gate.
 *
 * Vitest applies the per-file thresholds in `vitest.config.ts` by matching
 * each glob against the files in the coverage map, RELATIVE TO ITS ROOT. A
 * glob that matches nothing passes silently — no warning, exit 0. In the
 * sharded CI layout the map is assembled from blobs written on other runners
 * and keyed by THEIR absolute paths, so any drift (a container job, a renamed
 * gated file, a `working-directory`) would turn the gate into a no-op with a
 * green check. This asserts that every gated file has an entry at exactly
 * `<root>/<gated path>` — a suffix match would accept another checkout's
 * paths, which is the very drift Vitest's own matching rejects.
 *
 *   pnpm tsx scripts/assert-gated-coverage.ts   # after `vitest run --coverage`
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Vitest's root is the directory holding vitest.config.ts: the repo root. */
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**
 * Gated files (root-relative, as written in `coverage.thresholds`) that have
 * no entry in the coverage map under THIS root. Exact path equality on
 * purpose; see the header.
 */
export function findMissingGated(
  reportKeys: readonly string[],
  gated: readonly string[],
  root: string = ROOT,
): string[] {
  const present = new Set(reportKeys.map((k) => path.resolve(k)))
  return gated.filter((rel) => !present.has(path.resolve(root, rel)))
}

async function main() {
  const { default: config } = await import('../vitest.config')
  const thresholds = config.test?.coverage?.thresholds as
    Record<string, unknown> | undefined
  if (!thresholds) {
    console.error(
      'assert-gated-coverage: vitest.config.ts resolved with NO thresholds — ' +
        'the --shard opt-out fired outside a shard?',
    )
    process.exit(1)
  }
  const gated = Object.keys(thresholds).filter((k) => k.includes('/'))
  if (gated.length === 0) {
    console.error('assert-gated-coverage: no per-file thresholds found')
    process.exit(1)
  }

  const report = path.resolve(ROOT, 'coverage/coverage-final.json')
  const keys = Object.keys(
    JSON.parse(readFileSync(report, 'utf8')) as Record<string, unknown>,
  )
  const missing = findMissingGated(keys, gated)
  if (missing.length > 0) {
    console.error(
      `assert-gated-coverage: ${missing.length} gated file(s) have no entry at ${ROOT}/<path> in ${report}; ` +
        'their thresholds were never judged:',
    )
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }
  console.log(
    `assert-gated-coverage: all ${gated.length} gated files present under ${ROOT}`,
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main()
}
