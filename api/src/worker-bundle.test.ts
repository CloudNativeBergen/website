// The Worker's runtime import graph, from its entry: build-time code must not
// be reachable. supergraph.ts composes the subgraph schemas, and each subgraph
// builds its schema when imported, so reaching it from the Worker cost about
// half the gateway's cold start.
//
// The graph is parsed with the TypeScript compiler, not matched by text:
// comments and type-only imports (erased by the bundler) are not edges;
// dynamic import() and require() are. Specifiers resolve the way the bundler
// does (moduleResolution "bundler" and the paths in api/tsconfig.json), so
// `./supergraph.js` reaches supergraph.ts.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const tsconfig = resolve(root, 'api/tsconfig.json')
const { options } = ts.parseJsonConfigFileContent(
  ts.readConfigFile(tsconfig, ts.sys.readFile).config,
  ts.sys,
  dirname(tsconfig),
)

/** Every import specifier the bundler keeps at runtime. */
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
  )
  const found: string[] = []
  const allTypes = (n: ts.NamedImportBindings | ts.NamedExportBindings) =>
    (ts.isNamedImports(n) || ts.isNamedExports(n)) &&
    n.elements.length > 0 &&
    n.elements.every((e) => e.isTypeOnly)
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const c = node.importClause
      const typeOnly =
        c?.isTypeOnly ||
        (c && !c.name && c.namedBindings && allTypes(c.namedBindings))
      if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier))
        found.push(node.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(node)) {
      const typeOnly =
        node.isTypeOnly || (node.exportClause && allTypes(node.exportClause))
      if (
        !typeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        found.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Repo files and packages reachable at runtime from `entry`. */
function graph(entry: string, base = root) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    for (const spec of runtimeSpecifiers(file)) {
      const hit = ts.resolveModuleName(spec, file, options, ts.sys)
        .resolvedModule?.resolvedFileName
      const real = hit && realpathSync(hit)
      // Repo source (workspace packages included) is walked; anything else,
      // resolved or not (a package, a .graphql text import), is a leaf.
      if (real && !real.includes('/node_modules/') && !real.endsWith('.d.ts'))
        visit(real)
      else if (!spec.startsWith('.')) packages.add(spec)
    }
  }
  visit(realpathSync(entry))
  const realBase = realpathSync(base)
  return {
    files: [...files].map((f) => relative(realBase, f)),
    packages: [...packages],
  }
}

const isBuildTime = (f: string) =>
  f === 'api/src/supergraph.ts' || /^services\/[^/]+\/src\/subgraph/.test(f)

describe('Worker bundle', () => {
  const { files, packages } = graph(resolve(root, 'api/src/index.ts'))

  it('reaches the gateway it serves', () => {
    expect(files).toContain('api/src/gateway.ts')
    expect(files).toContain('api/src/gateway-typedefs.ts')
    // Workspace packages are repo source too, and are walked.
    expect(files).toContain('packages/tenancy/src/index.ts')
  })

  it('never reaches build-time composition or a subgraph schema', () => {
    expect(files.filter(isBuildTime)).toEqual([])
    expect(
      packages.filter((p) =>
        /^@theguild\/federation-composition|^@pothos\//.test(p),
      ),
    ).toEqual([])
  })
})

describe('the import graph', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'worker-bundle-')))
  const write = (name: string, body: string) =>
    writeFileSync(join(dir, name), body)
  const reached = (entry: string) =>
    graph(join(dir, entry), dir).files.filter((f) => f !== entry)
  for (const t of ['typed', 'commented', 'dynamic', 'required', 'jsext'])
    write(`${t}-target.ts`, 'export const x = 1\nexport type T = number\n')

  it('follows dynamic import(), require() and a .js specifier', () => {
    write('a.ts', "export const f = () => import('./dynamic-target')\n")
    write(
      'b.ts',
      "declare const require: (s: string) => unknown\nrequire('./required-target')\n",
    )
    write('c.ts', "import { x } from './jsext-target.js'\nexport const y = x\n")
    expect(reached('a.ts')).toEqual(['dynamic-target.ts'])
    expect(reached('b.ts')).toEqual(['required-target.ts'])
    expect(reached('c.ts')).toEqual(['jsext-target.ts'])
  })

  it('skips type-only and commented-out imports', () => {
    write(
      'd.ts',
      [
        "import type { T } from './typed-target'",
        "import { type T as U } from './typed-target'",
        "export type { T as V } from './typed-target'",
        "// import { x } from './commented-target'",
        "/* import './commented-target' */",
        'export type W = T | U',
      ].join('\n'),
    )
    expect(reached('d.ts')).toEqual([])
  })
})
