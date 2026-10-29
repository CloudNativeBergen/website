/**
 * @vitest-environment node
 *
 * NO APPLICATION MODULE IMPORTS THE AUTHKIT SDK (#1296, #1314).
 *
 * The workshop portal keeps a session of its own, so nothing on a tenant host
 * enters `@workos-inc/authkit-nextjs`: not its middleware, not `withAuth`, not
 * `handleAuth`, and not its client entry, which would register the SDK's own
 * server actions as endpoints a browser can POST to on any path. The auth host
 * talks to WorkOS through the plain `@workos-inc/node` client, from one
 * module.
 *
 * This test is what keeps it that way. Parsed with the compiler, not a regex
 * (see `moduleImports.ts`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findRuntimeModuleImports } from '../../helpers/moduleImports'
import {
  REPO_ROOT,
  findFiles,
  repoRelative,
} from '../../helpers/serverModuleGraph'

const SDK_PACKAGE = '@workos-inc/authkit-nextjs'
const CLIENT_ENTRY = `${SDK_PACKAGE}/components`
const SERVER_CLIENT = '@workos-inc/node'

/** The application modules that import `specifier` or a subpath of it. */
function importersOf(sources: string[], specifier: string): string[] {
  // Only a file whose TEXT mentions the package can import it, so only those
  // are handed to the compiler. Parsing all ~3,000 sources takes over ten
  // seconds under CI's coverage instrumentation.
  return sources
    .filter((file) => {
      const source = readFileSync(file, 'utf8')
      return (
        source.includes(specifier) &&
        findRuntimeModuleImports(source, file).some(
          (found) =>
            found.specifier === specifier ||
            found.specifier.startsWith(`${specifier}/`),
        )
      )
    })
    .map(repoRelative)
}

describe('the AuthKit SDK', () => {
  it('is imported by no application module, by any entry', () => {
    const sources = findFiles(join(REPO_ROOT, 'src'), /\.(ts|tsx)$/).filter(
      (file) => !/\.(test|stories)\.tsx?$/.test(file),
    )
    // The scan really covered the tree, including the one file that used to
    // import the client entry.
    expect(sources.length).toBeGreaterThan(500)
    expect(sources.map(repoRelative)).toContain('src/app/(workshop)/layout.tsx')

    expect(importersOf(sources, SDK_PACKAGE)).toEqual([])
    // CONTROL: the same search finds the one module that holds a WorkOS
    // client, which only the auth host's start and callback reach.
    expect(importersOf(sources, SERVER_CLIENT)).toEqual([
      'src/lib/workshop/central-sign-in/workos.ts',
    ])
  })

  it('would be caught: the guard sees every way a module can reach it', () => {
    // CONTROL for the empty result above — the same finder, on the shapes an
    // import can take, so "no importers" is not a blind finder.
    for (const source of [
      `import { AuthKitProvider } from '${CLIENT_ENTRY}'`,
      `export { AuthKitProvider } from "${CLIENT_ENTRY}"`,
      `export * from '${CLIENT_ENTRY}'`,
      `const m = await import('${CLIENT_ENTRY}')`,
      `import '${CLIENT_ENTRY}'`,
    ]) {
      expect(
        findRuntimeModuleImports(source).map(({ specifier }) => specifier),
      ).toEqual([CLIENT_ENTRY])
    }
  })
})
