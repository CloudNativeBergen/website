import { describe, expect, it } from 'vitest'
import { findRuntimeModuleImports } from './moduleImports'

/**
 * The guard this file covers replaced a source-text regex that was copied into
 * two test files and matched only `import … from '…'` with SINGLE quotes.
 *
 * `OLD_GUARD` is that exact regex, kept here as an executable record of what it
 * missed. Every case below asserts BOTH that the parser sees the import and
 * that the regex did not — so the fix is demonstrated, not just claimed.
 */
const OLD_GUARD = (source: string): string[] =>
  Array.from(
    source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm),
    (match) => match[1],
  )

const specifiers = (source: string) =>
  findRuntimeModuleImports(source).map((i) => i.specifier)

describe('findRuntimeModuleImports — forms the old regex was blind to', () => {
  const blindSpots: Array<{
    name: string
    source: string
    specifier: string
    kind: string
  }> = [
    {
      name: 'side-effect import',
      source: `import '@dnd-kit/core'\n`,
      specifier: '@dnd-kit/core',
      kind: 'side-effect import',
    },
    {
      name: 'named re-export',
      source: `export { arrayMove } from '@dnd-kit/sortable'\n`,
      specifier: '@dnd-kit/sortable',
      kind: 're-export',
    },
    {
      name: 'star re-export',
      source: `export * from '@dnd-kit/core'\n`,
      specifier: '@dnd-kit/core',
      kind: 're-export',
    },
    {
      name: 'dynamic import',
      source: `export async function load() {\n  return import('@dnd-kit/core')\n}\n`,
      specifier: '@dnd-kit/core',
      kind: 'dynamic import',
    },
    {
      name: 'double-quoted import',
      source: `import { DndContext } from "@dnd-kit/core"\n`,
      specifier: '@dnd-kit/core',
      kind: 'import',
    },
    {
      name: 'double-quoted side-effect import',
      source: `import "@dnd-kit/core"\n`,
      specifier: '@dnd-kit/core',
      kind: 'side-effect import',
    },
    {
      name: 'require call',
      source: `const dnd = require('@dnd-kit/core')\n`,
      specifier: '@dnd-kit/core',
      kind: 'require',
    },
    {
      name: 'import-equals',
      source: `import dnd = require('@dnd-kit/core')\n`,
      specifier: '@dnd-kit/core',
      kind: 'import =',
    },
    {
      name: 'indented re-export inside a namespace',
      source: `namespace n {\n  export * from '@dnd-kit/core'\n}\n`,
      specifier: '@dnd-kit/core',
      kind: 're-export',
    },
  ]

  for (const { name, source, specifier, kind } of blindSpots) {
    it(`catches a ${name}, which the old regex missed`, () => {
      expect(OLD_GUARD(source)).toEqual([])
      expect(findRuntimeModuleImports(source)).toEqual([
        { specifier, kind, line: expect.any(Number) },
      ])
    })
  }

  it('catches a computed dynamic import, quoting the expression', () => {
    const source = `const name = 'core'\nexport const load = () => import(\`@dnd-kit/\${name}\`)\n`
    expect(OLD_GUARD(source)).toEqual([])
    expect(findRuntimeModuleImports(source)).toEqual([
      {
        specifier: '`@dnd-kit/${name}`',
        kind: 'dynamic import',
        line: 2,
      },
    ])
  })
})

describe('findRuntimeModuleImports — no false positives', () => {
  it('ignores an import that only lives inside a block comment', () => {
    const source = `/*\nimport evil from 'evil'\n*/\nexport const ok = 1\n`
    // The old regex matched `^import` at column 0 even inside the comment: it
    // reported an import that does not exist.
    expect(OLD_GUARD(source)).toEqual(['evil'])
    expect(findRuntimeModuleImports(source)).toEqual([])
  })

  it('ignores an import-looking string literal', () => {
    const source = `export const doc = \`\nimport evil from 'evil'\n\`\n`
    expect(OLD_GUARD(source)).toEqual(['evil'])
    expect(findRuntimeModuleImports(source)).toEqual([])
  })

  it('ignores erased type-only imports and re-exports', () => {
    const source = [
      `import type { A } from './a'`,
      `import type B from './b'`,
      `export type { C } from './c'`,
      `export type * from './d'`,
      `export { type E } from './e'`,
    ].join('\n')
    // `export { type E } from './e'` is NOT a type-only statement, so the
    // specifier survives — the strict answer, deliberately.
    expect(specifiers(source)).toEqual(['./e'])
  })

  it('ignores a local export with no module specifier', () => {
    expect(findRuntimeModuleImports(`const a = 1\nexport { a }\n`)).toEqual([])
  })

  it('reports a non-type-only named import even when every binding is a type', () => {
    // `import { type A }` is not erased at the statement level; being wrong
    // here costs a broken production build, so the guard stays strict.
    expect(specifiers(`import { type A } from './a'\n`)).toEqual(['./a'])
  })
})

describe('findRuntimeModuleImports — ordering and shape', () => {
  it('returns every specifier in source order with its line', () => {
    const source = [
      `import type { T } from './types'`,
      `import './polyfill'`,
      `import { a } from "pkg-a"`,
      `export * from './barrel'`,
      `export const load = () => import('lazy')`,
    ].join('\n')

    expect(findRuntimeModuleImports(source)).toEqual([
      { specifier: './polyfill', kind: 'side-effect import', line: 2 },
      { specifier: 'pkg-a', kind: 'import', line: 3 },
      { specifier: './barrel', kind: 're-export', line: 4 },
      { specifier: 'lazy', kind: 'dynamic import', line: 5 },
    ])
    // The old regex saw none of the four correctly. `[^;]*?` spans newlines,
    // so it welded line 3's `import` onto line 4's `from './barrel'` and
    // reported a specifier that no single statement contains — missing the
    // side-effect import, the double-quoted import and the dynamic import,
    // while inventing an import that is not there.
    expect(OLD_GUARD(source)).toEqual(['./barrel'])
  })

  it('parses TSX when the file name says so', () => {
    const source = `import { X } from './x'\nexport const El = () => <X a={1 as number} />\n`
    expect(
      findRuntimeModuleImports(source, 'component.tsx').map((i) => i.specifier),
    ).toEqual(['./x'])
  })
})
