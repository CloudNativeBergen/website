#!/usr/bin/env node
/**
 * Tenancy lint RATCHET — the "CI ratchet (P2)" promised in the header of
 * `no-unscoped-groq.js` (Phase 1 of RunKonf/platform#53).
 *
 * `tenancy/no-unscoped-groq` already reports every cross-tenant read this repo
 * has leaked through; it is configured as `'warn'` because a tail of
 * pre-existing unscoped reads would otherwise block CI, and nothing in CI reads
 * warnings. So the detector fires and the code ships anyway. This script is the
 * thing that reads it: it re-runs ESLint over the repo, counts that ONE rule per
 * file, and fails when any file carries MORE warnings than the checked-in
 * baseline (`no-unscoped-groq.baseline.json`).
 *
 *   node eslint-rules/tenancy-ratchet.js            # check   (pnpm lint:tenancy)
 *   node eslint-rules/tenancy-ratchet.js --update   # rewrite (pnpm lint:tenancy:update)
 *
 * DESIGN NOTES — the parts that are deliberate:
 *
 *  - PER FILE, not a repo-wide total. A single number lets a query MOVE between
 *    files and hide a +1 behind a -1. The unit of the baseline is therefore the
 *    file path, and every file is judged on its own.
 *
 *  - REGENERATION IS AN EXPLICIT ACT. `--update` is the only thing that writes,
 *    and nothing else (no test, no lint run) invokes it. The baseline is
 *    committed JSON so a raised number shows up in the diff and needs a
 *    reviewer, which is the whole point.
 *
 *  - DECREASES PASS, and are never auto-tightened. A check that rewrote a
 *    tracked file mid-CI would either be a no-op (nothing commits the result) or
 *    need a write token on PR branches; and a silently self-lowering baseline is
 *    a diff nobody reviews. It prints the fixed files and asks for `--update`
 *    instead. COST: until someone regenerates, a file that dropped from 4 to 2
 *    can drift back to 4 without failing.
 *
 *  - DELETION is free: the file is simply gone from the report, its baseline
 *    entry goes stale, and the run passes. A RENAME is not free — the new path
 *    has no baseline, so it fails, and the fix is `--update` plus a diff showing
 *    the same counts under the new path. That is intentional: a rename and a
 *    query MOVED into another file are the same event to a path-keyed baseline,
 *    and catching the move is exactly why this is path-keyed.
 *
 * WHAT THIS CANNOT CATCH (state it, do not paper over it):
 *  - A query CHANGED in place inside an already-warning file: the count is
 *    unchanged, so the ratchet is silent. It freezes the count, not the code.
 *  - Anything the rule itself does not see — `scripts/` is allowlisted by the
 *    rule and runs with the WRITE token (a known gap, see the rule header),
 *    tests, migrations, and the scoped-builder module.
 *  - A false annotation. `groq-global:` / `groq-global-scoped:` clear a warning
 *    on the author's word; the ratchet counts what the rule reports.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const RULE_ID = 'tenancy/no-unscoped-groq'
const REPO_ROOT = path.resolve(__dirname, '..')
const BASELINE_PATH = path.join(__dirname, 'no-unscoped-groq.baseline.json')
const BASELINE_REL = path.relative(REPO_ROOT, BASELINE_PATH)
const UPDATE_COMMAND = 'pnpm run lint:tenancy:update'

/** Sort keys so the committed baseline diffs line-by-line, not wholesale. */
function sortByKey(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [file, counts[file]]),
  )
}

function total(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

/**
 * The comparison, kept pure and exported so `tenancy-ratchet.test.ts` can pin
 * the ratchet's own behaviour without running ESLint. A file absent from either
 * side counts as 0 — that is what makes a new file with warnings an increase and
 * a deleted file a decrease.
 */
function compareCounts(baseline, current) {
  const files = [
    ...new Set([...Object.keys(baseline), ...Object.keys(current)]),
  ]
  const increases = []
  const decreases = []
  for (const file of files.sort()) {
    const before = baseline[file] ?? 0
    const after = current[file] ?? 0
    if (after > before) increases.push({ file, before, after })
    else if (after < before) decreases.push({ file, before, after })
  }
  return { increases, decreases }
}

/**
 * RULE_ID warnings in one ESLint result — SUPPRESSED ONES INCLUDED.
 *
 * ESLint returns anything silenced by an `eslint-disable` comment in
 * `result.suppressedMessages`, separate from `result.messages` (since 8.8), so
 * counting only `messages` let one file-level
 * `eslint-disable tenancy/no-unscoped-groq` zero out every warning in a file —
 * and the ratchet then printed that as `Fixed: N -> 0` and exited 0, reporting
 * a bypass as progress. Summing both halves means a disable comment buys
 * nothing: the file is still judged on how many unscoped reads it contains.
 *
 * Exported so `tenancy-ratchet.test.ts` can pin this without running ESLint.
 */
function countRuleMessages(result) {
  const isRule = (m) => m.ruleId === RULE_ID
  return (
    (result.messages ?? []).filter(isRule).length +
    (result.suppressedMessages ?? []).filter(isRule).length
  )
}

/** Lint the repo exactly as `eslint .` does and count RULE_ID per file. */
async function countWarnings() {
  const { ESLint } = require('eslint')
  const eslint = new ESLint({ cwd: REPO_ROOT })
  const results = await eslint.lintFiles(['.'])
  const counts = {}
  for (const result of results) {
    const n = countRuleMessages(result)
    if (n === 0) continue
    counts[
      path.relative(REPO_ROOT, result.filePath).split(path.sep).join('/')
    ] = n
  }
  return sortByKey(counts)
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `Missing baseline ${BASELINE_REL}. Generate it with \`${UPDATE_COMMAND}\`.`,
    )
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).files ?? {}
}

function writeBaseline(counts) {
  const body = {
    rule: RULE_ID,
    generatedBy: UPDATE_COMMAND,
    note: 'Per-file ceiling for pre-existing unscoped GROQ reads. A number may only go DOWN. See eslint-rules/tenancy-ratchet.js and docs/TENANT_SCOPING.md.',
    total: total(counts),
    files: counts,
  }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`)
}

async function main() {
  const update = process.argv.includes('--update')
  const current = await countWarnings()

  if (update) {
    const previous = fs.existsSync(BASELINE_PATH) ? readBaseline() : {}
    writeBaseline(current)
    const { increases, decreases } = compareCounts(previous, current)
    console.log(
      `Wrote ${BASELINE_REL}: ${total(current)} ${RULE_ID} warnings across ${Object.keys(current).length} files ` +
        `(was ${total(previous)} across ${Object.keys(previous).length}).`,
    )
    for (const { file, before, after } of [...increases, ...decreases]) {
      console.log(`  ${before} -> ${after}  ${file}`)
    }
    return 0
  }

  const baseline = readBaseline()
  const { increases, decreases } = compareCounts(baseline, current)

  console.log(
    `${RULE_ID}: ${total(current)} warnings across ${Object.keys(current).length} files ` +
      `(baseline ${total(baseline)} across ${Object.keys(baseline).length}).`,
  )

  if (decreases.length > 0) {
    console.log(
      `\nFixed (${decreases.length} file(s)) — run \`${UPDATE_COMMAND}\` to lock the lower numbers in:`,
    )
    for (const { file, before, after } of decreases) {
      const gone = !fs.existsSync(path.join(REPO_ROOT, file))
      console.log(
        `  ${before} -> ${after}  ${file}${gone ? '  (removed)' : ''}`,
      )
    }
  }

  if (increases.length === 0) {
    console.log('\nOK: no file exceeds its baseline.')
    return 0
  }

  console.error(
    `\nFAIL: ${increases.length} file(s) above baseline for ${RULE_ID}:`,
  )
  for (const { file, before, after } of increases) {
    console.error(`  ${before} -> ${after}  (+${after - before})  ${file}`)
  }
  console.error(
    [
      '',
      'Each of these is a read of `*` that is not constrained to one tenant.',
      'Fix it — scope the query (scopedFetch / CONFERENCE_FILTER / ORG_FILTER, see',
      'docs/TENANT_SCOPING.md), or annotate the single read with `// groq-global: <reason>`',
      'if it is genuinely cross-tenant, or `// groq-global-scoped: <how>` if it is scoped',
      'by something the rule cannot see.',
      '',
      `Raising the ceiling is a deliberate, reviewed act: \`${UPDATE_COMMAND}\` and commit`,
      `${BASELINE_REL}. A pure file rename lands here too — regenerate, and the diff should`,
      'show the same counts moving to the new path.',
    ].join('\n'),
  )
  return 1
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}

module.exports = { compareCounts, countRuleMessages, RULE_ID }
