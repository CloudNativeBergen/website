import { defineConfig } from 'vitest/config'
import path from 'path'

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
    include: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    exclude: [
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
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      // SCOPED coverage gate: only the security-critical auth modules are
      // instrumented and gated. This deliberately keeps unrelated low-coverage
      // files OUT of the report so they can never fail the build. In Vitest 4
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
