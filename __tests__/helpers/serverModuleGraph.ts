import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import ts from 'typescript'

import { findRuntimeModuleImports } from './moduleImports'

/**
 * The MODULE-GRAPH half of the `createContext is not a function` guard.
 *
 * `moduleImports.ts` answers "what does THIS file reach?" for one hand-picked
 * file. This answers the question that keeps actually breaking the build: "what
 * does a SERVER ENTRY POINT reach, transitively, and does anything in there call
 * `React.createContext`?"
 *
 * WHY IT MATTERS. Next compiles everything reachable from a route handler or a
 * server component in the `react-server` layer, where `react` resolves to
 * `react.react-server.js` — a build that exports neither `createContext` nor
 * `useContext`. A module-scope `createContext` call therefore throws while
 * `next build` collects page data, and a lazily-called one throws at request
 * time instead. Neither is visible to `tsc` or to a unit test: only a real
 * production build catches it, minutes later, with a message that names the
 * ROUTE rather than the offending module. This turns that into a fast, precise
 * failure.
 *
 * It has already happened three times: a `@dnd-kit` import in
 * `src/lib/homepage/editor.ts`, the same shape in `src/lib/homepage/variants.ts`,
 * and `React.createContext` in the email brand scope reached from
 * `/api/cron/weekly-update`.
 *
 * THE BOUNDARY IS `'use client'`, not a directory. A `createContext` call is
 * perfectly legal inside a client component; what is illegal is reaching one
 * from the server layer WITHOUT crossing a `'use client'` directive, because
 * then the module is compiled into the server layer too. So the walk stops at
 * every `'use client'` module. A module reachable by both a client and a server
 * path is still reported, via the server path — which is exactly right, since
 * Next compiles it twice and the server copy is the one that dies.
 *
 * WHAT IT CANNOT SEE. The walk follows `@/…` and relative specifiers only; it
 * does not descend into `node_modules`, so a client-only PACKAGE pulled into a
 * server module (the original `@dnd-kit` incident) is invisible here. That case
 * stays covered by the per-file zero-runtime-import assertions in
 * `variants.test.ts` / `editor.test.ts`. Computed specifiers
 * (`import(someVariable)`) are likewise unresolvable and skipped.
 */

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/** Repo root, derived from this file's location rather than `process.cwd()`. */
export const REPO_ROOT = resolve(
  dirname(new URL(import.meta.url).pathname),
  '../..',
)

const SRC_ROOT = join(REPO_ROOT, 'src')

/** POSIX-form path relative to the repo root, for stable assertion messages. */
export function repoRelative(file: string): string {
  return file
    .slice(REPO_ROOT.length + 1)
    .split(sep)
    .join('/')
}

function firstExisting(base: string): string | null {
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of SOURCE_EXTENSIONS) {
      const candidate = join(base, 'index' + ext)
      if (existsSync(candidate)) return candidate
    }
    return null
  }
  if (existsSync(base) && statSync(base).isFile()) return base
  return null
}

/**
 * Resolve one specifier the way the app's `@/*` -> `src/*` alias does. Returns
 * `null` for bare package specifiers (deliberately not followed, see above) and
 * for anything that does not exist on disk.
 */
export function resolveAppModule(
  specifier: string,
  fromFile: string,
): string | null {
  if (specifier.startsWith('@/')) {
    return firstExisting(join(SRC_ROOT, specifier.slice(2)))
  }
  if (specifier.startsWith('.')) {
    return firstExisting(resolve(dirname(fromFile), specifier))
  }
  return null
}

/** True when the module opens with a `'use client'` directive. */
export function isClientModule(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'directive-probe.tsx',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  )
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteralLike(statement.expression)
    ) {
      // Directives must precede every other statement; the first non-directive
      // ends the prologue.
      return false
    }
    if (statement.expression.text === 'use client') return true
  }
  return false
}

export interface ReactContextCall {
  /** 1-based line of the offending call. */
  line: number
  /** How the callee was written, e.g. `React.createContext`. */
  callee: string
  /** True when the call runs on import rather than inside a function body. */
  atModuleScope: boolean
}

/**
 * Every call to REACT's `createContext` in the module.
 *
 * Resolved through the import bindings rather than by name, so tRPC's unrelated
 * `createContext` option and any local helper of the same name are not
 * mistaken for it.
 */
export function findReactCreateContextCalls(
  source: string,
  fileName = 'module.tsx',
): ReactContextCall[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  )

  // `import * as React from 'react'` / `import React from 'react'` namespaces,
  // and `import { createContext } from 'react'` local names.
  const reactNamespaces = new Set<string>()
  const directNames = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react' ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      continue
    }
    const clause = statement.importClause
    if (clause.name) reactNamespaces.add(clause.name.text)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      reactNamespaces.add(bindings.name.text)
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text
        if (imported === 'createContext' && !element.isTypeOnly) {
          directNames.add(element.name.text)
        }
      }
    }
  }

  const found: ReactContextCall[] = []

  const insideFunction = (node: ts.Node): boolean => {
    for (let n = node.parent; n; n = n.parent) {
      if (
        ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n) ||
        ts.isMethodDeclaration(n) ||
        ts.isGetAccessor(n) ||
        ts.isSetAccessor(n)
      ) {
        return true
      }
    }
    return false
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let callee: string | null = null
      if (
        ts.isIdentifier(node.expression) &&
        directNames.has(node.expression.text)
      ) {
        callee = node.expression.text
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'createContext' &&
        ts.isIdentifier(node.expression.expression) &&
        reactNamespaces.has(node.expression.expression.text)
      ) {
        callee = `${node.expression.expression.text}.createContext`
      }
      if (callee) {
        found.push({
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          callee,
          atModuleScope: !insideFunction(node),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return found
}

export interface ServerGraphNode {
  /** Absolute path of the module. */
  file: string
  /** The entry -> … -> file chain that reached it, absolute paths. */
  chain: string[]
}

/**
 * Breadth-first walk of everything the given entry points reach in the SERVER
 * layer. A `'use client'` module is the BOUNDARY: it is neither reported nor
 * descended into, because it and its subtree are compiled for the browser,
 * where React context is perfectly legal. Each module is reported once, with
 * the SHORTEST chain that reached it — which is what a failure message needs in
 * order to be actionable.
 */
export function collectServerGraph(entries: string[]): ServerGraphNode[] {
  const seen = new Map<string, string[]>()
  const queue: string[] = []

  for (const entry of entries) {
    if (seen.has(entry)) continue
    seen.set(entry, [entry])
    queue.push(entry)
  }

  const out: ServerGraphNode[] = []

  while (queue.length > 0) {
    const file = queue.shift()!
    const chain = seen.get(file)!
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // A `'use client'` module and everything under it belongs to the client
    // layer; React context is legal there.
    if (isClientModule(source)) continue

    out.push({ file, chain })

    for (const imported of findRuntimeModuleImports(source, file)) {
      const resolved = resolveAppModule(imported.specifier, file)
      if (!resolved || seen.has(resolved)) continue
      seen.set(resolved, [...chain, resolved])
      queue.push(resolved)
    }
  }

  return out
}

/** Every file under `dir` matching `pattern`, recursively. */
export function findFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__snapshots__') continue
      out.push(...findFiles(full, pattern))
    } else if (pattern.test(entry)) {
      out.push(full)
    }
  }
  return out
}
