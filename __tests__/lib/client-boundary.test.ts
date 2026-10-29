/**
 * A server component that imports a non-component value (a class string, a
 * message, a helper) from a 'use client' module gets a client reference, not
 * the value: in production a class attribute renders as "Attempted to call
 * X() from the server". Shared values belong in a plain module. Components
 * (PascalCase) and type-only imports are fine.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const isClient = (file: string) =>
  /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(
    readFileSync(file, 'utf8'),
  )

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(from), spec)
      : null
  if (!base) return null
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

const IMPORT =
  /^(import|export)\s+(type\s+)?(?:\{([^}]*)\}|[\w$]+)?[^'"\n]*?(?:from\s+)?['"]([^'"]+)['"]/gm

const valueNames = (names: string) =>
  names
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n && !n.startsWith('type '))
    .map((n) => {
      const [name, alias = name] = n.split(/\s+as\s+/)
      return { name, alias }
    })

/** A component (PascalCase, not ALL_CAPS) may cross the boundary. */
const isComponent = (n: string) => /^[A-Z]/.test(n) && !/^[A-Z0-9_]+$/.test(n)

/**
 * The non-component values a non-client module re-exports from a client
 * module (`export { X } from`), by exported name: a barrel passes them on.
 * ponytail: `export *` is not followed; list names if that ever matters.
 */
const reexports = new Map<string, Map<string, string>>()
function clientReexports(file: string): Map<string, string> {
  const cached = reexports.get(file)
  if (cached) return cached
  const out = new Map<string, string>()
  reexports.set(file, out)
  for (const [, kw, typeOnly, names, spec] of readFileSync(
    file,
    'utf8',
  ).matchAll(IMPORT)) {
    if (kw !== 'export' || typeOnly || !names) continue
    const target = resolveImport(file, spec)
    if (!target) continue
    const inner = isClient(target) ? null : clientReexports(target)
    for (const { name, alias } of valueNames(names)) {
      if (inner) {
        if (inner.has(name)) out.set(alias, inner.get(name)!)
      } else if (name !== 'default' && !isComponent(name)) {
        out.set(alias, `${name} from ${target.slice(ROOT.length + 1)}`)
      }
    }
  }
  return out
}

/**
 * Walks from every non-client file under src/app (pages, layouts, routes)
 * through the non-client modules they import: that is the server graph.
 * Modules with no directive reached only from client modules are client
 * code and are not walked.
 */
function findViolations(): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const queue = walk(join(SRC, 'app')).filter(
    (f) =>
      /\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f) && !isClient(f),
  )
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const [, kw, typeOnly, names, spec] of readFileSync(
      file,
      'utf8',
    ).matchAll(IMPORT)) {
      const target = resolveImport(file, spec)
      if (!target) continue
      const client = isClient(target)
      if (!client) queue.push(target)
      if (kw !== 'import' || typeOnly || !names) continue
      const passed = client ? null : clientReexports(target)
      for (const { name } of valueNames(names)) {
        const where = passed
          ? passed.get(name)
          : isComponent(name)
            ? undefined
            : `${name} from ${spec}`
        if (where) found.push(`${file.slice(ROOT.length + 1)}: ${where}`)
      }
    }
  }
  return found
}

describe('client boundary', () => {
  it('server modules import only components and types from client modules', () => {
    expect(findViolations()).toEqual([])
  })
})
