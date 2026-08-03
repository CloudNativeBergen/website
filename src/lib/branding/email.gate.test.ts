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
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The house brand blues (and the off-palette purple) that must not be pinned. */
const HOUSE_BRAND_HEXES = [
  '#1d4ed8',
  '#1e40af',
  '#2563eb',
  '#0284c7',
  '#7c3aed',
]

/** Email-rendering surfaces. Everything here ships bytes to a recipient. */
const SCANNED_DIRS = ['src/components/email', 'src/lib/email']

/**
 * Files exempt from the gate, each with its reason. Keep this list SHORT — a
 * new entry is a new place a tenant's colour cannot reach.
 */
const EXEMPT = new Set([
  // The tests themselves assert on the literals.
  'src/components/email/email-branding.test.tsx',
  'src/components/email/email-branding.themed.test.tsx',
])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__snapshots__') continue
      out.push(...walk(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
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
  const files = SCANNED_DIRS.flatMap(walk).filter((f) => !EXEMPT.has(f))

  it('scans a non-trivial number of files', () => {
    // Guards against the walk silently matching nothing and the gate passing
    // vacuously forever.
    expect(files.length).toBeGreaterThan(15)
  })

  it.each(files)('%s', (file) => {
    const source = strippedSource(readFileSync(file, 'utf8')).toLowerCase()
    const found = HOUSE_BRAND_HEXES.filter((hex) => source.includes(hex))
    expect(
      found,
      `${file} hard-codes ${found.join(', ')}. Use the inherited brand palette ` +
        `(useEmailBrand / resolveEmailBrandPalette) or brandedOr(palette, '<house hex>').`,
    ).toEqual([])
  })
})
