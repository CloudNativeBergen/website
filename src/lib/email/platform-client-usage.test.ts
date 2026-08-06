import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * THE PLATFORM RESEND SINGLETON IS ALLOWLISTED (#843).
 *
 * `resend` (exported by `@/lib/email/config`) is ONE Resend account: the
 * platform's. Every send that reaches for it directly sends a tenant's mail
 * through the platform's account, which puts another organization's speakers,
 * sponsors and attendees into the platform's logs, suppression lists and
 * audience records. The per-org seam (`resolveEmailSender(orgId)`) existed for a
 * long time with exactly ONE production caller while ten-plus other send paths
 * imported the singleton — a seam nobody used is not a seam.
 *
 * Plumbing them all through `resolveEmailSender` fixes today. THIS test is what
 * keeps it fixed: the next send path added to this codebase either resolves per
 * org, or turns this red. That is deliberately a build failure and not a lint
 * warning, because the failure mode it guards is silent by nature — a tenant's
 * mail still sends, just from the wrong account, and nothing surfaces it.
 *
 * WHY A SOURCE SCAN and not a runtime spy: `resend` is a `const` binding to a
 * cached instance, so there is no interception point at the module boundary. The
 * import IS the observable event.
 *
 * ── WHY THIS TEST CANNOT PASS FOR THE WRONG REASON ──────────────────────────
 * It asserts the allowlist EXACTLY, in both directions:
 *  - a NEW importer fails the "no unexpected" assertion, and
 *  - the scanner finding nothing at all (a broken glob, a regex that stopped
 *    matching, a moved file) fails the "the known importer is still found"
 *    assertion.
 * A test that only checked "no unexpected importers" would go green if the
 * scanner silently walked an empty tree, which is the exact false green this
 * project has been bitten by. Both halves have to hold.
 */

/** The ONE file allowed to send on the platform account, and why. */
const ALLOWED = new Map<string, string>([
  [
    'src/server/routers/status.ts',
    'The admin status page probes DELIVERABILITY of the platform account ' +
      'itself. Resolving per org would probe the tenant and report the wrong ' +
      "account's health — the platform client is the subject of this call, " +
      'not an incidental transport for it.',
  ],
])

/** `src/lib/email/config.ts` DEFINES the singleton; it is not a consumer. */
const DEFINITION = 'src/lib/email/config.ts'

const ROOT = join(__dirname, '..', '..', '..')
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (
      /\.tsx?$/.test(entry) &&
      !/\.(test|stories)\.tsx?$/.test(entry)
    ) {
      out.push(full)
    }
  }
  return out
}

/** The module that owns the singleton, as an absolute path with no extension. */
const CONFIG_MODULE = join(SRC, 'lib', 'email', 'config')

/**
 * Resolve an import specifier to an absolute, extension-less module path.
 * Handles the `@/…` alias (→ `src/…`) and relative specifiers; returns `null`
 * for a bare package name, which can never be this module.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return join(SRC, specifier.slice(2))
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier)
  return null
}

/**
 * Whether `file` pulls the `resend` SINGLETON out of `@/lib/email/config`.
 *
 * Matches the static `import { … resend … } from '…'` form AND the dynamic
 * `const { … resend … } = await import('…')` form, across line breaks — several
 * real call sites use multi-line, multi-symbol imports, and a naive single-line
 * grep for `import { resend }` reported 2 files when the true answer was more
 * than ten. The destructure pattern keeps `resolveEmailSender` and a renamed
 * `resend: x` binding from being confused with the plain symbol.
 *
 * THE SPECIFIER IS RESOLVED, NOT PATTERN-MATCHED. An earlier version of this
 * test tested the raw specifier against `/email\/config/` and was PROVED WRONG
 * by sabotage: half the offenders in `src/lib/email/` import from the RELATIVE
 * `'./config'`, which that pattern silently missed, so re-pointing a send path
 * at the singleton left the suite green. Resolving `@/…` and `./…` to a real
 * path and comparing against the one module is the only form that cannot be
 * dodged by how an author happened to spell the path.
 */
function importsPlatformSingleton(file: string, source: string): boolean {
  const bindings =
    /(?:import|const)\s*(\{[^}]*\})\s*(?:from|=\s*await\s+import\()\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(bindings)) {
    if (!/(^|[{,\s])resend(\s*,|\s*\})/.test(match[1])) continue
    if (resolveSpecifier(file, match[2]) === CONFIG_MODULE) return true
  }
  return false
}

describe('the platform Resend singleton is allowlisted (#843)', () => {
  const importers = sourceFiles(SRC)
    .filter((file) =>
      importsPlatformSingleton(file, readFileSync(file, 'utf8')),
    )
    .map((file) => relative(ROOT, file).split('\\').join('/'))
    .filter((file) => file !== DEFINITION)

  it('scans a real tree and still finds the known allowlisted importer', () => {
    // The control. If the walk, the filter or the regex ever stopped working,
    // `importers` would be empty and the assertion below would pass vacuously.
    expect(sourceFiles(SRC).length).toBeGreaterThan(100)
    expect(importers).toContain('src/server/routers/status.ts')
  })

  it('detects the RELATIVE import form, not just the @/ alias', () => {
    // The hole a sabotage actually found: `src/lib/email/*` import their own
    // `'./config'`, so a scanner keyed on the string "email/config" misses every
    // one of them. Pinned with a synthetic source rather than a real file, so it
    // keeps testing the matcher after the last relative importer is gone.
    const file = join(SRC, 'lib', 'email', 'somewhere.ts')
    expect(
      importsPlatformSingleton(file, "import { resend } from './config'"),
    ).toBe(true)
    expect(
      importsPlatformSingleton(
        file,
        "import {\n  resend,\n  retryWithBackoff,\n} from '@/lib/email/config'",
      ),
    ).toBe(true)
    expect(
      importsPlatformSingleton(
        join(SRC, 'server', 'routers', 'x.ts'),
        "const { resend } = await import('@/lib/email/config')",
      ),
    ).toBe(true)
    // …and does NOT fire on the per-org seam, or on an unrelated module.
    expect(
      importsPlatformSingleton(
        file,
        "import { resolveEmailSender } from './config'",
      ),
    ).toBe(false)
    expect(
      importsPlatformSingleton(file, "import { resend } from './other-config'"),
    ).toBe(false)
  })

  it('has NO importer outside the allowlist', () => {
    const unexpected = importers.filter((file) => !ALLOWED.has(file))
    expect(
      unexpected,
      [
        'These files send on the PLATFORM Resend account regardless of which',
        "tenant's mail it is (#843). Resolve the sender per organization instead:",
        '',
        '    const { client } = await resolveEmailSender(conference.organization?._ref)',
        '    await client.emails.send({ … })',
        '',
        'Every send path already has a conference, a ctx.orgId, or both. If a new',
        'path genuinely must use the platform account, add it to ALLOWED in this',
        'file WITH the reason — the allowlist is the record of that decision.',
      ].join('\n'),
    ).toEqual([])
  })

  it('documents a reason for every allowlist entry', () => {
    for (const [file, reason] of ALLOWED) {
      expect(
        reason.length,
        `${file} needs a real justification`,
      ).toBeGreaterThan(40)
    }
  })
})
