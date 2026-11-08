// The Worker's static import graph, from its entry: build-time code must not
// be reachable. supergraph.ts composes the subgraph schemas, and each subgraph
// builds its schema when imported, so reaching it from the Worker cost about
// half the gateway's cold start.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SPECIFIER =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g

function graph(entry: string) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2]
      if (!spec.startsWith('.')) {
        packages.add(spec)
        continue
      }
      const base = resolve(dirname(file), spec)
      const hit = [`${base}.ts`, `${base}/index.ts`, base].find(
        (f) => f.endsWith('.ts') && existsSync(f),
      )
      if (hit) visit(hit)
    }
  }
  visit(entry)
  return { files: [...files].map((f) => relative(root, f)), packages }
}

describe('Worker bundle', () => {
  const { files, packages } = graph(resolve(root, 'api/src/index.ts'))

  it('reaches the gateway it serves', () => {
    expect(files).toContain('api/src/gateway.ts')
  })

  it('never reaches build-time composition or a subgraph schema', () => {
    expect(
      files.filter(
        (f) =>
          f === 'api/src/supergraph.ts' ||
          /^services\/[^/]+\/src\/subgraph/.test(f),
      ),
    ).toEqual([])
    expect(
      [...packages].filter((p) =>
        /^@theguild\/federation-composition|^@pothos\//.test(p),
      ),
    ).toEqual([])
  })
})
