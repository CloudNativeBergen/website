import ts from 'typescript'

/**
 * "Does this module drag anything into the runtime module graph?" — answered by
 * PARSING the module, not by pattern-matching its text.
 *
 * WHY THIS EXISTS. Some modules must stay free of runtime imports because a
 * single value import from a client-only package puts that package's React
 * context into the RSC module graph, and the production build then dies while
 * collecting page data with `createContext is not a function`. That failure is
 * invisible to `tsc` and to every unit test — it only appears in `next build` —
 * so it is guarded here instead. It has already happened once, via a `@dnd-kit`
 * import in `src/lib/homepage/editor.ts`.
 *
 * WHY AN AST AND NOT A REGEX. The guard this replaces matched only
 * `import … from '…'` with SINGLE quotes, which silently permitted every other
 * way a module can reach another one: `import 'x'`, `export … from 'x'`,
 * `export * from 'x'`, `import('x')`, `require('x')`, `import x = require('x')`,
 * and anything written with double quotes — while ALSO false-positiving on an
 * `import` line inside a block comment. A guard with holes is worse than no
 * guard, because it reads as protection that is not there. TypeScript is
 * already a dependency and is the same parser that compiles these files, so the
 * answer here is exactly the compiler's answer.
 *
 * The alternatives were weighed and rejected: an ESLint rule cannot see dynamic
 * `import()` and runs in a different command than the tests (and is currently
 * broken in git worktrees); asserting on the BUILT output would catch it, but
 * only after a multi-minute `next build`, which is precisely the slow feedback
 * loop this guard exists to shortcut.
 */
export interface RuntimeModuleImport {
  /** The module specifier as written, or the expression text when computed. */
  specifier: string
  /** How the module is reached — named so a failing assertion explains itself. */
  kind:
    | 'import'
    | 'side-effect import'
    | 're-export'
    | 'dynamic import'
    | 'require'
    | 'import ='
  /** 1-based line, so a failure points at the offending statement. */
  line: number
}

/** Longest expression text quoted back for a computed specifier. */
const MAX_SPECIFIER_TEXT = 80

/**
 * Every module specifier the module reaches at RUNTIME, in source order.
 *
 * ERASED, and therefore absent from the result: `import type … from 'x'` and
 * `export type … from 'x'`, both of which the compiler removes wholesale.
 *
 * NOT erased, and therefore reported: `import { type A } from 'x'`. The
 * statement is not type-only, so whether the specifier survives depends on the
 * bundler's elision settings — and this guard deliberately answers the strict
 * question, since being wrong here costs a broken production build.
 */
export function findRuntimeModuleImports(
  source: string,
  fileName = 'module.ts',
): RuntimeModuleImport[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    // setParentNodes: needed for getStart()/getText() below.
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const found: RuntimeModuleImport[] = []

  const record = (
    kind: RuntimeModuleImport['kind'],
    node: ts.Node,
    specifier: ts.Expression,
  ) => {
    const text = ts.isStringLiteralLike(specifier)
      ? specifier.text
      : specifier.getText(sourceFile).slice(0, MAX_SPECIFIER_TEXT)
    found.push({
      specifier: text,
      kind,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
    })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      // `import type … from 'x'` is erased; a bare `import 'x'` (no clause) is
      // the side-effect form and is emphatically NOT.
      if (!node.importClause?.isTypeOnly) {
        record(
          node.importClause ? 'import' : 'side-effect import',
          node,
          node.moduleSpecifier,
        )
      }
    } else if (ts.isExportDeclaration(node)) {
      // Covers both `export { a } from 'x'` and `export * from 'x'`; a local
      // `export { a }` has no module specifier and reaches nothing.
      if (!node.isTypeOnly && node.moduleSpecifier) {
        record('re-export', node, node.moduleSpecifier)
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        record('import =', node, node.moduleReference.expression)
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        // `import('x')`, including a computed or template specifier.
        if (node.arguments.length > 0) {
          record('dynamic import', node, node.arguments[0])
        }
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0
      ) {
        record('require', node, node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return found
}

/**
 * {@link findRuntimeModuleImports} for a file on disk. Call it with
 * `new URL('./thing.ts', import.meta.url)` from a colocated test.
 */
export async function readRuntimeModuleImports(
  fileUrl: URL | string,
): Promise<RuntimeModuleImport[]> {
  const { readFile } = await import('node:fs/promises')
  const url = typeof fileUrl === 'string' ? new URL(fileUrl) : fileUrl
  const source = await readFile(url, 'utf8')
  return findRuntimeModuleImports(source, url.pathname)
}
