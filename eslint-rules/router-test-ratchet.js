#!/usr/bin/env node
/**
 * ROUTER-TEST RATCHET — "a tRPC router may not ship without a test that
 * instantiates it" (P1 of RunKonf/platform#58).
 *
 * `signing` shipped a public, token-authorized, PDF-writing, pipeline-advancing
 * router with zero tests, and nothing noticed: deleting its already-signed
 * guard left the whole suite green. Nothing stops the next one. This does.
 *
 *   node eslint-rules/router-test-ratchet.js            # check   (pnpm lint:routers)
 *   node eslint-rules/router-test-ratchet.js --update   # rewrite (pnpm lint:routers:update)
 *                                                       # refuses to ADD a router
 *                                                       # unless --allow-increase
 *
 * Shaped after `tenancy-ratchet.js`, deliberately: same baseline-freezes-debt
 * contract, same "regeneration is an explicit, committed, reviewed act", same
 * `--update` that only ratchets DOWN. Read that file's header for the reasoning;
 * what differs here is the unit and the detector.
 *
 * WHAT COUNTS AS TESTED. Every key of `appRouter` in `src/server/_app.ts`. A
 * router is covered when some test file either
 *
 *   (a) names its exported identifier (`signingRouter`) — the co-located style,
 *       `signingRouter.createCaller(ctx)`; or
 *   (b) contains `createCaller` AND `.<key>.` — the whole-app style,
 *       `appRouter.createCaller(ctx)` then `caller.signing.getContract(...)`.
 *
 * Both halves of (b) are required: `.organization.` alone matches an ordinary
 * field access on a conference document, which is how a plain substring scan
 * scores four untested routers as covered.
 *
 * WHAT THIS CANNOT CATCH (state it, do not paper over it):
 *  - DEPTH. One `expect(...).toBeDefined()` clears the bar. This proves a test
 *    reaches the router, never that it asserts anything worth asserting.
 *  - PROCEDURES. The unit is the router, so a new procedure added to an
 *    already-covered router is invisible here.
 *  - A test that instantiates a router only incidentally — a tenancy sweep that
 *    calls one procedure, say — counts the whole router as covered.
 *  - Routers not mounted in `appRouter`, and sub-routers nested inside one.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..')
const APP_ROUTER_PATH = path.join(REPO_ROOT, 'src/server/_app.ts')
const BASELINE_PATH = path.join(__dirname, 'router-test.baseline.json')
const BASELINE_REL = path.relative(REPO_ROOT, BASELINE_PATH)
const UPDATE_COMMAND = 'pnpm run lint:routers:update'
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'storybook-static',
  'worktrees',
  'dist',
  // This directory's own tests quote router names as fixture strings; scanning
  // them would score a router as covered because the RATCHET mentions it.
  'eslint-rules',
])

/** `{ key: 'signing', variable: 'signingRouter' }` for every mounted router. */
function readRouters(appPath = APP_ROUTER_PATH) {
  const source = fs.readFileSync(appPath, 'utf8')
  const body = source.split('export const appRouter = router({')[1]
  if (!body) {
    throw new Error(`Could not find the appRouter literal in ${appPath}`)
  }
  return [...body.matchAll(/^\s*(\w+):\s*(\w+Router),/gm)].map((m) => ({
    key: m[1],
    variable: m[2],
  }))
}

function testFiles(dir = REPO_ROOT, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) testFiles(full, found)
    else if (/\.test\.tsx?$/.test(entry.name)) found.push(full)
  }
  return found
}

/**
 * The detector, kept pure and exported so `router-test-ratchet.test.ts` can pin
 * it against synthetic sources without walking the repo. Returns the keys of
 * routers no test instantiates, sorted.
 */
function findUntested(routers, sources) {
  return routers
    .filter(
      ({ key, variable }) =>
        !sources.some(
          (text) =>
            text.includes(variable) ||
            (text.includes('createCaller') && text.includes(`.${key}.`)),
        ),
    )
    .map(({ key }) => key)
    .sort()
}

function readBaseline(baselinePath = BASELINE_PATH) {
  if (!fs.existsSync(baselinePath)) {
    console.error(
      `Missing baseline ${BASELINE_REL}. Generate it with \`${UPDATE_COMMAND}\`.`,
    )
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8')).untested ?? []
}

function writeBaseline(untested, baselinePath = BASELINE_PATH) {
  const body = {
    generatedBy: UPDATE_COMMAND,
    note: 'tRPC routers with no test that instantiates them. This list may only SHRINK — a new entry fails CI. See eslint-rules/router-test-ratchet.js.',
    count: untested.length,
    untested,
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(body, null, 2)}\n`)
}

/**
 * `--update`. Writes and returns 0 — UNLESS a router not already in the
 * baseline is untested, in which case it writes nothing and returns 1.
 * `--allow-increase` is the explicit, greppable bypass; the added name still
 * lands in the committed diff for a reviewer. A missing baseline bootstraps.
 */
function updateBaseline(
  current,
  { allowIncrease = false, baselinePath = BASELINE_PATH } = {},
) {
  const bootstrap = !fs.existsSync(baselinePath)
  const previous = bootstrap ? [] : readBaseline(baselinePath)
  const added = current.filter((key) => !previous.includes(key))

  if (!bootstrap && added.length > 0 && !allowIncrease) {
    console.error(
      [
        `REFUSED: ${added.length} router(s) would be ADDED to ${BASELINE_REL}; it is left untouched:`,
        `  ${added.join(', ')}`,
        '',
        'Write a test that instantiates them — or, to deliberately widen the debt,',
        'rerun with `--allow-increase` and let the reviewer see the added names.',
      ].join('\n'),
    )
    return 1
  }

  const removed = previous.filter((key) => !current.includes(key))
  writeBaseline(current, baselinePath)
  console.log(
    `Wrote ${BASELINE_REL}: ${current.length} untested router(s) (was ${previous.length}).`,
  )
  if (added.length) console.log(`  added:   ${added.join(', ')}`)
  if (removed.length) console.log(`  covered: ${removed.join(', ')}`)
  return 0
}

function main() {
  const routers = readRouters()
  const sources = testFiles().map((f) => fs.readFileSync(f, 'utf8'))
  const current = findUntested(routers, sources)

  if (process.argv.includes('--update')) {
    return updateBaseline(current, {
      allowIncrease: process.argv.includes('--allow-increase'),
    })
  }

  const baseline = readBaseline()
  const added = current.filter((key) => !baseline.includes(key))
  const covered = baseline.filter((key) => !current.includes(key))

  console.log(
    `router tests: ${routers.length - current.length}/${routers.length} routers instantiated by a test ` +
      `(baseline allows ${baseline.length} untested).`,
  )

  if (covered.length > 0) {
    console.log(
      `\nNewly covered — run \`${UPDATE_COMMAND}\` to lock them in:\n  ${covered.join(', ')}`,
    )
  }

  if (added.length === 0) {
    console.log('\nOK: no router outside the baseline is untested.')
    return 0
  }

  console.error(
    [
      '',
      `FAIL: ${added.length} router(s) have no test that instantiates them:`,
      `  ${added.join(', ')}`,
      '',
      'Add a test that builds a caller — `<name>Router.createCaller(ctx)`, or',
      '`appRouter.createCaller(ctx)` and then `caller.<key>.<procedure>(...)`.',
      'See src/server/routers/signing.test.ts for the shape.',
      '',
      `Widening the baseline is a deliberate, reviewed act: \`${UPDATE_COMMAND} --allow-increase\``,
      `and commit ${BASELINE_REL}.`,
    ].join('\n'),
  )
  return 1
}

if (require.main === module) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

module.exports = { findUntested, readRouters, updateBaseline }
