import { defineConfig } from 'vitest/config'
import path from 'path'

const INCLUDE = ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)']

/** Tests that reassign `process.env.TZ` mid-run; see `projects` below. */
const TZ_MUTATING_TESTS = [
  '__tests__/lib/time.test.ts',
  '__tests__/lib/program/time-utils.test.ts',
]

const EXCLUDE = [
  'node_modules',
  '.next',
  'storybook-static',
  // Ignore copies of the suite living inside git worktrees (e.g. those
  // created under .claude/worktrees/*). Without this, the `**/__tests__/**`
  // include glob picks up stale duplicate suites and reports false failures.
  '**/worktrees/**',
  '.claude/worktrees/**',
  // Playwright e2e specs (e2e/*.spec.ts) are run by `pnpm test:e2e`, not
  // vitest; the `**/*.spec.ts` include glob would otherwise pick them up.
  'e2e/**',
]

export default defineConfig({
  // Redirect Vite's .env loading to a directory without .env files.
  // This prevents EPERM crashes in sandboxed/CI environments that can't
  // read root .env files. Secrets are injected via `fnox exec --` before
  // the process starts, so Vite's own env loading is not needed.
  envDir: './__tests__',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        // `server-only` is a Next.js bundler marker with no Node resolution;
        // stub it so server modules carrying the guard are unit-testable.
        find: /^server-only$/,
        replacement: path.resolve(__dirname, '__tests__/mocks/server-only.ts'),
      },
      {
        // Suite-wide, with no exclusion: every test that touches a JWT gets a
        // stub that ignores the key, so none of them prove a signature. The
        // real RS256/Ed25519 coverage overrides this alias per-file in
        // __tests__/lib/openbadges/jwt-real-crypto.test.ts (#866).
        find: 'jose',
        replacement: path.resolve(__dirname, '__tests__/mocks/jose.ts'),
      },
      {
        find: /^next-auth$/,
        replacement: path.resolve(__dirname, '__tests__/mocks/next-auth.ts'),
      },
      {
        find: /^next-sanity$/,
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/sanity-client.ts',
        ),
      },
      {
        find: '@sanity/image-url',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/sanity-image-url.ts',
        ),
      },
      {
        find: /^uuid$/,
        replacement: path.resolve(__dirname, '__tests__/mocks/uuid.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    // `include` lives on the projects, not here: `extends: true` CONCATENATES
    // arrays, so a root include would leak into the forks project and run the
    // whole suite twice.
    exclude: EXCLUDE,
    setupFiles: ['./vitest.setup.ts'],
    // Two pools. Vitest's phase breakdown for this suite is ~85% per-file
    // fixed cost (import, setup, environment) and ~15% test bodies, and a
    // worker THREAD pays far less of that than a forked process: the whole
    // suite ran 118s -> 84s locally on the switch. Threads have one hard
    // limit — `process.env.TZ` is read once per process, so a test that
    // mutates it at runtime silently sees the old zone. The two files that do
    // exactly that stay on `forks`; everything else runs on `threads`.
    // Root `exclude`/`coverage`/aliases apply to both via `extends: true`
    // (arrays concatenate, so each project's exclude ADDS to the root list).
    projects: [
      {
        extends: true,
        test: {
          name: 'threads',
          pool: 'threads',
          include: INCLUDE,
          exclude: [...TZ_MUTATING_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'forks-tz',
          pool: 'forks',
          include: TZ_MUTATING_TESTS,
        },
      },
    ],
    server: {
      deps: {
        // The inline-svg Studio plugin is externalized by default, which makes
        // Node load its CJS build — where `import styled from
        // 'styled-components'` resolves to the module namespace and `styled.div`
        // is not a function. Inlining makes Vite transform its ESM build, the
        // same one the Studio bundle uses. Needed by
        // `__tests__/sanity/realSchema.ts`, which takes the real `inlineSvg`
        // type off the plugin instead of stubbing it.
        inline: ['@starefossen/sanity-plugin-inline-svg-input'],
      },
    },
    // Vitest 5 flipped this default to `true`. Auto-clearing before every test
    // wipes call state recorded at module IMPORT time, and several suites reach
    // for exactly that: the `@sanity/image-url` alias mock hands out a chainable
    // builder that `src/lib/sanity/client.ts` constructs once on import, and the
    // tests recover it via `createImageUrlBuilder.mock.results[0]`. With
    // auto-clear on, that result is gone before the first test body runs and the
    // builder is unreachable. Suites that want a clean slate call `mockClear()`
    // in their own `beforeEach`, as those two do.
    clearMocks: false,
    coverage: {
      provider: 'v8',
      // SCOPED coverage gate: only the security-critical auth modules are
      // instrumented and gated. This deliberately keeps unrelated low-coverage
      // files OUT of the report so they can never fail the build. In Vitest 5
      // every file matching `include` is reported even if untested (so an
      // untested included file such as proxy.ts counts as 0, not dropped).
      include: [
        'src/lib/auth.ts',
        'src/lib/auth-link.ts',
        'src/lib/speaker/sanity.ts',
        'src/lib/profile/server.ts',
        'src/proxy.ts',
      ],
      // Per-file RATCHET thresholds, set a few points below the coverage
      // measured on 2026-07 so they lock in current coverage without being
      // flaky. Raise these as coverage improves; never lower them. Only these
      // globbed files are gated — there is no global threshold, so other files
      // are never checked. Run via `pnpm test:coverage`.
      thresholds: {
        'src/lib/auth.ts': {
          statements: 67,
          branches: 64,
          functions: 60,
          lines: 70,
        },
        // Covered by auth-link-abuse.test.ts (signLinkIntent/verifyLinkIntent
        // integrity, expiry, provider-binding, forgery) plus the jwt-callback
        // path. Measured ~98/93/83/98 on 2026-07; ratcheted up a few points.
        'src/lib/auth-link.ts': {
          statements: 92,
          branches: 88,
          functions: 80,
          lines: 92,
        },
        'src/lib/speaker/sanity.ts': {
          statements: 61,
          branches: 61,
          functions: 63,
          lines: 61,
        },
        'src/lib/profile/server.ts': {
          statements: 84,
          branches: 75,
          functions: 95,
          lines: 85,
        },
        // proxy.ts is covered by __tests__/lib/auth/proxy.test.ts (routing,
        // production dev-tools/impersonation guards, sign-in redirect, test-mode
        // bypass). Measured 100/~96/100/100 on 2026-07; ratcheted a few points
        // below to lock in coverage without flakiness.
        'src/proxy.ts': {
          statements: 95,
          branches: 90,
          functions: 90,
          lines: 95,
        },
      },
    },
  },
})
