/**
 * Post-merge guard for the scoped auth coverage gate.
 *
 * Vitest applies the per-file thresholds in `vitest.config.ts` by matching
 * each glob against the files present in the coverage map. A glob that matches
 * NOTHING passes silently — no warning, exit 0. In the sharded CI layout the
 * map is assembled from blobs written on other runners and keyed by THEIR
 * absolute paths, so any drift (a container job, a renamed gated file, a
 * `working-directory`) would turn the gate into a no-op with a green check.
 * This asserts that every gated file has an entry in the merged report.
 *
 *   pnpm tsx scripts/assert-gated-coverage.ts   # after `vitest run --coverage`
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import config from '../vitest.config'

const REPORT = path.resolve('coverage/coverage-final.json')

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

const report = JSON.parse(readFileSync(REPORT, 'utf8')) as Record<
  string,
  unknown
>
const covered = Object.keys(report).map((p) => p.split(path.sep).join('/'))

const missing = gated.filter(
  (rel) => !covered.some((abs) => abs === rel || abs.endsWith('/' + rel)),
)
if (missing.length > 0) {
  console.error(
    `assert-gated-coverage: ${missing.length} gated file(s) absent from ${REPORT}; ` +
      'their thresholds were never judged:',
  )
  for (const m of missing) console.error(`  - ${m}`)
  process.exit(1)
}
console.log(
  `assert-gated-coverage: all ${gated.length} gated files present in the merged report`,
)
