/**
 * Vitest stub for the `server-only` marker module (issue #444).
 *
 * In the app, `import 'server-only'` resolves via Next.js to a module that
 * throws if imported into a client bundle. Vitest has no such bundler layer, so
 * we alias the bare specifier to this empty no-op module (see vitest.config.ts)
 * so server modules that carry the guard can still be unit-tested.
 */
export {}
