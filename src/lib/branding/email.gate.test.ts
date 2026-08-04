/**
 * REGRESSION GATE.
 *
 * The email surface regressed into house-blue-for-everyone one hard-coded hex
 * at a time — no single commit was wrong, and nothing caught the drift. This
 * test fails the next one.
 *
 * A house brand literal is allowed in email code in exactly two shapes:
 *   - as the fallback argument of `brandedOr(palette, '#…')`, which resolves to
 *     the tenant's accent whenever there IS a tenant colour, and
 *   - inside a comment, where it documents rather than renders.
 * Anywhere else it is a colour a themed conference cannot override.
 *
 * STATUS colours are intentionally absent from the scanned list: reject red,
 * waitlist orange and success green are supposed to be literals.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIMARY_COLOR } from './theme'

/**
 * The house brand blues (and the off-palette purple) that must not be pinned.
 *
 * The current house blue comes from the SOURCE OF TRUTH rather than a copy, so
 * changing `DEFAULT_PRIMARY_COLOR` cannot quietly retire the gate's main rule.
 * The rest are the drift literals the templates accumulated (`#1E40AF`,
 * `#2563EB`, `#0284C7`) plus the emphasis purple; they have no constant to
 * point at because nothing should reintroduce them.
 */
const HOUSE_BRAND_COLORS = [
  ...new Set(
    [DEFAULT_PRIMARY_COLOR, '#1e40af', '#2563eb', '#0284c7', '#7c3aed'].map(
      (hex) => hex.toLowerCase(),
    ),
  ),
]

/**
 * `#rrggbb` -> a pattern matching any `rgb()`/`rgba()` spelling of it.
 *
 * Hex is not the only way to pin a house colour: the button shadow shipped as
 * `rgba(29, 78, 216, 0.25)` for years, and a hex-only scan is blind to exactly
 * the literal this gate exists to catch.
 */
function rgbSpelling(hex: string): RegExp {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`)
}

/** Email surfaces. Everything here ships bytes to a recipient. */
const SCANNED_DIRS = [
  'src/components/email',
  'src/lib/email',
  'src/lib/proposal/email',
]

/**
 * Files exempt from the gate, each with its reason. Keep this list SHORT — a
 * new entry is a new place a tenant's colour cannot reach.
 */
const EXEMPT = new Set([
  // The tests themselves assert on the literals.
  'src/components/email/email-branding.test.tsx',
  'src/components/email/email-branding.themed.test.tsx',
])

/**
 * Forward slashes whatever `join` produced. `EXEMPT` is written in POSIX form,
 * and on Windows `join` yields backslashes — without this the exemptions never
 * match and the gate fails on its own fixtures.
 */
function toPosix(filePath: string): string {
  return filePath.split(sep).join('/')
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__snapshots__') continue
      out.push(...walk(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(toPosix(full))
    }
  }
  return out
}

/** Remove comments and every `brandedOr(...)` fallback — the allowed shapes. */
function strippedSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/brandedOr\([^)]*\)/g, 'brandedOr()')
}

describe('no email surface pins a house brand colour', () => {
  const scanned = SCANNED_DIRS.flatMap(walk)
  const files = scanned.filter((f) => !EXEMPT.has(f))

  it('scans a non-trivial number of files', () => {
    // Guards against the walk silently matching nothing and the gate passing
    // vacuously forever.
    expect(files.length).toBeGreaterThan(15)
  })

  it('every exemption still names a file the walk found', () => {
    // A renamed or deleted exempt file would otherwise leave a dead entry
    // behind, and the next file to take that path inherits the exemption for
    // free. Exemptions have to be earned, not inherited.
    expect([...EXEMPT].filter((e) => !scanned.includes(e))).toEqual([])
  })

  it.each(files)('%s', (file) => {
    const source = strippedSource(readFileSync(file, 'utf8')).toLowerCase()
    const found = HOUSE_BRAND_COLORS.filter(
      (hex) => source.includes(hex) || rgbSpelling(hex).test(source),
    )
    expect(
      found,
      `${file} hard-codes ${found.join(', ')} (as hex or rgb()). Use the ` +
        `inherited brand palette (emailBrand / resolveEmailBrandPalette) ` +
        `or brandedOr(palette, '<house hex>').`,
    ).toEqual([])
  })
})
