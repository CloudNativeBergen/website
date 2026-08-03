/**
 * Pure helpers for the local visual-diff harness (see ./cli.mjs).
 *
 * Everything here is dependency-free and free of Node/browser globals so it can
 * be BOTH unit-tested with vitest (`__tests__/scripts/visual-diff.test.ts`) and
 * stringified into a Chromium page by `compare.mjs` — the harness decodes PNGs
 * with the browser's own canvas rather than pulling in pixelmatch/pngjs.
 *
 * Because `comparePixels` is shipped to the page via `Function.prototype
 * .toString()`, it must not close over module scope or reference imports.
 */

/**
 * One story/theme pair's comparison result, as produced by `compare.mjs` and
 * consumed by the ranking/reporting helpers below.
 *
 * @typedef {object} DiffRow
 * @property {string} key           e.g. `components-layout-hero--default@dark`
 * @property {string} status        'ok' | 'missing' | 'error'
 * @property {number} changedRatio  changed pixels / total pixels, 0..1
 * @property {number} changedPixels
 * @property {number} maxDelta      largest single-channel delta, 0..255
 * @property {boolean} [unstable]   the story re-renders differently shot to shot
 * @property {boolean} [sizeChanged]
 * @property {string} [note]
 */

/** Story entries that are never worth capturing (docs pages, MDX, autodocs). */
const NON_STORY_TYPES = new Set(['docs'])

/** Opt-out tag a story can set to stay out of every visual-diff run. */
export const SKIP_TAG = 'visual-diff:skip'

/**
 * Default exclusions: the codemod this harness exists for lands on the public
 * site, and admin surfaces roughly double the run time for little signal.
 * Callers pass `--all` to drop these.
 */
export const DEFAULT_EXCLUDE = ['(^|/)admin', '\\(admin\\)']

/**
 * Select and order the stories to capture from a Storybook `/index.json`.
 *
 * @param {Record<string, object> | object[]} entries Storybook index entries.
 * @param {{include?: string[], exclude?: string[], limit?: number}} [options]
 * @returns {{id: string, title: string, name: string, importPath: string}[]}
 */
export function selectStories(entries, options = {}) {
  const { include = [], exclude = [], limit = 0 } = options
  const list = Array.isArray(entries) ? entries : Object.values(entries ?? {})
  const includeRes = include.map((p) => new RegExp(p, 'i'))
  const excludeRes = exclude.map((p) => new RegExp(p, 'i'))

  const selected = list
    .filter((e) => e && typeof e.id === 'string')
    .filter((e) => !NON_STORY_TYPES.has(e.type))
    .filter((e) => !(e.tags ?? []).includes(SKIP_TAG))
    .filter((e) => {
      // Each field is matched SEPARATELY (not as one concatenated string) so a
      // caller's `^` anchors to the start of a story id, a sidebar title or an
      // import path rather than only ever to the id. Storybook writes import
      // paths as `./src/...`; the `./` is stripped so `^src/components/…`
      // reads the way anyone would expect.
      const fields = [
        e.id,
        e.title ?? '',
        (e.importPath ?? '').replace(/^\.\//, ''),
      ]
      const matches = (re) => fields.some((f) => re.test(f))
      if (excludeRes.some(matches)) return false
      if (includeRes.length && !includeRes.some(matches)) return false
      return true
    })
    .map((e) => ({
      id: e.id,
      title: e.title ?? '',
      name: e.name ?? '',
      importPath: e.importPath ?? '',
    }))
    // Stable order so two runs capture in the same sequence — which also means
    // any Vite on-demand compile cost lands on the same stories both times.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return limit > 0 ? selected.slice(0, limit) : selected
}

/**
 * Compare two RGBA rasters.
 *
 * Runs inside the browser page, so it takes plain `{width, height, data}`
 * objects (`data` is RGBA, 4 bytes per pixel) and returns plain data. Pixels
 * outside the overlapping region of differently-sized images count as changed
 * and set `sizeChanged`.
 *
 * @param {{width: number, height: number, data: ArrayLike<number>}} a baseline
 * @param {{width: number, height: number, data: ArrayLike<number>}} b candidate
 * @param {{channelThreshold?: number}} [options] per-channel delta (0-255)
 *   below which a pixel counts as unchanged; absorbs anti-aliasing jitter.
 * @returns {{width: number, height: number, changedPixels: number,
 *   totalPixels: number, changedRatio: number, maxDelta: number,
 *   meanDelta: number, sizeChanged: boolean, mask: Uint8Array}}
 *   `mask` is one byte per pixel of the union canvas: 0 = same, 1 = changed,
 *   2 = present in only one image.
 */
export function comparePixels(a, b, options = {}) {
  const channelThreshold =
    options.channelThreshold === undefined ? 8 : options.channelThreshold
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  const overlapW = Math.min(a.width, b.width)
  const overlapH = Math.min(a.height, b.height)
  const mask = new Uint8Array(width * height)

  let changedPixels = 0
  let maxDelta = 0
  let sumDelta = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x >= overlapW || y >= overlapH) {
        mask[p] = 2
        changedPixels++
        continue
      }
      const ia = (y * a.width + x) * 4
      const ib = (y * b.width + x) * 4
      const dr = Math.abs(a.data[ia] - b.data[ib])
      const dg = Math.abs(a.data[ia + 1] - b.data[ib + 1])
      const db = Math.abs(a.data[ia + 2] - b.data[ib + 2])
      const da = Math.abs(a.data[ia + 3] - b.data[ib + 3])
      const d = Math.max(dr, dg, db, da)
      if (d > maxDelta) maxDelta = d
      sumDelta += d
      if (d > channelThreshold) {
        mask[p] = 1
        changedPixels++
      }
    }
  }

  const totalPixels = width * height
  const overlapPixels = overlapW * overlapH
  return {
    width,
    height,
    changedPixels,
    totalPixels,
    changedRatio: totalPixels ? changedPixels / totalPixels : 0,
    maxDelta,
    // Mean over the comparable region only; averaging in the non-overlapping
    // area would make a taller candidate look like a huge colour shift.
    meanDelta: overlapPixels ? sumDelta / overlapPixels : 0,
    sizeChanged: a.width !== b.width || a.height !== b.height,
    mask,
  }
}

/**
 * Rank comparison rows worst-first so a reviewer opens the 10 that moved, not
 * the 400 that did not. Unstable stories sink below real diffs — they are
 * noise, and burying them keeps the top of the report actionable.
 *
 * @param {DiffRow[]} rows
 * @returns {DiffRow[]} a new, sorted array
 */
export function rankRows(rows) {
  return [...rows].sort((x, y) => {
    if (!!x.unstable !== !!y.unstable) return x.unstable ? 1 : -1
    if (x.changedRatio !== y.changedRatio)
      return y.changedRatio - x.changedRatio
    if (x.maxDelta !== y.maxDelta) return y.maxDelta - x.maxDelta
    return x.key < y.key ? -1 : 1
  })
}

/**
 * Bucket a run's rows into the sections the console summary prints.
 *
 * @param {DiffRow[]} rows
 * @param {{minRatio?: number}} [options] changed-pixel ratio at or above which
 *   a row counts as a real diff rather than sub-threshold noise.
 */
export function summarize(rows, options = {}) {
  const minRatio = options.minRatio === undefined ? 0.0001 : options.minRatio
  const ranked = rankRows(rows)
  return {
    total: ranked.length,
    missing: ranked.filter((r) => r.status === 'missing'),
    errored: ranked.filter((r) => r.status === 'error'),
    unstable: ranked.filter((r) => r.unstable && r.status === 'ok'),
    changed: ranked.filter(
      (r) => r.status === 'ok' && !r.unstable && r.changedRatio >= minRatio,
    ),
    noise: ranked.filter(
      (r) =>
        r.status === 'ok' &&
        !r.unstable &&
        r.changedRatio > 0 &&
        r.changedRatio < minRatio,
    ),
    identical: ranked.filter(
      (r) => r.status === 'ok' && !r.unstable && r.changedRatio === 0,
    ),
  }
}

/** `0.0123` -> `"1.230%"`, with enough digits that small diffs stay visible. */
export function formatPct(ratio) {
  return `${(ratio * 100).toFixed(3)}%`
}

/**
 * Render the worst-first table the CLI prints. Pure so its column maths is
 * testable without a browser.
 *
 * @param {DiffRow[]} rows already-ranked rows
 * @param {number} [max] how many rows to render
 */
export function formatTable(rows, max = 20) {
  if (!rows.length) return '  (none)'
  const shown = rows.slice(0, max)
  const keyWidth = Math.min(
    72,
    shown.reduce((w, r) => Math.max(w, r.key.length), 0),
  )
  const lines = shown.map((r) => {
    const key = r.key.padEnd(keyWidth).slice(0, keyWidth)
    const pct = formatPct(r.changedRatio).padStart(9)
    const px = String(r.changedPixels).padStart(9)
    const delta = String(r.maxDelta).padStart(4)
    const flags = [
      r.sizeChanged ? 'SIZE' : '',
      r.unstable ? 'UNSTABLE' : '',
      r.status !== 'ok' ? r.status.toUpperCase() : '',
    ]
      .filter(Boolean)
      .join(' ')
    return `  ${key}  ${pct}  ${px}px  Δ${delta}${flags ? `  ${flags}` : ''}`
  })
  if (rows.length > shown.length)
    lines.push(`  … and ${rows.length - shown.length} more`)
  return lines.join('\n')
}
