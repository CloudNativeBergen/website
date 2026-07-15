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
        find: 'jose',
        replacement: path.resolve(__dirname, '__tests__/mocks/jose.ts'),
      },
      {
        find: '@noble/ed25519',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/noble-ed25519.ts',
        ),
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
        'src/lib/auth-link.ts': {
          statements: 85,
          branches: 83,
          functions: 80,
          lines: 85,
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
        // proxy.ts currently has no direct tests. Gate at 0 so it stays in the
        // report (surfacing the gap) without failing the build; raise once
        // tests are added.
        'src/proxy.ts': {
          statements: 0,
          branches: 0,
          functions: 0,
          lines: 0,
        },
      },
    },
  },
})
