#!/usr/bin/env node
/**
 * Local visual-regression harness — a Chromatic stand-in you can run offline.
 *
 * Captures every selected Storybook story at two points in history, diffs the
 * PNGs pixel by pixel, and reports which stories moved and by how much. Built
 * for large mechanical refactors (a Tailwind palette -> design-token codemod
 * touching hundreds of files) where the diff is too big to review by reading.
 *
 * USAGE
 *   pnpm visual-diff baseline [ref]     capture the "before" side
 *   pnpm visual-diff candidate [ref]    capture the "after" side
 *   pnpm visual-diff report             compare them and write the report
 *   pnpm visual-diff list               print the stories that would be shot
 *
 *   `ref` is any git revision (main, HEAD~1, a sha). Omit it to capture the
 *   working tree AS IS — including uncommitted changes. A named ref is checked
 *   out into a throwaway git worktree, so your working tree is never touched.
 *
 * TYPICAL RUN
 *   pnpm visual-diff baseline main            # before the codemod
 *   pnpm visual-diff candidate                # your dirty working tree
 *   pnpm visual-diff report                   # then open the printed index.html
 *
 * OPTIONS (all commands)
 *   --include <regex>   keep only stories matching (repeatable; matched against
 *                       story id + sidebar title + import path)
 *   --exclude <regex>   drop stories matching (repeatable; wins over --include)
 *   --all               drop the default admin-surface exclusion
 *   --limit <n>         cap the story count (smoke-test the harness itself)
 *   --themes <list>     default "light,dark" — hand-written .dark blocks are
 *                       exactly what a palette codemod is most likely to break
 *   --width/--height    viewport, default 1280x800
 *   --dpr <n>           device scale factor, default 1
 *   --max-height <n>    clip full-page shots taller than this, default 5000
 *   --concurrency <n>   parallel pages, default 4
 *   --settle <ms>       pause after load before the shutter, default 400
 *   --probe <ms>        stability re-shot delay, default 500 (0 disables)
 *   --allow-external    let stories reach the internet (off by default; see
 *                       DETERMINISM)
 *   --port <n>          Storybook port, default 6207 (NOT shoot-story's 6006)
 *   --reuse-server      attach to a Storybook already on --port (see below)
 *   --out <dir>         output root, default .visual-diff (gitignored)
 *
 * OPTIONS (report)
 *   --threshold <n>     per-channel delta that makes a pixel "changed" (0-255),
 *                       default 8 — absorbs anti-aliasing jitter
 *   --diff-ratio <n>    write a side-by-side image at/above this changed-pixel
 *                       ratio, default 0.0002
 *   --min-ratio <n>     changed-pixel ratio at/above which a story is reported
 *                       as a real diff rather than sub-threshold noise,
 *                       default 0.0002
 *   --top <n>           rows in the console table, default 25
 *   --fail-on-change    exit 1 when any story exceeds --min-ratio
 *
 * DETERMINISM
 *   Every capture runs with a fixed browser clock, UTC, en-US, reduced motion
 *   and animations/transitions disabled, and every request to a non-local host
 *   is refused — a story embedding live third-party content (a YouTube iframe,
 *   a remote avatar) otherwise renders whatever that third party served at that
 *   moment, and the two runs disagree for reasons that have nothing to do with
 *   your change.
 *
 *   Each story is then shot twice in the same page; if the two shots differ
 *   the story is flagged UNSTABLE and quarantined out of the actionable list
 *   instead of being reported as a change. Stories that pin `globalThis.Date`
 *   in `beforeEach` (the repo convention, see AGENTS.md) still override the
 *   harness clock — that is fine, they are deterministic either way.
 *
 * PORTS
 *   The harness serves Storybook on :6207 and refuses to attach to a server it
 *   did not start, because a Storybook left running by a different checkout
 *   serves that checkout's stories — which silently makes a whole run describe
 *   the wrong branch. Pass --reuse-server only when you know whose it is.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startStorybook, fetchStoryIndex } from './storybook.mjs'
import { captureAll } from './capture.mjs'
import { compareRuns } from './compare.mjs'
import { materializeRef, repoRoot, describeTree } from './worktree.mjs'
import {
  selectStories,
  summarize,
  rankRows,
  formatTable,
  formatPct,
  DEFAULT_EXCLUDE,
} from './pixels.mjs'

const HELP = (await fs.readFile(fileURLToPath(import.meta.url), 'utf8'))
  .split('*/')[0]
  .replace(/^#!.*\n/, '')
  .replace(/^\/\*\*\n/, '')
  .replace(/^ \* ?/gm, '')

function parseArgs(argv) {
  const flags = { include: [], exclude: [] }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [rawKey, inlineValue] = splitFlag(arg)
    const key = rawKey.replace(/^--/, '')
    const boolean = [
      'all',
      'allow-external',
      'reuse-server',
      'fail-on-change',
      'keep-worktree',
      'help',
    ].includes(key)
    const value = boolean ? true : (inlineValue ?? argv[++i])
    if (key === 'include' || key === 'exclude') flags[key].push(value)
    else flags[key] = value
  }
  return { command: positional[0], ref: positional[1], flags }
}

function splitFlag(arg) {
  const eq = arg.indexOf('=')
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)]
}

const num = (v, fallback) => (v === undefined ? fallback : Number(v))

async function main() {
  const { command, ref, flags } = parseArgs(process.argv.slice(2))
  if (!command || flags.help || command === 'help') {
    console.log(HELP)
    return 0
  }

  const root = await repoRoot()
  const outRoot = path.resolve(root, flags.out ?? '.visual-diff')
  const port = num(flags.port, 6207)
  const filters = {
    include: flags.include,
    exclude: [...flags.exclude, ...(flags.all ? [] : DEFAULT_EXCLUDE)],
    limit: num(flags.limit, 0),
  }

  switch (command) {
    case 'baseline':
    case 'candidate':
      return capture({ command, ref, flags, root, outRoot, port, filters })
    case 'list':
      return list({ flags, root, outRoot, port, filters })
    case 'report':
      return report({ flags, outRoot })
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      return 2
  }
}

/** Boot Storybook for a tree, hand the running port to `fn`, then tear down. */
async function withStorybook({ root, ref, flags, port, outRoot, label }, fn) {
  const log = (msg) => console.log(`[visual-diff] ${msg}`)
  const tree = await describeTree(root, ref ?? null)
  const materialized = await materializeRef({
    root,
    ref: ref ?? null,
    dir: path.join(outRoot, 'worktrees', label),
    log,
  })
  let server
  try {
    server = await startStorybook({
      cwd: materialized.dir,
      port,
      allowReuse: !!flags['reuse-server'],
      log,
    })
    return await fn({ tree, log })
  } finally {
    server?.stop()
    if (!flags['keep-worktree']) await materialized.cleanup()
  }
}

async function capture({ command, ref, flags, root, outRoot, port, filters }) {
  const outDir = path.join(outRoot, command)
  return withStorybook(
    { root, ref, flags, port, outRoot, label: command },
    async ({ tree, log }) => {
      const stories = selectStories(await fetchStoryIndex(port), filters)
      const themes = String(flags.themes ?? 'light,dark')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      log(
        `${command}: ${tree.ref}${tree.dirty ? ' (dirty)' : ''} ${tree.sha.slice(0, 8)} — ` +
          `${stories.length} stories x ${themes.length} themes`,
      )
      if (!stories.length) {
        console.error('[visual-diff] no stories matched the filters')
        return 1
      }
      const manifest = await captureAll({
        port,
        stories,
        outDir,
        themes,
        width: num(flags.width, 1280),
        height: num(flags.height, 800),
        dpr: num(flags.dpr, 1),
        maxHeight: num(flags['max-height'], 5000),
        concurrency: num(flags.concurrency, 4),
        settleMs: num(flags.settle, 400),
        probeMs: num(flags.probe, 500),
        blockExternal: !flags['allow-external'],
        meta: { command, tree, filters },
        log,
      })
      const errored = manifest.records.filter((r) => r.status !== 'ok')
      const unstable = manifest.records.filter((r) => r.unstable)
      log(
        `${command} done in ${(manifest.durationMs / 1000).toFixed(0)}s — ` +
          `${manifest.records.length} shots, ${errored.length} errored, ` +
          `${unstable.length} unstable`,
      )
      log(`wrote ${path.relative(root, outDir)}`)
      return 0
    },
  )
}

async function list({ flags, root, outRoot, port, filters }) {
  return withStorybook(
    { root, ref: undefined, flags, port, outRoot, label: 'list' },
    async () => {
      const stories = selectStories(await fetchStoryIndex(port), filters)
      stories.forEach((s) => console.log(s.id))
      console.log(`\n${stories.length} stories`)
      return 0
    },
  )
}

async function report({ flags, outRoot }) {
  const log = (msg) => console.log(`[visual-diff] ${msg}`)
  const reportDir = path.join(outRoot, 'report')
  const { rows, baseline, candidate } = await compareRuns({
    baselineDir: path.join(outRoot, 'baseline'),
    candidateDir: path.join(outRoot, 'candidate'),
    reportDir,
    channelThreshold: num(flags.threshold, 8),
    diffRatio: num(flags['diff-ratio'], 0.0002),
    log,
  })

  const minRatio = num(flags['min-ratio'], 0.0002)
  const buckets = summarize(rows, { minRatio })
  const top = num(flags.top, 25)

  const header = [
    '',
    '='.repeat(78),
    `VISUAL DIFF  ${describe(baseline)}  ->  ${describe(candidate)}`,
    '='.repeat(78),
    `${buckets.total} story/theme pairs compared`,
    `  changed   ${buckets.changed.length}`,
    `  unstable  ${buckets.unstable.length}  (non-deterministic; diffs not trustworthy)`,
    `  noise     ${buckets.noise.length}  (below ${formatPct(minRatio)})`,
    `  identical ${buckets.identical.length}`,
    `  missing   ${buckets.missing.length}`,
    `  errored   ${buckets.errored.length}`,
    '',
    `CHANGED — worst first (top ${Math.min(top, buckets.changed.length)}):`,
    formatTable(buckets.changed, top),
  ]
  if (buckets.unstable.length)
    header.push(
      '',
      'UNSTABLE — these stories render differently shot-to-shot, so their',
      'diffs mean nothing. Usual causes: a relative timestamp (pin',
      "`globalThis.Date` in the story's `beforeEach` — see AGENTS.md), or a",
      '`play` function still mutating the DOM when the shutter fires:',
      formatTable(buckets.unstable, 10),
    )
  if (buckets.missing.length)
    header.push(
      '',
      'MISSING — story exists on only one side:',
      formatTable(buckets.missing, 10),
    )
  if (buckets.errored.length)
    header.push(
      '',
      'ERRORED — story failed to render:',
      formatTable(buckets.errored, 10),
    )
  console.log(header.join('\n'))

  await fs.writeFile(
    path.join(reportDir, 'report.json'),
    `${JSON.stringify(
      {
        baseline: baseline.tree,
        candidate: candidate.tree,
        options: { minRatio, threshold: num(flags.threshold, 8) },
        counts: Object.fromEntries(
          Object.entries(buckets).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.length : v,
          ]),
        ),
        rows: rankRows(rows),
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(reportDir, 'index.html'),
    renderHtml(buckets, baseline, candidate),
  )
  log(`report written to ${reportDir}`)
  log(`open ${path.join(reportDir, 'index.html')}`)

  if (flags['fail-on-change'] && buckets.changed.length) return 1
  return 0
}

function describe(manifest) {
  const t = manifest.tree ?? {}
  return `${t.ref ?? '?'}${t.dirty ? '+dirty' : ''}@${(t.sha ?? '').slice(0, 8)}`
}

function renderHtml(buckets, baseline, candidate) {
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    )
  const section = (title, rows) =>
    !rows.length
      ? ''
      : `<h2>${esc(title)} <small>(${rows.length})</small></h2>` +
        rows
          .map(
            (r) => `<article>
  <h3>${esc(r.key)}</h3>
  <p>${formatPct(r.changedRatio)} changed · ${r.changedPixels} px · max Δ${r.maxDelta}${
    r.sizeChanged ? ' · SIZE CHANGED' : ''
  }${r.unstable ? ' · UNSTABLE' : ''}${r.note ? ` · ${esc(r.note)}` : ''}</p>
  ${r.diffImage ? `<img loading="lazy" src="${esc(r.diffImage)}" alt="${esc(r.key)}">` : ''}
</article>`,
          )
          .join('\n')
  return `<!doctype html>
<meta charset="utf-8">
<title>Visual diff — ${esc(describe(baseline))} → ${esc(describe(candidate))}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 1600px; padding: 0 1rem; }
  h1 { font-size: 1.25rem; }
  article { border-top: 1px solid #d1d5db; padding: 1rem 0; }
  h3 { font-family: ui-monospace, monospace; font-size: .95rem; margin: 0; }
  p { color: #6b7280; margin: .25rem 0 .75rem; }
  img { max-width: 100%; border: 1px solid #e5e7eb; }
  @media (prefers-color-scheme: dark) {
    body { background: #111827; color: #e5e7eb; }
    article { border-color: #374151; }
    img { border-color: #374151; }
  }
</style>
<h1>Visual diff — ${esc(describe(baseline))} → ${esc(describe(candidate))}</h1>
<p>changed ${buckets.changed.length} · unstable ${buckets.unstable.length} · noise ${buckets.noise.length} · identical ${buckets.identical.length} · missing ${buckets.missing.length} · errored ${buckets.errored.length}</p>
${section('Changed', buckets.changed)}
${section('Unstable (non-deterministic — diff not trustworthy)', buckets.unstable)}
${section('Missing', buckets.missing)}
${section('Errored', buckets.errored)}
`
}

process.exitCode = await main()
