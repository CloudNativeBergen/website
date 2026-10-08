/**
 * @vitest-environment node
 *
 * THE SDK'S OWN SERVER ACTIONS STAY OUT OF THE BUNDLE (#1296).
 *
 * `@workos-inc/authkit-nextjs/components` is a client entry that imports the
 * SDK's `'use server'` module (`dist/esm/actions.js`). Importing it anywhere
 * registers those actions — `getAuthAction`, `refreshAuthAction`,
 * `handleSignOutAction`, … — as endpoints a browser can POST to.
 *
 * That matters here for two reasons:
 *
 *  1. A server action is not bound to the page it was rendered on. Posted to a
 *     path OUTSIDE the proxy's `/workshop*` matcher it runs with no host
 *     decision at all, and `getAuthAction({ ensureSignedIn: true })` then builds
 *     an authorize URL from a client-controlled `x-redirect-uri` header or the
 *     single-host env URI — WorkOS code reached without the allowlist.
 *  2. `AuthKitProvider` calls one on every mount and another on every window
 *     focus. Each is a POST through the proxy, i.e. one live Sanity read.
 *
 * Nothing in this app reads the provider's context, so the entry is simply not
 * imported. This test is what keeps it that way. Parsed with the compiler, not
 * a regex (see `moduleImports.ts`).
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

const CLIENT_ENTRY = '@workos-inc/authkit-nextjs/components'

describe('the AuthKit client entry', () => {
  it('is imported by no application module', () => {
    const sources = findFiles(join(REPO_ROOT, 'src'), /\.(ts|tsx)$/).filter(
      (file) => !/\.(test|stories)\.tsx?$/.test(file),
    )
    // The scan really covered the tree — including the one file that used to
    // import the entry.
    expect(sources.length).toBeGreaterThan(500)
    expect(sources.map(repoRelative)).toContain('src/app/(workshop)/layout.tsx')

    const importers = sources.filter((file) =>
      findRuntimeModuleImports(readFileSync(file, 'utf8'), file).some(
        ({ specifier }) => specifier.startsWith(CLIENT_ENTRY),
      ),
    )

    expect(importers.map(repoRelative)).toEqual([])
  })
})
