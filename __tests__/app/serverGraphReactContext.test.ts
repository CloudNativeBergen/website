/**
 * BUILD GATE: nothing the server layer can reach may create a React context.
 *
 * Next compiles every module reachable from a route handler, layout or page —
 * without crossing a `'use client'` directive — in the `react-server` layer,
 * where `react` resolves to `react.react-server.js`. That build exports neither
 * `createContext` nor `useContext`. A `createContext` call at module scope
 * therefore kills `next build` while it collects page data, with the famous
 * `TypeError: r.createContext is not a function` and a message that names the
 * ROUTE rather than the module at fault; a call made lazily merely postpones the
 * same crash to the first request.
 *
 * This has now bitten three times — twice via a client-only package imported
 * into `src/lib/homepage/*`, once via `React.createContext` in the email brand
 * scope reached from `/api/cron/weekly-update`. `tsc` cannot see it and no unit
 * test exercises it; only a multi-minute production build does. This test is
 * that build's fast, precise stand-in.
 *
 * FIXING A FAILURE. Either move the context into a `'use client'` module (and
 * import it only from client components), or replace it with a mechanism that
 * does not need React context at all — see
 * `src/components/email/EmailBrandScope.tsx` for the second shape.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  REPO_ROOT,
  collectServerGraph,
  findFiles,
  findReactCreateContextCalls,
  isClientModule,
  repoRelative,
} from '../helpers/serverModuleGraph'

/**
 * Next's server-layer entry points. Every special file name App Router treats
 * as an entry is listed, not just `route.ts`: a `page.tsx` is compiled in the
 * same layer and fails the same way.
 */
const SERVER_ENTRY_FILE = new RegExp(
  `^(${[
    'route',
    'page',
    'layout',
    'template',
    'default',
    'error',
    'global-error',
    'not-found',
    'loading',
    'opengraph-image',
    'twitter-image',
    'icon',
    'apple-icon',
    'sitemap',
    'robots',
    'manifest',
  ].join('|')})\\.tsx?$`,
)

const entries = [
  ...findFiles(join(REPO_ROOT, 'src/app'), SERVER_ENTRY_FILE),
  // The proxy (Next 16's middleware) is its own server entry point.
  join(REPO_ROOT, 'src/proxy.ts'),
].filter((file) => !isClientModule(readFileSync(file, 'utf8')))

const graph = collectServerGraph(entries)

describe('the server module graph creates no React context', () => {
  it('walks a non-trivial graph', () => {
    // Anti-vacuity. If the `@/…` resolution or the entry glob ever breaks, the
    // walk collapses to the entries themselves and the gate passes while
    // guarding nothing.
    expect(entries.length).toBeGreaterThan(50)
    expect(graph.length).toBeGreaterThan(entries.length * 2)
  })

  it('reaches the email templates, the path that broke the build', () => {
    // The specific chain this gate was written for:
    //   api/cron/weekly-update -> lib/status/summary -> lib/proposal/server
    //   -> lib/proposal/email/notification -> components/email -> the scope.
    // Pinning it means a refactor that hides the email graph behind a dynamic
    // or computed import makes THIS assertion fail loudly, instead of silently
    // shrinking the gate's coverage.
    const reached = new Set(graph.map((node) => repoRelative(node.file)))
    expect(reached).toContain('src/components/email/BaseEmailTemplate.tsx')
    expect(reached).toContain('src/components/email/EmailBrandScope.tsx')
    expect(reached).toContain('src/components/email/EmailComponents.tsx')
  })

  // 30s, matching `weak-references.test.ts`: this parses every file in the
  // server graph with the TypeScript compiler, and the default 5s is a coin
  // flip on a CI runner sharing a box with 596 other test files. It completes
  // in about a second locally, so a timeout here means contention, not a
  // regression — it flaked two unrelated dependency PRs before this was raised.
  it('has no createContext call anywhere in it', () => {
    const offenders = graph.flatMap((node) => {
      const calls = findReactCreateContextCalls(
        readFileSync(node.file, 'utf8'),
        node.file,
      )
      return calls.map(
        (call) =>
          `${repoRelative(node.file)}:${call.line} calls ${call.callee}()` +
          `${call.atModuleScope ? ' at module scope' : ''}\n` +
          `    reached by: ${node.chain.map(repoRelative).join('\n             -> ')}`,
      )
    })

    expect(
      offenders,
      `React context in the server layer breaks 'next build' with ` +
        `"createContext is not a function":\n\n${offenders.join('\n\n')}\n`,
    ).toEqual([])
  }, 30000)
})

describe('the detector itself', () => {
  /** The exact shape that broke PR #727, kept as a fixture so the gate is provably not asleep. */
  const REGRESSED_SOURCE = `
import * as React from 'react'
import { DEFAULT } from '@/lib/branding/email'

const EmailBrandContext = React.createContext(DEFAULT)

export function useEmailBrand() {
  return React.useContext(EmailBrandContext)
}
`

  it('catches the createContext call that broke the build', () => {
    expect(findReactCreateContextCalls(REGRESSED_SOURCE)).toEqual([
      { line: 5, callee: 'React.createContext', atModuleScope: true },
    ])
  })

  it('catches a named import and a lazy call, which fails at request time instead', () => {
    const source = `
import { createContext } from 'react'
let ctx
export function get() {
  ctx ??= createContext(null)
  return ctx
}
`
    expect(findReactCreateContextCalls(source)).toEqual([
      { line: 5, callee: 'createContext', atModuleScope: false },
    ])
  })

  it('does not mistake an unrelated createContext for the React one', () => {
    // `src/app/api/trpc/[trpc]/route.ts` passes a `createContext` OPTION to
    // tRPC; a name-matching guard would fail on it forever.
    const source = `
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCContext } from '@/server/trpc'

export function handler(req) {
  return fetchRequestHandler({ createContext: () => createTRPCContext({ req }) })
}
`
    expect(findReactCreateContextCalls(source)).toEqual([])
  })

  it('treats only a real prologue directive as the client boundary', () => {
    expect(isClientModule("'use client'\nexport const a = 1\n")).toBe(true)
    expect(isClientModule('"use client"\nexport const a = 1\n')).toBe(true)
    // A string that merely mentions it, after code has started, is not a
    // directive — and a module that only looks client-side would otherwise be
    // skipped by the walk.
    expect(isClientModule("export const a = 1\n'use client'\n")).toBe(false)
    expect(isClientModule("'use server'\nexport const a = 1\n")).toBe(false)
  })
})
